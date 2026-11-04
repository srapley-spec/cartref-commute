# Time-to-leave and wake-up alerts
Status: Behind toggle (Settings → Experimental, off by default) · Since: 4 Nov 2026 · Issues: #17 (needs the proxy), #3, #4 (native follow-ons)

## Story
As a commuter, when I've chosen the journey I'm aiming for and put the phone away, I want a notification shortly
before I must leave (and again if the train is delayed or cancelled), and on a weekday morning a warning when I wake
if the trains I'd take are disrupted, so that I don't have to keep opening the app to know when to go.

## Where it came from
4 Nov, Sam, on what the new Cloudflare account could do: "time to leave push notification", and then: "There should
also be a warning when I wake up if the trains on my commute are delayed." Leave by is the core product answer
(`CLAUDE.md`); until now it was only visible with the app open. A web app can't run in the background on iPhone, so
the watching is done by the proxy (a Cloudflare Worker with a Cron Trigger every minute) and delivered as Web Push.

Sam didn't answer the design questions (which journeys, when, toggle, deploy), so the recommended defaults were
taken and are listed here for him to change: followed journeys only (not a fixed schedule), 5 min before Leave by
plus changes and cancellations, a weekday wake-up check at 06:30, behind an Experimental setting, deployed by Sam
with Wrangler (no GitHub Action yet).

## Acceptance criteria
### Turning it on (the phone)
- Settings → Experimental → "Time-to-leave alerts", **off by default**. Off: no service worker, no permission prompt,
  no request to `/push/…`; the app works exactly as before.
- On needs My proxy's URL (Settings → National Rail → Source → My proxy). Without it the status line says so and
  nothing is asked or sent. Without push support (iPhone: only the Home Screen app, iOS 16.4+) it says so.
- Notification permission is asked **inside the Save tap**, before anything is awaited (iPhone only prompts from a
  tap); already granted: no prompt. Refused: the status says where to allow it; nothing is subscribed.
- Then: register `sw.js` (shows notifications only, opens the app when tapped; no fetch handler, caches nothing),
  subscribe with the proxy's VAPID key, `POST /push/subscribe` with the wake-up check, keep the returned id and token
  in `saved.pushAlerts`, and send a test alert ("Alerts are on"). "Send a test alert" sends another.
- Changing the wake-up time updates the same phone; a new proxy URL, or Save with no saved id, subscribes again.
  Turning it off: `POST /push/unsubscribe`, the phone's push subscription is dropped and the service worker
  unregistered, `saved.pushAlerts` removed.
- What it last said is kept (`saved.pushAlertsStatus`) and shown when Settings is reopened (Settings closes on Save).
- The proxy answering 403 to a plan (it no longer knows this phone: subscription expired or removed) drops the ids and
  says "Alerts stopped… Open Settings and Save to turn them on again"; a 400 (e.g. a station the proxy doesn't allow)
  isn't retried; other failures are retried after 1 min.

### A followed journey (needs Follow a route, Experimental)
- The page hands the proxy the engine's plan (`leaveAlertPlan`) for the followed journey **only before its train**
  (phase `before-train`, no incident, a train that isn't cancelled, a Leave by no later than the train). The plan's
  lead is the route's own time before the train (`dep − leaveBy` from the followed option: walk, Tube, fast walk if
  that's its level); Leave by moves with the train's latest expected departure; the lead doesn't.
- It is posted only when it changes: a new Follow, Leave by moved to a different minute, the train caught (plan none),
  Follow stopped. Not on every render. A failed post is retried no sooner than 1 min later. **Never during a
  simulation** (simulated feeds, GPS simulation, or a simulation session).
- The proxy checks the plan's train on a fresh live board from **60 min before Leave by**, every minute, until the plan
  ends (and never more than 3 h after its planned departure). The train is found by service ID, else the same
  scheduled time and operator.
- **5 min before Leave by** (≤ 5 min left; up to 1 min after Leave by if the scheduler ran late): one alert,
  "Leave in 5 min · by 18:22" / "Leave now · by 18:22", "For the 18:48 from King's Cross (on time)" — or
  "(N min late)", "(delayed, no estimate)", "(no live times: timetable)": an unknown is said, never hidden.
- After it, **Leave by moving 2 min or more** (either way, from the last alerted one) alerts again: "Leave later · by
  18:25", "The 18:48 from King's Cross is now expected 18:51 (3 min late)." Under 2 min: quiet.
- **Cancelled** (any time while watching): "18:48 cancelled", "…Open the app for another train.", once; the plan ends.
  **Delayed with no estimate** after the first alert: said once.
- **Only evidence moves Leave by.** With no fresh estimate (the board failed, the train isn't on it, "Delayed"), the
  last live departure seen stands (said "(N min late, last known)"; never seen: the plan's, "(no live times:
  timetable)"). So a blip never ends the plan, never says "Leave earlier", and never undoes a "Leave later".
- A move is checked before the end: a train back on time after a "Leave later" says **"Leave now · by 18:22"** even when
  that Leave by has just passed; then the plan ends.
- The plan ends 1 min after Leave by (no more alerts), on a cancellation, or 3 h after the planned departure.
- "Delayed, no estimate" (Follow's `unknown` incident) keeps the plan; cancelled, missed or boarding ends it.

### The wake-up warning
- Weekdays (Mon–Fri) at the chosen time (default 06:30, London time), once a day; a scheduler run up to 10 min late
  still sends it, never later.
- Boards: home to each London station (Letchworth → King's Cross, Farringdon, St Pancras: profile data), trains leaving
  in the next 120 min, plus a train "Delayed" with no estimate due up to 30 min before (it may still be waiting; a
  cancelled one already due isn't counted). Warned: cancelled, delayed with no estimate, or late by the app's amber threshold (5 min, the
  disruption policy's `warnMin`, departure or arrival). A train on two boards (Thameslink to Farringdon and St Pancras)
  is said once. "Commute: 2 trains disrupted" · "07:08 to King's Cross cancelled; 07:21 to Farringdon 9 min late." At
  most four listed, then "and N more".
- **Nothing wrong: no alert.** No board answered at all: "Couldn't check your morning trains" (silence must mean nothing
  is wrong, not that it couldn't look).

### The proxy
- Routes (origin-checked): `GET /push/key`, `POST /push/subscribe | plan | test | unsubscribe`. Off unless configured
  (KV binding `PUSH`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`): 500 says what to set.
- A subscription's endpoint must be https on a known push service (Apple, Google, Mozilla, Microsoft), no port: the
  Worker never posts anywhere else. At most 10 phones. The token is stored only as a SHA-256 hash; plan, test and
  unsubscribe need it (else 403). Plans and wake-up configs are re-checked field by field (stations on the allowlist
  unless `ALLOW_ANY_STATION`, times, sizes, lead consistent with Leave by within 1 min, departure within −1 h…+24 h);
  only their own fields are stored.
- Messages are encrypted for the phone (RFC 8291, aes128gcm) and VAPID-signed (RFC 8292, ES256, 12 h expiry), TTL
  15 min, Urgency high. A push service answering 404/410 makes the proxy forget that phone.
- KV is written only when something changed (free tier: 1,000 writes a day), and **before** a notice is sent: if the
  write fails nothing is sent, so no notice repeats every minute. The write re-reads the record and keeps a plan or
  wake-up time the page changed during the run. Each phone is handled on its own: one failing never stops the rest.
- Subscribe refuses keys that aren't a real P-256 point or a 16-byte auth secret. `/push/plan` takes one change per
  phone per 10 s (429 otherwise). Pushes don't follow redirects.
- The service worker shows a notice identical to the one already showing silently (no second buzz), so a repeat
  (e.g. a stale KV read) is quiet. The engine works in local time and a
  Worker's local time is UTC, so the scheduler runs the engine in London time (shifted by London's offset) and stores
  real instants.

## Tests
- tests/core/alerts.test.mjs: "Leave alert plan: from a followed journey before its train; the lead is the route's own time before the train"
- tests/core/alerts.test.mjs: "Leave alert: one alert 5 min before Leave by, again when Leave by moves 2 min or more, and once on a cancellation"
- tests/core/alerts.test.mjs: "Leave alert: a late scheduler still says Leave now within a minute; after that, and after Leave by, the plan ends"
- tests/core/alerts.test.mjs: "Leave alert: no live times or no estimate are said, never hidden; the board's train is found by ID, else time and operator"
- tests/core/alerts.test.mjs: "Wake-up check: weekdays at the chosen time (up to 10 min late), once a day"
- tests/core/alerts.test.mjs: "Wake-up warning: only when a morning train is cancelled, has no estimate or is 5+ min late; a train on two boards said once"
- tests/core/alerts.test.mjs: "Wake-up warning: when no board answered, it says it couldn't check (silence means nothing wrong)"
- tests/core/alerts.test.mjs: "Leave alert: no fresh estimate (board failed, train missing, \"Delayed\") keeps the last live departure: no silent end, no flip-flop"
- tests/core/alerts.test.mjs: "Leave alert: a train back on time after a Leave later still says Leave now, even when the new Leave by has passed"
- tests/core/alerts.test.mjs: "Leave alert plan: Leave by may equal the departure; without leaveBy the walking leave; 'Delayed' keeps the plan; 1 min late is said"
- tests/core/alerts.test.mjs: "Wake-up warning: trains up to 120 min ahead; a train 'Delayed' with no estimate due shortly before still counts; a cancelled one gone doesn't"
- tests/push.test.mjs: "Web Push: RFC 8291's worked example encrypts byte for byte; VAPID is ES256-signed for the push service's origin"
- tests/push.test.mjs: "Push routes: off until configured; origin-checked; a phone subscribes and gets an id and a token stored only as a hash"
- tests/push.test.mjs: "Push routes: a plan or test needs the phone's token; only well-formed plans for the allowed stations are kept"
- tests/push.test.mjs: "Scheduler: the followed 18:48 is watched with the app closed: Leave in 5 min at 18:17, Leave later when it runs late; KV written only on a change"
- tests/push.test.mjs: "Scheduler: a weekday wake-up warning for disrupted morning trains, once; nothing on a good morning; a gone phone is forgotten"
- tests/push.test.mjs: "Scheduler in summer on a UTC machine (Cloudflare's): board times and the alert are London time"
- tests/push.test.mjs: "Scheduler: if the state can't be written, nothing is sent (no repeat every minute); one broken phone doesn't stop the others"
- tests/push.test.mjs: "Push routes: keys that aren't a real P-256 point or a 16-byte secret are refused; plans are rate-limited; VAPID_SUBJECT is required"
- tests/push.test.mjs: "Push routes: each bad field of a plan or wake-up config is refused on its own"
- tests/push.test.mjs: "Scheduler: a 404 from the push service forgets the phone; an expired plan is cleared; a plan the page changed mid-run is kept"
- tests/push.test.mjs: "Scheduler on a UTC machine in summer: the wake-up check and the start of watching are London time"
- tests/push-alerts.test.mjs: "Alerts on: permission is asked first, inside the Save tap; then the phone subscribes through the proxy and a test alert is sent"
- tests/push-alerts.test.mjs: "Alerts on: refused permission, no proxy, or no push support says why and subscribes nothing"
- tests/push-alerts.test.mjs: "Followed journey: the plan is posted when it changes (Leave by moved a minute, Follow stopped), not on every render; never in a simulation"
- tests/push-alerts.test.mjs: "Followed journey: a failed post is retried after a minute, not on every render"
- tests/push-alerts.test.mjs: "Alerts off: the proxy forgets the phone and the push subscription is dropped; a new wake-up time updates the same phone"
- tests/push-alerts.test.mjs: "Page: time-to-leave alerts are off by default, in Settings → Experimental, and make no requests"
- tests/push-alerts.test.mjs: "Followed journey: retried at a minute, not before; the proxy forgetting the phone (403) stops and says so; a refused plan (400) isn't retried"
- tests/push-alerts.test.mjs: "Page: with alerts on, following a journey hands the proxy its plan once; simulated feeds or GPS simulation hand over nothing"

Encryption was also checked outside the repo (4 Nov) against the independent `http_ece` 1.2.0 decoder (decrypts both
the RFC example and a fresh message) and the VAPID signature with Node's own ECDSA verify.

## Not yet / open questions
- **Not verified on a real iPhone or a deployed Worker**: no session has Cloudflare access. First check after Sam
  deploys: Settings → turn on → the test alert arrives on the lock screen; then follow a journey and leave the app.
- Trip mode's followed journeys (`followTrip`) don't hand over a plan yet.
- A fixed schedule without Follow (e.g. "weekday evenings, the best option's Leave by") would need the planner and
  the routes running in the Worker: the bigger step, not started.
- The wake-up check is for the journey to the office only (home → London); the days are Mon–Fri, not configurable.
- Laura or anyone else: the proxy accepts up to 10 phones, but the wake-up stations come from the profile on the
  page, and there are no accounts. Giving the app to others needs accounts and quotas (see the decisions log).
- Deploying from GitHub (an Action with a Cloudflare API token) is offered, not built.
- Known limits from the independent review (4 Nov), accepted for a one-person, Experimental feature:
  - Workers KV is eventually consistent and cron runs can overlap (10 phones × 10 s timeouts): a minute's run can read
    state from before the last write and send a notice again. The service worker makes an identical repeat silent;
    a Durable Object would remove it.
  - The Origin check can be faked by a non-browser client: anyone with the Worker's address can fill the 10 phone
    slots (never expired) or spend upstream quota. A Cloudflare rate-limiting rule is recommended; a shared secret and
    expiry of idle phones are not built.
  - Two subscribes at the same moment can lose one from the phone list (read-modify-write).
  - No `pushsubscriptionchange` handler: when the browser rotates the subscription, the proxy forgets the phone at the
    next send (404/410) and the page says so at its next plan post; Save turns it back on.
  - Changing alerts during a simulation session isn't saved (as with every setting then), so the ids can drift from
    the proxy; the 403 handling above recovers.
