// Alerts while the iPhone app is open (docs/stories/commute-watch.md). On 19 Nov the first test notification was
// accepted by Apple ("Sent") but never shown: Capacitor's bridge became the notification delegate after AppDelegate,
// and with no push handler it shows nothing in the foreground. Bundle and simulator checks can't prove delivery; this
// pins the configuration that decides it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("iPhone: alerts show while the app is open: AppDelegate is the notification delegate and Capacitor doesn't take it over", () => {
  const config = JSON.parse(readFileSync(new URL("../capacitor.config.json", import.meta.url), "utf8"));
  assert.equal(config.ios.handleApplicationNotifications, false, "Capacitor must not replace the app's notification delegate");
  const app = readFileSync(new URL("../ios/App/App/AppDelegate.swift", import.meta.url), "utf8");
  assert.match(app, /UNUserNotificationCenter\.current\(\)\.delegate = self/);
  assert.match(app, /willPresent[\s\S]*completionHandler\(\[\.banner, \.list, \.sound\]\)/);
});
