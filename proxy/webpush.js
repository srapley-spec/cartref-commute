// Web Push from a Cloudflare Worker with WebCrypto only (no libraries):
//   VAPID (RFC 8292): an ES256-signed JWT that says this server sent the push;
//   message encryption (RFC 8291, aes128gcm content coding from RFC 8188): only the phone that subscribed can read it.
// Used by proxy/push.js. Verified against the independent http_ece decoder (docs/stories/time-to-leave-alerts.md).

const enc = new TextEncoder();
export const b64u = {
  encode(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(str) {
    const s = String(str).replace(/-/g, "+").replace(/_/g, "/"), p = s + "===".slice((s.length + 3) % 4);
    const bin = atob(p), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const subtle = () => globalThis.crypto.subtle;

/** A P-256 public key (65 bytes, uncompressed) and its private scalar (32 bytes) as a JWK. */
function jwk(pubRaw, dRaw) {
  if (pubRaw.length !== 65 || pubRaw[0] !== 4) throw new Error("Not an uncompressed P-256 public key");
  const k = { kty: "EC", crv: "P-256", x: b64u.encode(pubRaw.slice(1, 33)), y: b64u.encode(pubRaw.slice(33, 65)), ext: true };
  if (dRaw) k.d = b64u.encode(dRaw);
  return k;
}

async function hkdf(salt, ikm, info, length) {
  const key = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/**
 * Encrypt `plaintext` (bytes) for a subscription's keys {p256dh, auth} (base64url).
 * `fixed` ({salt, asPublic, asPrivate}, raw bytes) is for tests only: real sends use a fresh key pair and salt.
 */
export async function encryptPayload(plaintext, keys, fixed) {
  const uaPublic = b64u.decode(keys.p256dh), authSecret = b64u.decode(keys.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("Bad subscription keys");
  let asPublic, asPrivateKey;
  if (fixed) {
    asPublic = fixed.asPublic;
    asPrivateKey = await subtle().importKey("jwk", jwk(fixed.asPublic, fixed.asPrivate), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  } else {
    const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPublic = new Uint8Array(await subtle().exportKey("raw", pair.publicKey));
    asPrivateKey = pair.privateKey;
  }
  const uaKey = await subtle().importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: uaKey }, asPrivateKey, 256));
  // RFC 8291 §3.4: IKM from the shared secret and the subscription's auth secret.
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = fixed ? fixed.salt : globalThis.crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  // One record: the message, then the last-record delimiter 0x02 (no padding).
  const key = await subtle().importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const rs = 4096, header = new Uint8Array(21);
  header.set(salt, 0); new DataView(header.buffer).setUint32(16, rs); header[20] = asPublic.length;
  return concat(header, asPublic, sealed);
}

/** The VAPID Authorization header for a push service endpoint (RFC 8292). Keys are base64url (raw). */
export async function vapidAuth(endpoint, { publicKey, privateKey, subject }, nowMs) {
  const pub = b64u.decode(publicKey), d = b64u.decode(privateKey);
  const key = await subtle().importKey("jwk", jwk(pub, d), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: subject })));
  const sig = new Uint8Array(await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64u.encode(sig)}, k=${publicKey}`;
}

/** Push services a subscription may point at (anything else is refused: the Worker never posts elsewhere). */
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^[a-z0-9-]+\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
export function validPushEndpoint(endpoint) {
  try { const u = new URL(endpoint); return u.protocol === "https:" && !u.port && PUSH_HOSTS.some(re => re.test(u.hostname)) && endpoint.length <= 1024; }
  catch (e) { return false; }
}

/**
 * Send one notification ({title, body, tag}) to a subscription {endpoint, keys}. Returns
 * {ok, gone, status}: gone = the push service says the subscription no longer exists (404/410).
 */
export async function sendPush(subscription, message, vapid, nowMs, ttlSec = 15 * 60) {
  if (!validPushEndpoint(subscription.endpoint)) return { ok: false, gone: true, status: 0 };
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), subscription.keys);
  let r;
  try {
    r = await fetch(subscription.endpoint, { method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(10000), headers: {
      Authorization: await vapidAuth(subscription.endpoint, vapid, nowMs), "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream", TTL: String(ttlSec), Urgency: "high" } });
  } catch (e) { return { ok: false, gone: false, status: 0 }; }
  return { ok: r.status >= 200 && r.status < 300, gone: r.status === 404 || r.status === 410, status: r.status };
}
