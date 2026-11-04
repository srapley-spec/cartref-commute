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
- **The Worker** forwards only the TfL paths the app uses: `Journey/JourneyResults/{from}/to/{to}`,
  `StopPoint/{id}/Arrivals`, `Line/{ids}/Status`, `Line/Mode/national-rail/Status`,
  `trackernet/PredictionDetailed/{line}/{station}` (anything else, or a query over 1,000 characters: 404 labelled
  `route`, never sent to TfL). It drops any `app_key`/`app_id` from the request, adds its own `TFL_KEY` if set
  (without one TfL's lower anonymous limit applies), replaces the key with `***` in TfL's reply (TfL's errors can quote
  the request), passes TfL's own statuses through (300 "which place?", 429), caches 60 s (journeys, line status) or
  15 s (arrivals, TrackerNet), and keeps the origin check.
- **`GET /status`** says what the proxy is set up for, as true/false only (never a key): National Rail, Service
  Details, TfL key, Google, any station, alerts. The page asks once at start (with My proxy) and after the proxy's
  address changes, and keeps the answer: TfL counts as keyed (more timetable searches) when the proxy holds a key.
- **Settings with My proxy:** no TfL key, Google choice or Google key fields. A status line: "Proxy: National Rail ✓ ·
  TfL ✓ keyed · Google ✗ · Alerts ✗. Still to set in Cloudflare: Google for Trip (GOOGLE_KEY); …" (only what applies:
  any station only with Trip on, alerts only when they're on). Unreachable: "Couldn't reach your proxy (…). Check the
  address, and that its ALLOW_ORIGIN is this page's address." Keys left on the phone: "This phone still holds keys you
  can remove", and a **Remove keys stored on this phone** button (National Rail, Service Details, TfL, Google, Huxley).
- **Setup link for another device:** "Copy setup link for another device" shares or copies
  `<app address>#setup=<proxy address>`. Opening it asks "Use <proxy> for all live data on this device? Train, TfL and
  Google requests (including the places you plan between) will go through it." Yes: Source becomes My proxy with that
  address, nothing else changes. No: nothing changes. Only a bare `https://host` is accepted (no path, no other
  scheme); the link is removed from the address bar either way.

## Tests
- tests/proxy.test.mjs: "Proxy (TfL): only the app's TfL paths; the key is added here, never taken from the phone, and scrubbed from replies"
- tests/proxy.test.mjs: "Proxy: /status says what it's set up for, true or false only, never a key"
- tests/keys-in-proxy.test.mjs: "My proxy: every TfL request goes to the proxy's /tfl/ route, with no key from the phone, even if one is stored"
- tests/keys-in-proxy.test.mjs: "Other sources are unchanged: TfL direct with the phone's key; simulated feeds never reach the proxy"
- tests/keys-in-proxy.test.mjs: "Settings with My proxy: no key fields; what the proxy is set up for and what's still to set; remove keys from this phone"
- tests/keys-in-proxy.test.mjs: "Setup link: opening #setup=<proxy> sets up this device for My proxy after a confirmation; refused or malformed changes nothing"
- tests/keys-in-proxy.test.mjs: "Trip with My proxy: TfL's planner asks through the page's tflUrl (no key in the URL)"
- tests/keys-in-proxy.test.mjs: "Trip with My proxy: Google goes through the proxy too, so no Google key is asked for"

## Not yet / open questions
- Not verified against the deployed Worker or TfL itself from Cloudflare (no session has Cloudflare access): the TfL
  paths and caching are checked against the app's own request list in tests.
- Each device still has its own Home location, Settings choices and Experimental switches; the setup link carries only
  the proxy's address.
- Anyone with the proxy's address and a faked Origin can use its keys' quota; a Cloudflare rate-limiting rule is
  recommended. Giving the app to people outside the family needs accounts (decisions log, 4 Nov).
