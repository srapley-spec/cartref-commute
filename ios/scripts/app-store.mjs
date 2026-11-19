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

// Apple's API or the runner's network sometimes drops one request while a build processes (19 Nov: build 14
// uploaded, then one poll failed with "fetch failed" and the release reported failure). A dropped poll, a timeout,
// HTTP 429 or a 5xx is retried until the deadline; Apple rejecting the build, refusing the key, or the run
// being cancelled (AbortError) is not.
export function transientAppStoreError(error) {
  if (typeof error?.status === 'number') return error.status === 429 || error.status >= 500;
  return error?.name === 'TypeError' || error?.name === 'TimeoutError';
}

export async function waitForBuild(client, number, { wait = delay, now = Date.now, limitMs = 30 * 60_000, log = console.log } = {}) {
  const deadline = now() + limitMs;
  let lastState = '';
  let dropped = 0;
  while (true) {
    let build;
    try {
      [build] = await client.builds(number);
    } catch (error) {
      if (!transientAppStoreError(error)) throw error;
      dropped++;
      log(`Build ${number}: App Store Connect didn't answer (${error.message}); trying again.`);
      if (now() >= deadline) throw new Error(`Timed out waiting for Apple to process build ${number} (${dropped} dropped checks). Check TestFlight before retrying.`);
      await wait(15_000);
      continue;
    }
    const state = build?.attributes.processingState || 'AWAITING_PROCESSING';
    if (state !== lastState) { log(`Build ${number}: ${state}`); lastState = state; }
    if (state === 'VALID') return state;
    if (state === 'FAILED' || state === 'INVALID') throw new Error(`Apple rejected processing build ${number}.`);
    if (now() >= deadline) throw new Error(`Timed out waiting for Apple to process build ${number}. Check TestFlight before retrying.`);
    await wait(15_000);
  }
}

export async function appStoreClient(env = process.env, cancellation) {
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
      signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(cancellation ? [cancellation] : [])]),
      headers: { Authorization: `Bearer ${message}.${signature}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      const error = new Error(`App Store Connect request failed: HTTP ${response.status} (${url.pathname}).`);
      error.status = response.status;
      throw error;
    }
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
      await waitForBuild(client, number);
    } else throw new Error('Expected check, next-number, or wait.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
