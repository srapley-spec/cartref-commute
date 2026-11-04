# Setting up the proxy (Cloudflare Worker)

The proxy (`proxy/worker.js`) holds every key (National Rail, TfL, Google), so a phone or tablet needs only its
address ([keys-in-the-proxy](stories/keys-in-the-proxy.md)), and runs the time-to-leave and wake-up alerts while the
app is closed. **Your checklist of what's done and still to do: [your-setup-steps.md](your-setup-steps.md).** Stories: [live-and-timetable](stories/live-and-timetable.md) (boards, offsets,
Service Details), [time-to-leave-alerts](stories/time-to-leave-alerts.md), [Trip via the proxy](leisure-architecture.md#5-google-maps-js-now-proxy-later-one-adapter--a-setting).

Keys never go in the repo, chat or this file: they are set in the Cloudflare dashboard (or with `wrangler secret put`,
which asks for the value).

## Once
1. On your computer, in the repo: `npm ci && npm run build` (the Worker bundles the engine from `dist/core.mjs`).
2. `npx wrangler login` (opens Cloudflare in the browser).
3. Alerts' storage: `npx wrangler kv namespace create PUSH --config proxy/wrangler.toml`, and put the id it prints into
   `proxy/wrangler.toml` (`[[kv_namespaces]] id`). It's an identifier, not a secret.
4. Deploy: `npx wrangler deploy --config proxy/wrangler.toml`. It prints the Worker's address
   (`https://cartref-rail.<you>.workers.dev`). The Cron Trigger (every minute) comes from `proxy/wrangler.toml`.
5. Cloudflare dashboard → Workers & Pages → cartref-rail → Settings → Variables and Secrets:
   - `ALLOW_ORIGIN` (Text) `https://srapley-spec.github.io`
   - `RDM_BASE` (Text) the Live Departure Board endpoint base from the Rail Data Marketplace product page
   - `RDM_KEY` (Secret) its consumer key; `RDM_SD_KEY` (Secret) only if Service Details has its own key;
     `RDM_SD_BASE` (Text) only if its base differs from the default in `proxy/worker.js`
   - Alerts: run `node tools/vapid-keys.mjs` yourself and paste `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (both
     Secret); `VAPID_SUBJECT` (Text) `mailto:` and an address you choose (push services may use it to contact you).
   - `TFL_KEY` (Secret) your TfL app key (optional; without it TfL's lower anonymous limit applies).
   - Trip: `GOOGLE_KEY` (Secret; a server key restricted to Places API (New) and Routes API: a website restriction
     doesn't work for calls from the Worker), `ALLOW_ANY_STATION` (Text) `yes`.
6. On the phone (Home Screen app): Settings → National Rail → Source → My proxy, paste the address; Save. Reopen
   Settings: the status line says what the proxy is set up for and what's still missing. Then "Remove keys stored on
   this phone". Optional: Settings → Experimental → Time-to-leave alerts, Save, allow notifications: a test alert
   should arrive.
7. Another device: Settings → "Copy setup link for another device", open it there and confirm.

## After a change to `proxy/` or `src/core/`
`npm run build && npx wrangler deploy --config proxy/wrangler.toml`. Variables and secrets set in the dashboard are
kept (`keep_vars`).

## What it costs
Cloudflare's free plan covers it for one or a few phones: the cron runs 1,440 times a day; a board is fetched once a
minute only while a followed journey is within an hour of Leave by, plus three at the wake-up time; KV is written
only when something changes (free: 1,000 writes a day).
