// Make a VAPID key pair for the proxy's push alerts (docs/proxy-setup.md). Run it yourself:
//   node tools/vapid-keys.mjs
// and paste the two values into the Worker's Secrets (Cloudflare dashboard). Never commit or share the private key.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const b64u = b => Buffer.from(b).toString("base64url");
console.log(`VAPID_PUBLIC_KEY=${b64u(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
