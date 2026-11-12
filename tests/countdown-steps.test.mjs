// The countdown runs to the time on the left, the start of your next step, in that step's words (Sam, 12 Nov: "the
// countdown should be to the start of the next step. Eg time to Leave, time to platform"; the countdown journey page).
// And "Be on the platform by" once you've set off, in Commute and Leisure alike (Sam, 12 Nov: "all the changes we're
// making apply to all modes unless you can identify a reason not to").
// Stories: docs/stories/follow-a-route.md ("Clean baseline"), docs/stories/effort-levels.md.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, closeAll, IN_LONDON, sleep } from "./harness.mjs";
after(closeAll);

const MIN = 60e3;
const morning = Date.parse("2026-11-03T07:00:00Z"), evening = Date.parse("2026-11-03T18:00:00Z");
const HOME = [51.9752, -0.2402];
const squash = (s) => s.replace(/\s+/g, " ").trim();
async function demo(now, saved, geo) { return createApp({ now, saved, geo, settings: { provider: "demo", followRoute: true } }); }
function follow(a, pick = (o) => o.effort === "walk") {
  const entry = [...a.c.followChoices].find(([, o]) => pick(o)); assert.ok(entry, "a followable journey");
  [...a.d.querySelectorAll("[data-follow]:not([disabled])")].find((b) => b.dataset.follow === entry[0]).click();
  return JSON.parse(JSON.stringify(a.c.state.saved.followRoute));
}
function at(a, now, here) { a.setNow(now); Object.assign(a.c.state, { here, lastFixAt: now, lastFixRecvAt: now, locAcc: 12, locStatus: "ok", atHub: null, onLine: false, boardsAt: now }); a.c.render(); }
const head = (a) => a.d.querySelector("#followPanel .journey-heading");
const cd = (a) => head(a)?.querySelector("[data-cd]");

test("The countdown names its step: leave, platform, arrival, next; in the last 2 minutes a band in the same words", async () => {
  const a = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office" }, geo: null, now: morning });
  // The rule, drawn by the page's own tick on a header of each kind.
  const box = a.d.createElement("div"); a.d.body.append(box);
  const cases = [["leave", 4 * MIN + 20e3, "leave in 4m 20s"], ["platform", 6 * MIN + 10e3, "on the platform in 6m 10s"],
    ["arrive", 12 * MIN, "arrives in 12m 00s"], ["next", 3 * MIN + 5e3, "in 3m 05s"],
    ["leave", 45e3, "Leave now · 45 s"], ["platform", 45e3, "Head for the platform now · 45 s"], ["arrive", 90e3, "Arriving · 1m 30s"], ["next", 45e3, "Now · 45 s"],
    ["leave", -1, "leave time passed"], ["platform", -1, "platform time passed"], ["arrive", -1, ""]];
  box.innerHTML = cases.map(([step, ms], i) => `<div class="journey-countdown"><span id="c${i}" data-cd="${a.w.Date.now() + ms}" data-step="${step}"></span></div>`).join("");
  a.c.render();
  cases.forEach(([step, ms, want], i) => {
    const e = a.d.getElementById(`c${i}`);
    assert.equal(e.textContent, want, `${step} ${ms}`);
    assert.equal(e.parentElement.classList.contains("urgent"), ms > 0 && ms < 120e3);
  });
  assert.deepEqual(a.errors, []); a.close();
});

test("Commute: at home Leave by counts down to leaving; once set off 'Be on the platform by' counts down to the platform; aboard, to the arrival", async () => {
  const a = await demo(morning, { dirMode: "office", home: HOME }, null), r = follow(a);
  at(a, morning + MIN, HOME);
  assert.match(squash(head(a).textContent), /Leave by/); assert.equal(cd(a)?.dataset.step, "leave");
  const st = a.w.CommuteCore.profiles.samCommute.stationGeo.LET;
  at(a, morning + 2 * MIN, [(HOME[0] + st[0]) / 2, (HOME[1] + st[1]) / 2]);
  assert.match(squash(head(a).textContent), /Be on the platform by/); assert.equal(cd(a)?.dataset.step, "platform");
  assert.match(cd(a).textContent, /^(on the platform in|Head for the platform now · )/);
  // Aboard: "At King's Cross 08:08" counts down to the arrival.
  a.c.state.saved.followRoute.phase = "on-train"; at(a, r.option.train.dep + 10 * MIN, st);
  const label = squash(head(a).querySelector("small").textContent);
  assert.match(label, /^At King's Cross$/, "aboard, the left time is the arrival");
  assert.equal(cd(a)?.dataset.step, "arrive"); assert.match(cd(a).textContent, /^(arrives in|Arriving · )/);
  assert.deepEqual(a.errors, []); a.close();
});

test("Leisure outbound: the same platform deadline and countdown once you've left home", async () => {
  const a = await demo(morning, { dirMode: "office", mode: "leisure", home: HOME }, null);
  follow(a);
  assert.equal(a.c.state.saved.followRoute.mode, "leisure");
  at(a, morning + MIN, HOME);
  assert.match(squash(head(a).textContent), /Leave by/, "at home: Leave by, as in Commute");
  const st = a.w.CommuteCore.profiles.samCommute.stationGeo.LET;
  at(a, morning + 2 * MIN, [(HOME[0] + st[0]) / 2, (HOME[1] + st[1]) / 2]);
  assert.match(squash(head(a).textContent), /Be on the platform by/); assert.equal(cd(a)?.dataset.step, "platform");
  assert.deepEqual(a.errors, []); a.close();
});

test("Leisure going home starts wherever you are in London: set off is 200 m from where you were when the route was drawn", async () => {
  const start = [IN_LONDON.coords.latitude, IN_LONDON.coords.longitude];
  const a = await demo(evening, { dirMode: "home", mode: "leisure" }, IN_LONDON);
  await sleep(200);
  follow(a, (o) => o.effort === "walk" || o.recommended === 1);
  assert.equal(a.c.state.saved.followRoute.mode, "leisure");
  at(a, evening + MIN, start);
  assert.doesNotMatch(squash(head(a).textContent), /Be on the platform by/, "still where you started (not measured from the office)");
  at(a, evening + 3 * MIN, [start[0] + 0.004, start[1]]);   // about 450 m north
  assert.match(squash(head(a).textContent), /Be on the platform by/); assert.equal(cd(a)?.dataset.step, "platform");
  assert.deepEqual(a.errors, []); a.close();
});
