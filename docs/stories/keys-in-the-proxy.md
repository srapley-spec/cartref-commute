# Every key in the proxy: a new device needs only its address
Status: Done in code (4 Nov 2026); waiting for Sam's Worker deployment · Issues: #17

## Story
As the person setting the app up, when I add the app to another phone or give it to someone in the family, I want it
to need nothing but my proxy's address (no National Rail, TfL or Google keys typed in), so that setting up a device
takes one tap and no key ever sits on a phone.

## Where it came from
4 Nov, Sam, after #17: "Why don't we move all the APIs to Cloudflare? We seem to only have moved the Google API and
key", then: "I would like all the API keys moved so that deployment to other devices is easier." In fact National
Rail and Google could already go through the proxy, each by its own setting; TfL (Journey Planner, Tube arrivals, line
status, the most-used feed) always went from the phone with its key in the URL.

## Acceptance criteria
- **One choice:** Settings → National Rail → Source → **My proxy** sends every feed through the proxy:
  - National Rail boards and Service Details (`/board/…`, `/service/…`; [live-and-timetable](live-and-timetable.md));
  - TfL: every `https://api.tfl.gov.uk/…` request the app makes (timetable trains, Trip's planner, Tube arrivals, line
    and National Rail status, places, TrackerNet capture) goes to `<proxy>/tfl/…`, with **no `app_key` from the
    phone** even if one is still stored;
  - Google (Trip): the proxy's Places and Routes routes, whatever the separate Trip → Google choice says; the Maps JS
    library isn't loaded and no Google key is asked for.
  Other sources are unchanged (TfL direct, with the phone's key if set). Simulated feeds never reach the proxy.
  **My proxy without an address yet** keeps TfL direct (no relative `/tfl/` requests), as the rail source already
  falls back; a trailing slash on the address makes no `//tfl/`.
- **The Worker** forwards only the TfL paths the app uses: `Journey/JourneyResults/{from}/to/{to}`,
  `StopPoint/{id}/Arrivals`, `Line/{ids}/Status`, `Line/Mode/national-rail/Status`,
  `trackernet/PredictionDetailed/{line}/{station}` (anything else, a journey end containing an escaped `/` or `\`, or a
  query over 1,000 characters: 404 labelled `route`, never sent to TfL). It drops `app_key`/`app_id` in any spelling,
  adds its own `TFL_KEY` if set (without one TfL's anonymous limit applies, shared with Cloudflare's other customers on
  the same addresses, so `TFL_KEY` is in practice needed), replaces the key with `***` in TfL's reply (TfL's errors can
  quote the request), passes TfL's own statuses through (300 "which place?", 429), caches answers 60 s (journeys,
  line status) or 15 s (arrivals, TrackerNet) but never a 429 or 5xx, and keeps the origin check.
- **`GET /status`** says what the proxy is set up for, as true/false only (never a key): National Rail, Service
  Details, TfL key, Google, any station, alerts. The page asks once at start (with My proxy) and after the proxy's
  address changes (not on other saves), and keeps the answer with the address it came from: TfL counts as keyed (more
  timetable searches) only when the proxy in use now said it holds a key. On a new device the first refresh counts TfL
  as unkeyed; the next one uses the answer. A 404 (a Worker older than this page) says "Your proxy needs redeploying".
  Advice about TfL's limit says "add TFL_KEY to your proxy in Cloudflare", not the hidden Settings field.
- **Settings with My proxy:** no TfL key, Google choice or Google key fields. A status line: "Proxy: National Rail ✓ ·
  TfL ✓ keyed · Google ✗ · Alerts ✗. Still to set in Cloudflare: TfL key (TFL_KEY; …); Google for Trip (GOOGLE_KEY); …"
  (only what applies: any station only with Trip on, alerts only when they're on). Unreachable: "Couldn't reach your proxy (…). Check the
  address, and that its ALLOW_ORIGIN is this page's address." Keys left on the phone: "This phone still holds keys you
  can remove", and a **Remove keys stored on this phone** button (National Rail, Service Details, TfL, Google, Huxley).
- **Setup link for another device:** "Copy setup link for another device" shares or copies
  `<app address>#setup=<proxy origin>`. Opening it (at launch, or while the app is open) asks "Use <host> for all live
  data on this device? Only say yes if you set this proxy up or trust whoever sent the link: every train, TfL and
  Google request goes through it (including the places you plan between), and it decides the times you see." The host
  is the parsed one (punycode for look-alike letters). Yes: Source becomes My proxy with that origin, nothing else
  changes; the link stays in the address bar so "Add to Home Screen" next carries it, and a device already set up for
  that proxy isn't asked again. No: nothing changes and the link is cleared. Only a plain https host name is accepted,
  without asking: no other scheme, user name or password, IP address, port, path, query or backslash.

## Tests
- tests/proxy.test.mjs: "Proxy (TfL): only the app's TfL paths; the key is added here, never taken from the phone, and scrubbed from replies"
- tests/proxy.test.mjs: "Proxy: /status says what it's set up for, true or false only, never a key"
- tests/keys-in-proxy.test.mjs: "My proxy: every TfL request goes to the proxy's /tfl/ route, with no key from the phone, even if one is stored"
- tests/keys-in-proxy.test.mjs: "Other sources are unchanged: TfL direct with the phone's key; simulated feeds never reach the proxy"
- tests/keys-in-proxy.test.mjs: "Settings with My proxy: no key fields; what the proxy is set up for and what's still to set; remove keys from this phone"
- tests/keys-in-proxy.test.mjs: "Setup link: opening #setup=<proxy> asks, naming the host; yes sets up My proxy and keeps everything else; no changes nothing"
- tests/keys-in-proxy.test.mjs: "Setup link: an address that isn't a plain https host is refused without asking (look-alikes, userinfo, IPs, ports, paths)"
- tests/keys-in-proxy.test.mjs: "Setup link: a page opened from one asks at launch and starts on My proxy; a link arriving later (hashchange) is handled too"
- tests/keys-in-proxy.test.mjs: "My proxy without an address yet: TfL stays direct (no relative /tfl/ requests); a trailing slash makes no //tfl/"
- tests/keys-in-proxy.test.mjs: "TfL counts as keyed only when the proxy now in use said so; the advice points at the proxy, not a hidden field"
- tests/keys-in-proxy.test.mjs: "Settings save: a new proxy address asks /status once; an unrelated save doesn't; an old Worker (404) says redeploy"
- tests/trip-page.test.mjs: "Trip with My proxy as the source: TfL's planner and Google both go through the proxy, with no key from the phone"
- tests/keys-in-proxy.test.mjs: "Trip with My proxy: TfL's planner asks through the page's tflUrl (no key in the URL)"
- tests/keys-in-proxy.test.mjs: "Trip with My proxy: Google goes through the proxy too, so no Google key is asked for"

## Not yet / open questions
- Not verified against the deployed Worker or TfL itself from Cloudflare (no session has Cloudflare access): the TfL
  paths and caching are checked against the app's own request list in tests.
- iPhone: a Home Screen app may keep its own storage, separate from Safari's (unverified). If the Home Screen app
  doesn't start on My proxy after "Add to Home Screen" from the link, it asks again (the link is in its address) or the
  address can be pasted in its Settings.
- Each device still has its own Home location, Settings choices and Experimental switches; the setup link carries only
  the proxy's address.
- Anyone with the proxy's address and a faked Origin can use its keys' quota; a Cloudflare rate-limiting rule is
  recommended. Giving the app to people outside the family needs accounts (decisions log, 4 Nov).
