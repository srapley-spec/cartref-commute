# Your setup steps (Sam)

What you need to do yourself, in order, for what's been built. Keep this file current: every change that needs a step
from Sam adds it here, and a step is ticked when Sam says it's done. Keys never go in this file, the repo or chat.
Detail for each step: [proxy-setup.md](proxy-setup.md).

Last updated: 17 Nov 2026 evening (proxy deployed; nothing to set up on a device; the iPhone app brief).

## 1–3. The proxy: every key in one place, deployed from GitHub (17 Nov; no computer needed)
Sam, 17 Nov: "I want to move all the keys to a proxy." The Worker (`proxy/`) has held every key since 4 Nov but was
never deployed (it needed a computer). Now a GitHub Action, **Deploy proxy** (`.github/workflows/deploy-proxy.yml`),
deploys it and copies the keys into it: the keys live only in GitHub's Actions secrets. All of this works on the iPad.

**A. Cloudflare (dash.cloudflare.com)**
- [x] Cloudflare account (Sam, 4 Nov)
- [x] (17 Nov: subdomain `s-rapley.workers.dev`, already set for cartref-borris) Workers & Pages: open it once. If it asks for a workers.dev subdomain, pick one (e.g. `srapley`); it becomes
      part of the proxy's address
- [x] Account ID: Workers & Pages → the right-hand panel, "Account ID" → copy
- [x] API token: profile icon (top right) → My Profile → API Tokens → **Create Token** → template **Edit Cloudflare
      Workers** → Use template. Account Resources: Include · your account. Zone Resources: Include · All zones (no zone
      is used). → Continue to summary → Create Token → copy it (shown once)

**B. GitHub (github.com/srapley-spec/cartref-commute → Settings → Secrets and variables → Actions → New repository
secret)**, one secret each, name exactly as written:
- [x] `CLOUDFLARE_API_TOKEN`: the token from A
- [x] `CLOUDFLARE_ACCOUNT_ID`: the Account ID from A
- [x] `RDM_KEY` and `RDM_BASE`: raildata.org.uk → your Live Departure Board subscription: its consumer key, and the
      endpoint base from its Specification (ends `/LDBWS/api/20220120`)
- [x] (17 Nov: `RDM_SD_KEY` added; the base is the default) `RDM_SD_KEY` and `RDM_SD_BASE`: only if your Service Details subscription has its own key or base
- [x] `TFL_KEY`: api-portal.tfl.gov.uk → Profile → your subscription's primary key
- [x] (17 Nov: "Cartref proxy (server)" in My First Project) `GOOGLE_KEY`: a **new** key for the proxy. console.cloud.google.com → APIs & Services → Credentials → Create
      credentials → API key → Edit it: Application restrictions **None**; API restrictions **Restrict key** → Places API
      (New) and Routes API → Save. (The key in the phone's Settings is restricted to the website, which Google refuses
      for calls from the Worker.)
- [ ] Optional, alerts: `VAPID_SUBJECT`: `mailto:` and an address you choose. The alerts' key pair is made by the
      Action itself, once
- Already in GitHub under the cloud session's names (`RDM_API_KEY`, `RDM_BASE_URL`, `RDM_SD_API_KEY`,
  `RDM_SD_BASE_URL`, `TFL_APP_KEY`)? Those are used too; no need to add them again.

**C. Deploy**
- [x] (17 Nov 20:3x: deployed to `https://cartref-rail.s-rapley.workers.dev`; status: National Rail, Service Details, TfL
      keyed, Google, any station ✓; alerts ✗ until `VAPID_SUBJECT` is added) Tell Claude it's done: Claude runs Deploy proxy (or: Actions → Deploy proxy → Run workflow) and reads back the
      proxy's address and what it's set up for (true/false only; no key is ever printed). After that it redeploys by
      itself whenever `proxy/` or `src/core/` changes on main
- [ ] Optional, recommended: Cloudflare → the Worker → Settings → a rate-limiting rule (anyone who learns its address
      can use it from outside a browser)

**D. The app:** the proxy's address is built in, and the key settings and stored keys are removed (17 Nov). Nothing
to do on a device.
- [ ] Before the Google Cloud free trial ends (about 30 Jan 2027, 74 days from 17 Nov): Google Cloud → **Upgrade**, so a
      card is on file. Within Google's monthly free allowance it costs nothing, but without a billing account the Google
      calls stop (Trip, and the walk and cab times)

## 4. Your phone and other devices
- [ ] After the "nothing to set up" release: open the app, Settings → Live data. The line should read
      "National Rail ✓ · TfL ✓ keyed · Google ✓ · Alerts ✗". Tell Claude what it says
- Another device: open `https://srapley-spec.github.io/cartref-commute/` (Share → Add to Home Screen). Nothing else

## 5. The display in Home Assistant (display mode)
- [ ] In a Home Assistant dashboard: Add card → **Webpage**. Address:
      `https://srapley-spec.github.io/cartref-commute/?display`. Pick the card's size (it scrolls if the list is
      longer than the card). Live times need nothing else since 17 Nov (the proxy is built in)
- [ ] Tell Claude how it looks at the card's size
- [ ] Check the usage limit on your Rail Data Marketplace subscription (raildata.org.uk → your Live Departure Board
      subscription → Specification) and tell Claude the figure. An always-on display asks for about 4,400 boards a
      day; Cloudflare (about 5% of the free 100,000 a day) and TfL (under 1 a minute of 500) are fine

## 6. The iPhone app: access and testing (17 Nov)
Brief: [ios-app.md](ios-app.md). Preparation record and implementation gates: [ios-readiness.md](ios-readiness.md).
- [x] Give the iOS agent the brief; read and reconciled with the released no-setup page on 17 November.
- [x] Confirm whether the APNs key file for `352Z6Z6469` exists. Sam confirmed secure possession on 17 November;
      reuse this key. Do not paste or upload its contents to chat.
- [x] Reuse the existing Apple team `TU7MLARY49` (Sam confirmed, 17 November).
- [x] At Sam's request, securely transferred **Cartref Commute CI** (`C8865Y2UMU`) to `ASC_API_KEY_P8`; protected
      backup retained outside the repo. Authentication verified. No further key entry is needed from Sam.
- [x] Found the existing APNs file through Cartref Home's setup notes; transferred it and its metadata to GitHub
      Actions secrets. Provisioned the distribution signing bundle/password/profile there too; signed export passed.
- [ ] Renew the iOS distribution certificate/profile before 17 November 2027; see `ios/README.md` for secret names.
- [x] Identify the intended internal testers: Sam supplied three family accounts on 17 November.
- [ ] Family accepts the App Store Connect account invitations, then joins Commute's internal TestFlight group.
- [x] Confirm the one tester address that differs from the Cartref Home list: Sam confirmed Gmail; the iCloud
      variant was incorrect. Commute's invitation was sent to the confirmed address.

The iOS agent verified Apple team `TU7MLARY49` and created Cartref Commute's App Store Connect record, app ID
`6836040622`, obtained API access and created the CI key with the Developer role. All three family account invitations
were sent with Marketing access limited to Commute. The internal
Family group is created with automatic distribution enabled and Sam enrolled. Builds are distributed internally
by the TestFlight workflow after the full main Tests run passes.
Sam authorized shell/pipeline work, now in progress on top of the green no-setup release (`af09273`).
Native journey features await released contracts. Apple review submission must wait until the app is working.

## After a change to `proxy/` or `src/core/`
Nothing: once B is done, Deploy proxy redeploys when such a change reaches main.

## Tell Claude when done
Say which steps are done (and any status line the phone shows); Claude ticks them here and checks what it can.
