# An iPhone app you just download (assessment and plan, 17 Nov 2026)

Sam, 17 Nov: "I want to convert the app into a deployable iOS app and be really easy to set up — just download. So we
need to check that the web app supports that." His answers the same evening: for him and family/friends (TestFlight,
not the public App Store); he has an Apple Developer Program membership and a Mac with Xcode.

Status: **assessment done; the web app is being made ready (no setup, keys in the proxy); the iPhone app itself is
built by another agent** (Sam, 17 Nov: "I don't want you to build the app. Just get it ready. I'll get another agent to
build it."). Decisions for Sam are at the end; the brief for the building agent is "Brief for the agent building the
app". Story: [stories/ios-app.md](stories/ios-app.md).

## What "just download" needs, and where the app stands

| Needed | Today | Gap |
|---|---|---|
| No setup on a new phone | Settings asked for keys or a proxy address; a setup link carried the address | The proxy's address built into the app, the key settings removed (`stories/keys-in-the-proxy.md`, 17 Nov). Needs the proxy deployed first (`your-setup-steps.md`) |
| Runs as an app | A single self-contained `index.html` plus icons, `data/stations.json` and `sw.js`; a web manifest; works from the Home Screen | Wrap it in a native shell (below) |
| Live data from inside an app | Every feed goes through the proxy once Settings → Source is the proxy; the proxy only answers the page's own origin (`ALLOW_ORIGIN`) | None if the shell opens the live site (its origin stays `https://srapley-spec.github.io`). A bundled copy runs at `capacitor://localhost`, which would need adding to `ALLOW_ORIGIN` |
| Location | `navigator.geolocation.watchPosition`, foreground only | Works in iOS's web view with a usage string in Info.plist, but iOS's web view can ask again each launch. The native location plugin asks once; the page would use it when it finds itself inside the app |
| Alerts (time to leave, wake-up) | Web Push through `sw.js` and the proxy; on iPhone only for the Home Screen web app (iOS 16.4+) | **Web Push and service workers don't run in an app's web view.** Native notifications (Apple's push service, APNs) need an APNs key in the proxy and the native push plugin. Alerts are experimental and off by default, so this can come later |
| Share, copy | `navigator.share`, `navigator.clipboard` | Work in the web view |
| Screen edges | `viewport-fit=cover`, safe-area insets in the CSS | None |
| Saved settings and journey | `localStorage` | Kept by the app's web view between launches. A bundled copy and the live site are different origins, so neither sees the other's saved state |
| Updates | Every push to `main` is live at once (GitHub Pages) | Depends on the choice below |
| Google | Trip's "key in this browser" loaded Google's Maps JavaScript with a website-restricted key | Gone with the proxy: Places and Routes go through the Worker (`GOOGLE_KEY`) |

Confidence: high for the web-view limits (service workers, Web Push, the geolocation prompt), which are long-standing
iOS behaviour; not yet tried on Sam's phone.

## The shell: Capacitor
Capacitor (`@capacitor/core`, `@capacitor/ios`, 8.x in Nov 2026) wraps a web app in an iOS project with a web view,
and gives it native plugins (location, push) through the same page code. Two ways to point it at the app:

- **A. Open the live site** (`server.url = https://srapley-spec.github.io/cartref-commute/`). The app updates the moment
  `main` changes, as today. Same origin as the web app, so the proxy needs no change. Without a connection, a small
  page bundled in the app says so. Apple accepts this for TestFlight's beta review in practice; it can be refused for
  the public App Store (guideline 4.2, "minimum functionality"), which isn't wanted.
- **B. Bundle the page.** The app works offline at start, and every release is a new build uploaded to TestFlight.
  This needs a build per change, either from the Mac (Xcode → Archive → Upload) or a macOS GitHub Actions job with an
  App Store Connect API key. It also needs `capacitor://localhost` in the proxy's `ALLOW_ORIGIN`.

**Recommendation: A.** It keeps "main is live" and the release rules in CLAUDE.md as they are, and builds are rare: a
new one only when the native shell changes, and at least every 90 days, because TestFlight builds expire.

## TestFlight for family and friends
- An App Store Connect app record (bundle id, e.g. `uk.cartref.commute`), signed with Sam's team.
- **External testers** by public link (up to 10,000): the first build of each version goes through Beta App Review
  (usually a day or less). **Internal testers** need no review but must be App Store Connect users on his team (up to
  100).
- Each tester installs Apple's TestFlight app, opens the link, and taps Install. Nothing else to set up.
- Builds expire after 90 days: a reminder (or a scheduled build) keeps it installed.

## What this repo does, and what the building agent does
Done here (the web app, ready for any shell):
1. Proxy deployed and checked (`your-setup-steps.md` §1–3); its address built into the app; the key settings and the
   keys stored on devices removed (`stories/keys-in-the-proxy.md`). A fresh install shows live data with no settings.
2. This assessment, and the brief below.

For the agent building the app (in its own repo, or an `ios/` folder here if Sam says so):
3. The page noticing it runs inside the app (`window.Capacitor`): native location (one prompt), the app's version in
   Settings, no "Add to Home Screen" hints. Small page changes; they go through this repo's rules (CLAUDE.md).
4. The Capacitor project (option A), the offline page, Info.plist location text, icons from `icon-512.png`.
5. Sam on the Mac, once: open `ios/App/App.xcworkspace` in Xcode, choose his team, Product → Archive → Distribute →
   TestFlight; the external testing group and its public link.
6. Later, if wanted: native alerts (APNs key in the proxy, the push plugin, the proxy sending to Apple as well).

## Brief for the agent building the app
- The app is the live site: `https://srapley-spec.github.io/cartref-commute/` (GitHub Pages from `main` of
  `srapley-spec/cartref-commute`). Every push to `main` is live. Don't fork the page; change it here, under CLAUDE.md.
- All live data comes from the proxy built into the page (`docs/proxy-setup.md`); the proxy only answers requests from
  `ALLOW_ORIGIN` (`https://srapley-spec.github.io`). A shell that loads the live site needs nothing more. A bundled copy
  must add its origin (`capacitor://localhost`) to `ALLOW_ORIGIN` in `.github/workflows/deploy-proxy.yml`.
- No keys anywhere in the app or its repo: they live in GitHub's Actions secrets and the Worker.
- Location: `navigator.geolocation.watchPosition` today, foreground only, accuracy and age checked by the page
  (`docs/stories/follow-a-route.md`). Info.plist needs `NSLocationWhenInUseUsageDescription`.
- Alerts use Web Push (`sw.js`, `src/push-alerts.js`, `proxy/push.js`); they don't work inside the app until native push
  is added. They're experimental and off by default.
- Saved state is `localStorage` under `cartrefCommute.v1`; the shell's web view keeps it.
- Test on a real iPhone: the follow card, a refresh on the move, Trip with "Drive from", and the Settings status line
  (it should read National Rail ✓ · TfL ✓ · Google ✓).

## Decisions for Sam
1. Live site (A, recommended) or bundled (B).
2. Alerts in the iPhone app now (APNs) or later. They're experimental and off by default.
3. External testers by link (beta review) or internal testers (no review, but each one an App Store Connect user).
