// App Store Connect operations for internal TestFlight only. Never submits for review.
import { readFile } from 'node:fs/promises';
import { sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export function nextBuildNumber(builds) {
  const numbers = builds.map(build => build.attributes.version);
  if (numbers.some(n => !/^\d+$/.test(n))) throw new Error('Existing build numbers require an explicit migration.');
  return String(numbers.reduce((max, n) => BigInt(n) > max ? BigInt(n) : max, 0n) + 1n);
}

export async function appStoreClient(env = process.env) {
  for (const key of ['ASC_KEY_PATH', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_APP_ID']) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  const key = await readFile(env.ASC_KEY_PATH);
  const base = 'https://api.appstoreconnect.apple.com';
  async function request(route, options = {}) {
    const url = new URL(route, base);
    if (url.origin !== base) throw new Error('Refusing to send Apple credentials to another origin.');
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: env.ASC_ISSUER_ID, iat: now - 10, exp: now + 300, aud: 'appstoreconnect-v1' })).toString('base64url');
    const message = `${header}.${claims}`;
    const signature = sign('sha256', Buffer.from(message), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const response = await fetch(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${message}.${signature}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`App Store Connect request failed: HTTP ${response.status} (${url.pathname}).`);
    return response.status === 204 ? null : response.json();
  }
  async function builds(version) {
    const params = new URLSearchParams({ 'filter[app]': env.ASC_APP_ID, limit: '200', sort: '-uploadedDate' });
    if (version) params.set('filter[version]', version);
    let next = `/v1/builds?${params}`;
    const all = [];
    while (next) {
      const result = await request(next);
      all.push(...result.data);
      next = result.links?.next;
    }
    return all;
  }
  return { request, builds, appId: env.ASC_APP_ID };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const client = await appStoreClient();
    const command = process.argv[2];
    if (command === 'check') {
      const app = await client.request(`/v1/apps/${client.appId}`);
      if (app.data.attributes.bundleId !== 'uk.cartref.srapley.commute') throw new Error('Wrong App Store Connect app.');
      console.log('App Store Connect authentication and Commute app identity verified.');
    } else if (command === 'next-number') {
      console.log(nextBuildNumber(await client.builds()));
    } else if (command === 'wait') {
      const number = process.argv[3];
      if (!/^\d+$/.test(number || '')) throw new Error('A numeric build number is required.');
      const deadline = Date.now() + 30 * 60_000;
      let lastState = '';
      while (true) {
        const [build] = await client.builds(number);
        const state = build?.attributes.processingState || 'AWAITING_PROCESSING';
        if (state !== lastState) { console.log(`Build ${number}: ${state}`); lastState = state; }
        if (state === 'VALID') break;
        if (state === 'FAILED' || state === 'INVALID') throw new Error(`Apple rejected processing build ${number}.`);
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for Apple to process build ${number}. Check TestFlight before retrying.`);
        await delay(15_000);
      }
    } else throw new Error('Expected check, next-number, or wait.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
