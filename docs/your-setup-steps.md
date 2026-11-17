# Your setup steps (Sam)

What you need to do yourself, in order, for what's been built. Keep this file current: every change that needs a step
from Sam adds it here, and a step is ticked when Sam says it's done. Keys never go in this file, the repo or chat.
Detail for each step: [proxy-setup.md](proxy-setup.md).

Last updated: 17 Nov 2026 (the proxy deployed from GitHub; every key in GitHub's secrets).

## 1–3. The proxy: every key in one place, deployed from GitHub (17 Nov; no computer needed)
Sam, 17 Nov: "I want to move all the keys to a proxy." The Worker (`proxy/`) has held every key since 4 Nov but was
never deployed (it needed a computer). Now a GitHub Action, **Deploy proxy** (`.github/workflows/deploy-proxy.yml`),
deploys it and copies the keys into it: the keys live only in GitHub's Actions secrets. All of this works on the iPad.

**A. Cloudflare (dash.cloudflare.com)**
- [x] Cloudflare account (Sam, 4 Nov)
- [ ] Workers & Pages: open it once. If it asks for a workers.dev subdomain, pick one (e.g. `srapley`); it becomes
      part of the proxy's address
- [ ] Account ID: Workers & Pages → the right-hand panel, "Account ID" → copy
- [ ] API token: profile icon (top right) → My Profile → API Tokens → **Create Token** → template **Edit Cloudflare
      Workers** → Use template. Account Resources: Include · your account. Zone Resources: Include · All zones (no zone
      is used). → Continue to summary → Create Token → copy it (shown once)

**B. GitHub (github.com/srapley-spec/cartref-commute → Settings → Secrets and variables → Actions → New repository
secret)**, one secret each, name exactly as written:
- [ ] `CLOUDFLARE_API_TOKEN`: the token from A
- [ ] `CLOUDFLARE_ACCOUNT_ID`: the Account ID from A
- [ ] `RDM_KEY` and `RDM_BASE`: raildata.org.uk → your Live Departure Board subscription: its consumer key, and the
      endpoint base from its Specification (ends `/LDBWS/api/20220120`)
- [ ] `RDM_SD_KEY` and `RDM_SD_BASE`: only if your Service Details subscription has its own key or base
- [ ] `TFL_KEY`: api-portal.tfl.gov.uk → Profile → your subscription's primary key
- [ ] `GOOGLE_KEY`: a **new** key for the proxy. console.cloud.google.com → APIs & Services → Credentials → Create
      credentials → API key → Edit it: Application restrictions **None**; API restrictions **Restrict key** → Places API
      (New) and Routes API → Save. (The key in the phone's Settings is restricted to the website, which Google refuses
      for calls from the Worker.)
- [ ] Optional, alerts: `VAPID_SUBJECT`: `mailto:` and an address you choose. The alerts' key pair is made by the
      Action itself, once
- Already in GitHub under the cloud session's names (`RDM_API_KEY`, `RDM_BASE_URL`, `RDM_SD_API_KEY`,
  `RDM_SD_BASE_URL`, `TFL_APP_KEY`)? Those are used too; no need to add them again.

**C. Deploy**
- [ ] Tell Claude it's done: Claude runs Deploy proxy (or: Actions → Deploy proxy → Run workflow) and reads back the
      proxy's address and what it's set up for (true/false only; no key is ever printed). After that it redeploys by
      itself whenever `proxy/` or `src/core/` changes on main
- [ ] Optional, recommended: Cloudflare → the Worker → Settings → a rate-limiting rule (anyone who learns its address
      can use it from outside a browser)

**D. The app (after C)**: Claude builds the proxy's address into the app, so every device uses it with no settings
at all, then removes the key fields and other sources from Settings and the keys stored on each device.

## 4. Another device
- [ ] On your phone: Settings → Copy setup link for another device. On the other device open the link in the browser
      and say yes; on iPhone then Share → Add to Home Screen, open Commute from the Home Screen, and say yes again if
      it asks (alerts on iPhone need the Home Screen app)

## 5. The display in Home Assistant (display mode)
- [ ] In a Home Assistant dashboard: Add card → **Webpage**. Address:
      `https://srapley-spec.github.io/cartref-commute/?display`. Pick the card's size (it scrolls if the list is
      longer than the card)
- [ ] For live times (needs sections 1–2 done): on your phone, Settings → Copy setup link for another device. The
      link ends `#setup=…`. Put `?display` before the `#` and use that as the card's address:
      `https://srapley-spec.github.io/cartref-commute/?display#setup=…`. The card then asks once, on the page, whether
      to use your proxy; tap **Yes, use it**. Without this the card shows timetable times, marked "not live"
- [ ] Tell Claude how it looks at the card's size, and whether it asks again after Home Assistant restarts
- [ ] Check the usage limit on your Rail Data Marketplace subscription (raildata.org.uk → your Live Departure Board
      subscription → Specification) and tell Claude the figure. An always-on display asks for about 4,400 boards a
      day; Cloudflare (about 5% of the free 100,000 a day) and TfL (under 1 a minute of 500) are fine

## iOS access preparation (17 Nov; before implementation)
Preparation record and implementation gates: [ios-readiness.md](ios-readiness.md). This section must be reconciled
with the no-setup branch's iPhone checklist when that release lands; the other agent owns the proxy checklist above.
- [ ] Confirm whether the APNs key file for `352Z6Z6469` exists. Do not paste or upload its contents to chat.
- [ ] Download **Cartref Commute CI** (key ID `C8865Y2UMU`) from App Store Connect → Users and Access → Integrations
      → App Store Connect API. Keep a secure backup; enter its contents directly in GitHub → this repository →
      Settings → Secrets and variables → Actions as `ASC_API_KEY_P8`. Do not paste the file into chat.
- [ ] Provision the APNs and archive-signing credentials directly in GitHub Actions secrets when their setup is
      ready. Never put private keys in the repo or logs.
- [ ] Identify the intended internal testers and anyone still needing App Store Connect access.

The iOS agent verified Apple team `TU7MLARY49` and created Cartref Commute's App Store Connect record, app ID
`6836040622`, obtained API access and created the CI key with the Developer role. No build or tester invitation
has been sent. Implementation waits for the no-setup release.

## After a change to `proxy/` or `src/core/`
Nothing: once B is done, Deploy proxy redeploys when such a change reaches main.

## Tell Claude when done
Say which steps are done (and any status line the phone shows); Claude ticks them here and checks what it can.
