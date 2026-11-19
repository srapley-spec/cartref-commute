# The iPhone app: brief and design (17 Nov 2026)

This is the brief for the agent that builds the iPhone app, and the design both sides work to. It splits the work in
two. **This repo's agent** (the one that has built the web app, engine and proxy) owns the architecture, the engine,
the page and the proxy. **The iOS agent** owns everything Apple. The contracts between them are in §6. Read
`CLAUDE.md` first; it governs this repo, including any `ios/` folder.

Agreed with Sam on 17 Nov 2026. His words, for context: "I'm fine with it being a wrapper. That way the core code can
still be run in a browser. Only the iOS extensions should be added. We need clear rules to ensure that the logic
remains in the back end … any changes made by the iOS app are reflected in both unless they must be in the wrapper.
It is essential that the web version continues to be fully viable." And: "Major architectural changes, like moving
things to the proxy, I'd like you [this repo's agent] to do … Let the agent do all the Apple work."

Story: [stories/ios-app.md](stories/ios-app.md). Status of each part: §8.

## 1. Objective
Commute installs on an iPhone from TestFlight, works with nothing to set up, and adds what only an iPhone app can do:
- **a Live Activity** for the journey, on the lock screen and in the Dynamic Island;
- **a leave alarm** that cancels itself once you've left;
- **Siri**;
- **home/office Wi-Fi** as a location cue.

It stays useful in a not-spot: the last data stays on screen, with how old it is.

The web app stays the product, and stays complete. Home Assistant's display, and the hall iPhone until it gets its own
app, use it. Nothing in the web app may come to depend on the iPhone app.

## 2. Who it's for
- **Sam:** Commute, Leisure and Trip.
- **Laura**, when she goes to London.
- **Family:** they don't know the trains and want to get to London and back as quickly as possible, without waiting
  around. They travel only to and from Cartref, so they use Leisure (Cartref ⇄ London). Elsewhere, other apps serve
  them better.
- No profile set-up for other people: the app stays Sam's commute plus Leisure from Cartref.

## 3. Decisions (Sam, 17 Nov)
| Question | Decision |
|---|---|
| Shell | A wrapper (Capacitor). The web code runs unchanged in a browser; only iOS extensions are added |
| Live site or bundled | **Bundled.** It opens with no signal and shows the last data with its age. Every change to `main` builds a new TestFlight version automatically (no manual step) |
| Testers | App Store Connect users on Sam's team (internal testing; no beta review) |
| iOS version | **iOS 27 minimum** (everyone is on it) |
| Location while closed | Geofences only (home, office, the stations). In the foreground, tracking is exactly as today |
| Live Activity | One activity for the whole journey: leave countdown → walk → platform → on the train → tube → walk → arrived |
| Leave alarm | Warns **5 minutes** before leave time by default (changeable). Cancels itself when you've left, stop following or switch trains. Moves when the leave time moves |
| Widget | **Parked.** No planning in a widget; only if the proxy can keep it accurate. To discuss with Sam before building |
| Siri | Yes ("When do I need to leave?", "Follow the next train home") |
| Wi-Fi as a cue | Yes, configurable: home = networks starting **"Panda"** (Panda Mobile, Panda Net, Panda Legacy); office = **"Ciklum"** |
| The proxy | Keeps the followed journey and pushes updates to the app, the Live Activity and the alarm |
| Hall iPhone | A separate app later (it needs an alarm app), low priority. The web version serves it until then |

## 4. Who does what
**This repo's agent (Claude, in `srapley-spec/cartref-commute`):**
- the architecture, and keeping these docs and the stories current;
- the engine (`src/core`): everything that decides times, trains, states and wording, including the journey snapshot
  (§6.1);
- the page: the bridge to the shell (§6.2), the new Settings (§6.5), cached data and "as of" times in the web app;
- the proxy (`proxy/`, Deploy proxy): native device registration, watching followed journeys, polling the followed
  train's Service Details, pushing to the app / Live Activity / alarm through Apple's push service (APNs), the "next
  leave" answer for Siri, and the bundled app's origin in `ALLOW_ORIGIN` (§6.3, §6.4);
- tests for all of the above, and releasing them under CLAUDE.md.

**The iOS agent:**
- **all Apple work:** identifiers and capabilities, the App Group, the APNs key, signing, the App Store Connect app
  record, internal testers, TestFlight;
- the Capacitor project in `ios/` in this repo, with the bundled copy of the built `index.html` and its files;
- a native plugin implementing the bridge contract (§6.2) exactly;
- the Live Activity, the AlarmKit alarm, geofences, Wi-Fi network reading, App Intents (Siri), and the offline store;
- a GitHub Actions job (macOS) that builds and uploads a TestFlight version when `main` changes;
- the iOS parts of these docs (§7, §8) and an `ios/README.md`.

Something the iOS agent needs from the page, engine or proxy is asked of this repo's agent, not built in Swift: an issue
labelled `ios-contract`, or a note to Sam. If the contract has to change, the change is made here first, with tests.

**Done before the iOS agent starts** (17 Nov), which it should reuse:
- App ID `uk.cartref.srapley.commute`, with Push Notifications, App Groups, Access Wi-Fi Information, Time Sensitive
  Notifications and Siri;
- App Group `group.uk.cartref.srapley.commute`;
- the team's existing APNs key "Cartref App" (team-scoped, all topics, sandbox and production; key ID `352Z6Z6469`). Sam
  confirms he has its `.p8` file, or the iOS agent makes a new key.

The iOS agent created the App Store Connect record on 17 November: **Cartref Commute**, app ID `6836040622`.
Internal Family group and account invitations are prepared. The existing APNs key was found and securely provisioned;
see [ios-readiness.md](ios-readiness.md) for signing, access and review constraints.

## 5. Rules
1. **No journey logic in Swift.** Times, ranking, which train, "set off", "missed", countdown words and labels all come
   from the engine (`src/core`), which runs in the page and in the proxy. Swift draws what it's given: the journey
   snapshot (§6.1). If a native surface needs a fact the snapshot lacks, the snapshot gains a field here; the shell
   doesn't work it out.
2. **One code base for the screen.** The bundled app is the same built `index.html` as the website; no fork, no
   iOS-only copy of a screen. Page changes go into `src/` under CLAUDE.md (story, tests, docs check) and reach both.
3. **The web app stays complete.** Every feature works in a browser, or is absent there without leaving a gap. The page
   checks the shell's capabilities before using one (§6.2) and does nothing without them. The web tests gate `main` as
   now.
4. **Native-only means only what a web page can't do:** Live Activity, alarms, geofences while closed, APNs, the Wi-Fi
   network name, Siri, the offline store, the app icon and launch screen.
5. **Keys stay out of the app and the repo.** The app talks only to the proxy (its address is built into the page). The
   APNs key goes into GitHub's Actions secrets, and Deploy proxy puts it into the Worker. The app holds none.
6. **Contracts are versioned.** Snapshot, bridge and push messages carry `v`. A shell that doesn't know a version
   ignores what it doesn't understand, and the page never assumes a capability the shell hasn't reported.
7. **Stale data says so.** Anything shown from the cache carries the time it was fetched ("as of 08:14"). The engine
   already marks data older than 3 minutes as stale; the shell shows that mark, never a fresh-looking time.

## 6. Design

```
                ┌──────────── engine (src/core, TypeScript) ────────────┐
                │  plans, follows, presents; builds the journey snapshot│
                └───────────────┬───────────────────────┬───────────────┘
                                │                       │
          page (index.html: web + bundled)       proxy (Cloudflare Worker)
          draws; fetches through the proxy;      holds keys; fetches feeds; watches
          publishes snapshots to the shell       followed journeys; pushes via APNs
                                │                       │
                     ┌──────────┴───────────┐           │ APNs
                     │ iOS shell (Capacitor)│◄──────────┘
                     │ Live Activity · alarm│
                     │ geofences · Wi-Fi    │
                     │ Siri · offline store │
                     └──────────────────────┘
```

While the app is open, the page runs the engine and publishes each new snapshot to the shell. While it's closed, the
proxy runs the same engine on the followed journey and sends the same snapshot through APNs. The shell draws whichever
is newest (`at`).

### 6.1 The journey snapshot (v1)
Built by the engine (`journeySnapshot(...)` in `src/core`, pure). The same function runs in the page and in the proxy.
Times are epoch milliseconds; text is final, ready to show.

```json
{
  "v": 1, "at": 1794942000000, "source": "page",
  "dataAt": 1794941950000, "stale": false,
  "mode": "commute", "direction": "home", "followId": "f_…",
  "phase": "leave | walk | platform | train | tube | walk-last | arrived | missed | cancelled",
  "headline": { "label": "Be on platform 4 at Farringdon by", "t": 1794943500000,
                "countdown": { "step": "platform", "calm": "on the platform in", "urgent": "Head for the platform now" } },
  "arrive": { "label": "At home", "t": 1794947400000 },
  "train": { "name": "18:56 Thameslink", "from": "Farringdon", "to": "Letchworth", "platform": "4",
             "scheduled": 1794943000000, "expected": 1794943420000, "late": 7 },
  "progress": { "next": "St Pancras", "stopsToGo": 3, "line": "Next: St Pancras · 3 stops" },
  "step": { "text": "Get on the Met to Aldgate", "detail": "eastbound · Platform 2 · due 08:20" },
  "status": { "level": "warn", "text": "7 min late" },
  "alarm": { "at": 1794943200000, "leadMin": 5, "cancelled": false },
  "deepLink": "commute://follow/f_…"
}
```

`headline` is exactly what the page's journey card shows on the left (Leave by / Be on platform… by / At King's Cross
/ Next tube), with the same countdown words (`COUNTDOWN_WORDS`). `alarm` is the leave alarm the shell should have
scheduled: absent if there's none, `cancelled` once you've left. `step` (added 19 Nov, #57 H29; optional, so still v1)
is what to do next in the page's own words, drawn under the countdown; `null` when the headline and train already say
it. Once you're off the train, `train` and `status` are `null`. The shell schedules, moves or cancels its alarm to
match the newest snapshot. It never decides any of these itself.

### 6.2 Page ⇄ shell bridge
A Capacitor plugin named `CommuteNative`. The page reaches it only through `src/native-bridge.js`, which does nothing
in a browser.

From the page to the shell:
- `capabilities() → { v, liveActivity, alarm, geofence, wifi, siri, offline, appVersion }`
- `publish(snapshot)`: after each render that changes the snapshot; `null` when nothing is followed.
- `register({ proxy, followId })`: hands over what the shell needs to register with the proxy (§6.3). Sent when
  following starts or changes.
- `cache(entries)`: the last boards, status and snapshot, each with `dataAt`, kept for a launch with no signal.

From the shell to the page (as events):
- `wifi { kind: "home" | "office" | "other" | "none" }`, classified by the shell from the configured prefixes. The
  name itself isn't passed.
- `region { id: "home" | "office" | "<CRS>", event: "exit" | "enter", at }`, from geofences.
- `resume { at }`: the app came to the foreground; the page refreshes.
- `cached(entries)`: on launch, what the shell kept, before the first fetch.

The page treats `wifi` and `region` as location evidence through the engine, exactly like a GPS fix with its accuracy
and age rules. The rules live in `src/core`.

### 6.3 The proxy's native routes (built by this repo's agent)
- `POST /native/register { apnsToken, env: "sandbox" | "production", laToken?, followId?, prefs: { alarmLeadMin } }`
  → `{ id, token }`. Like `/push/subscribe`, it's allowlisted and validated field by field.
- `POST /native/follow { id, token, plan }`: the followed journey, the same plan shape the web alerts send today.
- `POST /native/unfollow { id, token }`
- The proxy's cron re-plans followed journeys with the engine and pushes the new snapshot when something the shell
  shows changes: the alarm time, a delay or cancellation, the platform, or the phase (from Service Details). Live
  Activity updates go to `laToken`; a background push refreshes the alarm and cache. Notifications (delay, platform
  announced, your stop is next) are alerts with the same wording as the page.
- `GET /native/next?direction=home|office` → `{ v, leave, train, arrive, dataAt }`, for Siri and any future widget.
  Computed by the engine; nothing in Swift.
- `ALLOW_ORIGIN` gains the bundled app's origin (`capacitor://localhost`).

APNs auth uses token-based JWTs (ES256) from `APNS_KEY` (the `.p8` contents), `APNS_KEY_ID`, `APNS_TEAM_ID` and
`APNS_TOPIC` (`uk.cartref.srapley.commute`). These are GitHub Actions secrets, put into the Worker by Deploy proxy.

### 6.4 The offline store
The shell keeps what the page hands it (`cache`) in the App Group container, and hands it back on launch (`cached`).
The page draws from it with the "as of" time and the engine's stale marking, then refreshes. The Live Activity and the
alarm keep working from the newest snapshot without the page.

### 6.5 New Settings (in the shared page; shown only when the shell reports the capability)
- **Leave alarm:** on/off; minutes before leave (default 5).
- **Wi-Fi:** home network names begin with (default "Panda"); office network names begin with (default "Ciklum").

### 6.7 The v1 contract (18 Nov; answers to issue #58, decisions A–C by Sam)
This supersedes §6.2–6.3 where they differ. Fixtures under `tests/fixtures/native/` (to be generated) are binding.

1. **Bridge v1.** Every call takes one object and returns a Promise; errors reject `{code, message}`; an unknown `v`
   rejects `code: "unsupported"`. Page → shell: `capabilities()` → `{v:1, liveActivity, alarm, geofence, wifi, siri,
   offline, appVersion, auth:{location:"always"|"whenInUse"|"denied"|"notDetermined", notifications:"granted"|"denied"|
   "notDetermined", alarm:"granted"|"denied"|"notDetermined"}}` (`alarm` is AlarmKit's own authorization, #58 18 Nov); `ready()`; `publish({snapshot|null})`; `configure({...})`; `cache({entries})`; `cached()` →
   `{entries}`; `request({permission:"notifications"|"alarm"|"location"})` (Settings asks in that order). Shell → page events: `apns {token, env}`,
   `liveActivity {followId, token}`, `wifi {place, at}`, `region {place, event:"enter"|"exit", at}`, `resume {at}`.
   Location events use `place`. **Replay:** until `ready()`, the shell holds the latest `apns`, the latest
   `liveActivity` per `followId` and the last 20 `wifi`/`region` events, and sends them on `ready()`.
2. **Credentials and geofences.** The page registers with the proxy. `configure` carries `proxy {origin}`, `device {id,
   token}|null` (shell keeps it in Keychain), `alarm {alarm, alarmLeadMin}`, `wifi {home[], office[]}`, and `regions
   [{place, lat, lon, radiusM}]` (home and office, 150 m, only while the alarm is on). Sent again when Settings or home
   change. Swift copies no profile data. **Home** (#58, 18 Nov): the home region exists only once home is saved, with
   Settings → Home → "Home is where I am now" at home; a fresh install has the office region only, and Settings →
   iPhone app says leaving home can't cancel the alarm until home is set. There is no automatic home (from Wi-Fi or
   GPS) in v1; setting home sends `configure` with the new region at once. Joining a known Wi-Fi network is a position at that place (core
   `evidenceFix`); losing one is not set off (a router restart would cancel an alarm still needed; Sam may overrule).
   Deploy proxy passes `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` (names to be confirmed by the iOS agent
   on #58).
3. **Alarm cancellation offline.** The snapshot's `alarm` gains `cancelOnExit: "home"|"office"|null`: on that region's
   exit after `snapshot.at`, the shell cancels the alarm locally (an engine-stated rule), then posts `/native/evidence`
   (queued until online), whose reply now carries `{ok, setOff, snapshot}`. Acceptance: notifications denied → no
   alarm, Settings says so; an alarm time already passed → not scheduled; force-quit → region monitoring still wakes
   the app; late pushes → rule 5.
4. **Lifecycle, all modes (Sam, decision A: Trip included in v1).** Commute, Leisure and Trip. Trip's snapshot comes
   from Trip's own following engine (page side: the Trip follow card; proxy side: a Trip plan through the same
   `/native/follow`, any station allowed by `ALLOW_ANY_STATION`). The snapshot gains `confirmed: boolean`: the proxy
   never confirms boarding (after departure: "should be on the 18:56", `confirmed:false`); only the page's boarding
   check sets it. Fixtures per phase and mode: leave, platform, train, tube, walk-last, arrived, missed, cancelled,
   switch, stop.
5. **Ordering, expiry, tokens, freshness.** The shell applies a snapshot only for the current `followId` and with
   `at` ≥ the last applied (equal: the later received wins). A null snapshot or a Live Activity `end` tombstones that
   `followId` for 1 h. **A remote stop is always identified and dated** (#58, 18 Nov): the background push that ends a
   journey is `{aps:{"content-available":1}, snapshot:null, followId, at}` (fixture `apns-background-stop.json`), and a
   `/native/evidence` reply with no journey is `{ok, setOff:false, snapshot:null, followId, at}` naming the journey that
   last ended (both null if none ever did). The shell applies a remote stop only to that `followId`; a local
   `publish({snapshot:null})` means the current journey. A new `liveActivity` token replaces the old (page → proxy). Freshness: the snapshot carries
   `staleAt = dataAt + 3 min`; the Live Activity's stale-date is `staleAt` (not +5 min); the shell shows age from
   `dataAt` so it ages without pushes. `snapshotShown` includes `followId`, progress, staleness and a 2-minute
   bucket of `dataAt`, so fresh data is re-sent at least every 2 minutes and the stale-date never passes while the
   data is fresh. **Countdowns are engine-chosen** (#58, 18 Nov): `headline.countdown` carries `state` ("calm" | "urgent"
   | "passed" at `at`), `urgentAt` and `passedAt`. Render "<calm> <time left>" until `urgentAt`, "<urgent> · <time
   left>" after it (strictly under 2 minutes, `COUNTDOWN_URGENT_MS`, as the page), and `passed` from `passedAt` (nothing
   when `passed` is empty). The time left is the system timer to `headline.t`, clamped at zero. **v1 limit (agreed on
   #58, 18 Nov):** a Live Activity can't change its words by itself at `urgentAt`/`passedAt`, so it renders the
   `state` of the last content update; the timer keeps running offline and the wording stays as last received until
   the next update. `countdown.state` is part of `snapshotShown`, so the page and the proxy (while watching, every
   minute) send an update when it turns urgent or passed. A re-send of fresher data alone goes to the Live Activity at priority 5 with no background push
   (Apple budgets those); a real change goes at priority 10 with the background push. Live Activity tokens are kept
   per `followId`; only the current journey's is sent.
6. **Siri (Sam, decision B: open the app).** "When do I need to leave?" answers from the last snapshot while following.
   Without a followed journey, and for "Follow the next train home", Siri opens the app (deep link
   `commute://next?direction=home`) and the page plans and follows. `/native/next` is not in v1.
7. **Offline cache.** Entries `{key, v, dataAt, savedAt, value}`, keys `snapshot`, `boards`, `status`, `settings`;
   replace by key; 512 KB total; opaque to the shell. **`dataAt: null` means the data's age is unknown** (a snapshot
   with no fetch time): kept and returned as null, never replaced by `savedAt` (#58, 18 Nov; native 9ce934f). A followed
   Trip's `dataAt` is Trip's own: the oldest successful fetch of the boards it's watched on, or null while any has never
   loaded; never the clock, never the commute's fetch time (#58 6983061034).
   **Every batch names all four keys** (the store merges by key, so a key left out would keep its old value): the page
   writes them most important first (snapshot, settings, status, boards) on each new snapshot and each live board;
   anything with nothing to keep (a stopped journey) or that would take the total past 512 KB goes as an explicit
   clear `{key, v:1, dataAt:null, savedAt, value:null}`. Sizes are counted as stored: UTF-8 of the JSON with each `/`
   counted twice (Swift writes `\/`) (`nativeBridge.packCache`, `cacheBytes`). Settings are restored only to a device
   whose own settings were lost; the registration is never in them (Keychain). **Startup:** in the app the page fetches,
   publishes and syncs nothing until `cached()` has returned and been applied; a `resume` (or a timer) that comes
   first waits for it; a browser starts as before. The order in `init` is: `capabilities()`, listeners, `cached()` and
   apply (Settings may come back), `configure` (from the Settings that will be used), `ready()` and its replay, then
   `/native/register` and `/native/follow`. Tokens replayed or sent before that are kept and used then.
8. **Permissions and simulation (Sam, decision C: ask for Always).** Built 18 Nov: Settings → iPhone app lists
   notifications, alarms and location with their reported state ("Allowed", "Not asked yet", "While using the app
   only…", "Refused: change it in the iPhone's Settings → Commute"); turning the leave alarm on (the first save with it
   on) asks, in order, for each not yet asked (location again from While-in-use to Always); a button asks again for
   what can still be asked; refusals aren't re-asked. Supported vs allowed are separate fields. Settings
   asks for notifications and then "Always" location (with the reason) when the leave alarm is first turned on, via
   `request`; refusals are shown. Geofences use region monitoring only, never continuous background tracking; with
   "When in use" the alarm still works but doesn't cancel itself while the app is closed. In a simulation the page
   never publishes, registers, caches or syncs.

Built on this side (18 Nov, `feature/native-prep`): `ready`/`cached`/`request` in the bridge, `configure` with proxy,
device and regions, `cancelOnExit`, `confirmed`, `staleAt` (and the Live Activity stale-date from it), the evidence reply
with the snapshot, `snapshotShown` with journey/progress/boarding, and boards/status kept for offline launch. Also built
(18 Nov): Trip snapshots (page: the Trip follow card; proxy: core `tripNativePlan`), the fixtures in
`tests/fixtures/native/`, and the deep link (shell event `open {url}`; `commute://next?direction=home&follow=1`).
Independent review (18 Nov, 86 mutations): its four bugs are fixed and tested (a late cancellation undone; the stale-date
not moved on; Live Activity tokens not kept per journey; a Trip starting with a tube claiming the tube's platform
allowance and start), plus: nothing registers in a simulation, the evidence reply gives the journey's set-off state,
a full list of 10 iPhones frees one idle for 30 days, Siri's link doesn't take over a followed Trip. Fixtures now include the page's own phases (walk, tube, missed, switched, urgent, arrived, stopped = null) and Trip
(leave, platform). Not yet: a Trip with changes gets no door
arrival from the proxy (only the page knows the onward rides).

## 7. Testing
- **This repo's agent:** engine tests for the snapshot (every phase; stale data; alarm present, moved and cancelled);
  page tests for the bridge, with a fake `CommuteNative`; proxy tests for the native routes, the scheduler and APNs
  payloads (with a fake APNs).
- **The iOS agent:** the shell against those contracts, using recorded snapshots from the engine tests; then a real
  iPhone:
  - a followed morning journey with the app closed (Live Activity phases, the alarm warning, cancelled by leaving home);
  - a refresh in a not-spot (cached data with its age);
  - Siri;
  - the Wi-Fi cue at home and at the office;
  - Settings.

Current shell checks: [stories/ios-shell.md](stories/ios-shell.md). A real WKWebView offline launch and a signed
internal-only export have passed locally; Apple package validation returned no errors. Independent review caught all 20 deliberate breakages.
Full combined-code CI, GitHub validation and internal TestFlight processing remain release gates. These checks do not claim the native journey features are built.

## 8. Status (update as each part ships)
| Part | Owner | Status |
|---|---|---|
| Keys in the proxy; nothing to set up on a device | this repo | Released 17 Nov at `af09273`; Tests, Pages and Deploy proxy green |
| Journey snapshot in the engine | this repo | Released 18 Nov at `9628132` (independently reviewed); identified stops and the alarm permission added after #58 |
| Page bridge (`src/native-bridge.js`), new Settings, cache hand-off | this repo | Released 18 Nov at `9628132`; permission requests, snapshot/settings cache entries and the 512 KB limit on `feature/native-countdown` |
| Proxy native routes, APNs, journey watching, Service Details polling, `/native/next` | this repo | Routes, APNs and closed-app snapshots released 18 Nov at `9628132`; unproven against Apple until the first TestFlight push; Service Details polling and `/native/next` not in v1 |
| Bundled app origin in `ALLOW_ORIGIN` | this repo | Released with no-setup; live HTTP 200/CORS verified for `capacitor://localhost` |
| Apple identifiers, App Group, APNs key | iOS agent | Registered and App Group associated; existing APNs key and metadata provisioned in Actions secrets, 17 Nov |
| Capacitor shell and TestFlight pipeline | iOS agent | Released: main builds automatically reach internal TestFlight. Native extension signing changes are in draft PR #61 |
| Native plugin and App Group offline store | iOS agent | Implemented and under integration in PR #61; ordered state/cache/bridge tests and independent review pass |
| Live Activity, alarm, geofences, Wi-Fi, Siri | iOS agent | Implemented on `codex/ios-native-v1`; Apple adapters attached, countdown fields/rendering integrated against `eea5846` fixtures. Release awaits owner countdown merge/wording agreement, Settings/cache wiring and final native review/CI; real-device acceptance follows internal TestFlight; see [native story](stories/ios-native.md) |
| Widget | (parked) | To discuss with Sam |

## 9. Open questions
- Widget: what it shows, and whether the proxy can keep it accurate enough (parked by Sam).
- Snapshot/bridge/native-route alignment and missing lifecycle details: [ios-contract #58](https://github.com/srapley-spec/cartref-commute/issues/58). The existing APNs file has been located and provisioned; no replacement key needed.
- The hall iPhone app: separate, later.
