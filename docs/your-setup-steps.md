# Your setup steps (Sam)

What you need to do yourself, in order, for what's been built. Keep this file current: every change that needs a step
from Sam adds it here, and a step is ticked when Sam says it's done. Keys never go in this file, the repo or chat.
Detail for each step: [proxy-setup.md](proxy-setup.md).

Last updated: 4 Nov 2026 (every key in the proxy; time-to-leave alerts; #17).

## 1. The Cloudflare Worker (once)
- [x] Cloudflare account (Sam, 4 Nov)
- [ ] On your computer, in the repo: `npm ci && npm run build`
- [ ] `npx wrangler login`
- [ ] `npx wrangler kv namespace create PUSH --config proxy/wrangler.toml`; put the id it prints into
      `proxy/wrangler.toml` (`[[kv_namespaces]] id`; it's an identifier, not a secret) and commit it, or tell Claude
      the id and Claude commits it
- [ ] `npx wrangler deploy --config proxy/wrangler.toml`; note the address it prints
      (`https://cartref-rail.<you>.workers.dev`)

## 2. The Worker's settings (Cloudflare dashboard → Workers & Pages → cartref-rail → Settings → Variables and Secrets)
- [ ] `ALLOW_ORIGIN` (Text): `https://srapley-spec.github.io`
- [ ] `RDM_BASE` (Text): the Live Departure Board endpoint base from the Rail Data Marketplace product page
- [ ] `RDM_KEY` (Secret): its consumer key
- [ ] `RDM_SD_KEY` (Secret): only if Service Details has its own key
- [ ] `TFL_KEY` (Secret): your TfL app key (api-portal.tfl.gov.uk). Needed in practice: without it the Worker shares
      TfL's anonymous limit with Cloudflare's other customers
- [ ] **`GOOGLE_KEY` (Secret): your Google Maps key.** Not done yet (Sam, 4 Nov). In Google Cloud, a key used by
      the Worker can't be restricted by website; restrict it to Places API (New) and Routes API instead. The existing
      browser key is website-restricted, so a second, server key is usual
- [ ] `ALLOW_ANY_STATION` (Text): `yes` (Trip's rides anywhere in Great Britain)
- [ ] Alerts: run `node tools/vapid-keys.mjs` on your computer; paste `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
      (both Secret); `VAPID_SUBJECT` (Text): `mailto:` and an address you choose
- [ ] Optional, recommended: a Cloudflare rate-limiting rule on the Worker (anyone who learns its address can use it)

## 3. Your phone (the Home Screen app)
- [ ] Settings → National Rail → Source → My proxy; paste the Worker's address; Save
- [ ] Settings again: the status line should read "National Rail ✓ · TfL ✓ keyed · Google ✓ · Alerts ✓". Anything ✗ is
      listed with the setting still to add
- [ ] Settings → Remove keys stored on this phone
- [ ] Optional: Settings → Experimental → Time-to-leave alerts (needs Follow a route); Save; allow notifications; a
      test alert should arrive

## 4. Another device
- [ ] On your phone: Settings → Copy setup link for another device. On the other device open the link in the browser
      and say yes; on iPhone then Share → Add to Home Screen, open Commute from the Home Screen, and say yes again if
      it asks (alerts on iPhone need the Home Screen app)

## After a change to `proxy/` or `src/core/`
- [ ] Redeploy: `npm run build && npx wrangler deploy --config proxy/wrangler.toml` (Claude says in the report when
      a change needs this)

## Tell Claude when done
Say which steps are done (and any status line the phone shows); Claude ticks them here and checks what it can.
