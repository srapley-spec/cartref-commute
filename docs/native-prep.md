# iPhone app prep: where the work stands (branch `feature/native-prep`)

Handoff note, 17 Nov 2026 22:00. **Fold this into `docs/ios-app.md` §8 and `docs/stories/ios-app.md`, then delete
it**, once `feature/no-setup` (which holds those two files) is on `main` and merged into this branch. The design is
`docs/ios-app.md` §6; this note says what is built against it and what changed from it.

## Built and tested (not merged)
- **Engine snapshot**, `src/core/snapshot.ts`: `journeySnapshot` (§6.1; adds `countdown.passed`), `COUNTDOWN_WORDS`
  (moved here from the page: the page still has its own copy, remove it when wiring), `leaveAlarm` (lead 0–60 min,
  default 5; cancelled once set off; dropped 2 min after a missed leave time), `proxySnapshot` (leave → platform once
  set off → train → walk-last; cancelled), `shiftSnapshot`, `snapshotShown` (what counts as a change),
  `evidenceSetOff`, `evidenceFix`. Tests: `tests/core/snapshot.test.mjs` (11).
- **Proxy**, `proxy/native.js`, wired in `proxy/worker.js` (`/native/*` routes; cron runs `runNative` beside
  `runAlerts`; `/status` gains `native`). Tests: `tests/native-proxy.test.mjs` (9), with a fake APNs.
- **Page bridge**, `src/native-bridge.js`: not yet in the build (`tools/build.mjs`) or the page. Tests:
  `tests/native-bridge.test.mjs` (5), with a fake `CommuteNative`.

## Changes from the design in `ios-app.md` §6 (update §6 to match)
- **The page talks to the proxy, not the shell.** The shell only hands over tokens as events: `apns {token, env}`
  and `liveActivity {followId, token}`. The page calls `/native/register` and `/native/follow` (it already does the
  same for web alerts). Less Swift, one place for the logic. `register(...)` in §6.2 goes.
- **New bridge call `configure({alarm, wifi})`**: the shell gets the alarm setting and the Wi-Fi name prefixes to
  classify networks. Capacitor calls take one object: `publish({snapshot})`, `cache({entries})`.
- **New proxy route `POST /native/evidence {id, token, evidence}`**: the shell posts a geofence crossing while the
  app is closed; leaving the start place's fence is set off (alarm cancelled on the next run).
- **Wi-Fi: joining a known network is a position; losing one is not set off** (a router restart would cancel an
  alarm still needed). Decision taken 17 Nov for Sam to confirm.
- **No "Leave in 5 min" alert when the leave alarm is on** (the alarm is the reminder); Leave alerts stop once set
  off. Cancelled / no-estimate alerts still go.
- **Not built:** `GET /native/next` (Siri, widget): needs planning in the proxy, about a day. The closed-app snapshot
  has no "next stop" yet (needs Service Details in the proxy, 2–3 h).
- APNs from a Cloudflare Worker is unproven until the first real push from a TestFlight build.

## Next, in order
1. Done 18 Nov: `main` merged in (with the iOS agent's work to cfbe4f0); `proxySnapshot` uses core `platformBy`.
   `docs/ios-app.md` and its story are now on this branch: fold this note into them.
2. Wire the bridge into the page: add `src/native-bridge.js` to the build; snapshot from the followed card (add
   `data-*` times to `journeyTimesMarkup`'s heading, read `#followPanel`), phase from the route, train from
   `lastTrain`; `followPlan()` = `C.leaveAlertPlan` + extras (names, margin, after-train time, `startPlace`,
   `setOff` from `followSetOffNow`); evidence via `C.evidenceFix` into `onPosition` and `C.evidenceSetOff` into set
   off; the page's `COUNTDOWN_WORDS` → `C.COUNTDOWN_WORDS`; Settings (leave alarm on/minutes, Wi-Fi prefixes "Panda",
   "Ciklum") shown only when the shell reports the capability. Page tests with a fake `CommuteNative`.
3. Deploy proxy: pass `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` from GitHub secrets;
   `your-setup-steps.md`: Sam adds the `.p8` (key 352Z6Z6469) as `APNS_KEY`.
4. Docs above; independent review (mutation testing) before merge; GitHub-wait path (saved settings, proxy).
