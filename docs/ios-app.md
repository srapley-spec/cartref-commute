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
  "status": { "level": "warn", "text": "7 min late" },
  "alarm": { "at": 1794943200000, "leadMin": 5, "cancelled": false },
  "deepLink": "commute://follow/f_…"
}
```

`headline` is exactly what the page's journey card shows on the left (Leave by / Be on platform… by / At King's Cross
/ Next tube), with the same countdown words (`COUNTDOWN_WORDS`). `alarm` is the leave alarm the shell should have
scheduled: absent if there's none, `cancelled` once you've left. The shell schedules, moves or cancels its alarm to
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
| Journey snapshot in the engine | this repo | Not started |
| Page bridge (`src/native-bridge.js`), new Settings, cache hand-off | this repo | Not started |
| Proxy native routes, APNs, journey watching, Service Details polling, `/native/next` | this repo | Not released; draft on `feature/native-prep`, contract questions in #58 |
| Bundled app origin in `ALLOW_ORIGIN` | this repo | Released with no-setup; live HTTP 200/CORS verified for `capacitor://localhost` |
| Apple identifiers, App Group, APNs key | iOS agent | Registered and App Group associated; existing APNs key and metadata provisioned in Actions secrets, 17 Nov |
| Capacitor shell and TestFlight pipeline | iOS agent | Implemented on iOS branch; signed export and Apple validation pass; combined release checks in progress |
| Native plugin and App Group offline store | iOS agent | Waiting for released page/snapshot contracts and issue #58 |
| Live Activity, alarm, geofences, Wi-Fi, Siri | iOS agent | Not started |
| Widget | (parked) | To discuss with Sam |

## 9. Open questions
- Widget: what it shows, and whether the proxy can keep it accurate enough (parked by Sam).
- Snapshot/bridge/native-route alignment and missing lifecycle details: [ios-contract #58](https://github.com/srapley-spec/cartref-commute/issues/58). The existing APNs file has been located and provisioned; no replacement key needed.
- The hall iPhone app: separate, later.
