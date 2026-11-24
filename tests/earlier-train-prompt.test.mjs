// The earlier-train prompt on the followed card (docs/stories/earlier-train-prompt.md; Sam, 24 Nov 2026). The engine
// decides that a catchable train 10+ minutes sooner outranks "On track" (tests/core/earlier-train-prompt.test.mjs);
// these tests prove what the page draws and that the two choices do what they say.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);

// 10:00 at home. You follow the slow 10:15 stopper (King's Cross 11:10); the 10:20 Thameslink gets there `fastArr`
// minutes after 10:00. A 15 min gap is a prompt; 7 is the quieter "Another option".
async function following({ fastArr = 55, platform = null, slowDep = 15, slowArr = 70, fastDep = 20 } = {}) {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "office" }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const slow = svc({ from: "LET", to: "KGX", dep: T0 + slowDep * m, arr: T0 + slowArr * m, operator: "Great Northern", serviceId: "SLOW", destination: "King's Cross" });
  const fast = svc({ from: "LET", to: "KGX", dep: T0 + fastDep * m, arr: T0 + fastArr * m, operator: "Thameslink", serviceId: "FAST", destination: "Brighton", platform });
  c.state.boards = { "LET-KGX": { msgs: [], services: [slow, fast] }, "LET-ZFD": { msgs: [], services: [] }, "LET-STP": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => new RegExp(`${hm(T0 + slowDep * m)} Great Northern`).test(b.getAttribute("aria-label"))).click();
  const place = (min) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now;
    Object.assign(c.state, { here: P.stationGeo.LET, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null }); c.render(); return now; };
  const panel = () => app.text("#followPanel");
  return { app, c, place, panel, followed: () => c.state.saved.followRoute?.option.train.serviceId };
}

test("a catchable train 15 minutes sooner is the first thing on the followed card, with Switch and Keep; 'On track' gives way", async () => {
  const { app, c, place, panel, followed } = await following({ platform: "3" });
  place(5);
  const box = app.d.querySelector("#followPanel > .follow-prompt");
  assert.ok(box, "the prompt is drawn"); assert.equal(box.dataset.block, "earlier-train");
  const kids = [...app.d.querySelector("#followPanel").children];
  assert.ok(kids[0].classList.contains("lbl") && kids[1] === box, "directly under 'Following your route', above the arrival");
  const text = app.text("#followPanel > .follow-prompt");
  assert.match(text, /Earlier train catchable/); assert.match(text, /Comfortable · \d+ min to spare/);
  assert.match(text, /Office\s*11:\d\d\s*15 min sooner/, "the answer first: when you'd arrive, and how much sooner");
  assert.match(text, /10:20 Thameslink to Brighton · Be on platform 3 at [A-Za-z' ]+ by\s*10:19 · walk at your usual pace/);
  assert.equal(box.querySelector('[data-follow-action="switch"]').textContent.trim(), "Switch to 10:20");
  assert.equal(box.querySelector('[data-follow-action="dismiss"]').textContent.trim(), "Keep 10:15");
  assert.match(app.text("#followPanel .follow-status"), /^Train departs in 10 min$/, "the followed train's own line, without 'On track'");
  assert.doesNotMatch(panel(), /On track/); assert.ok(app.d.querySelector("#followPanel .follow-status.info"), "no longer green");
  assert.equal(app.d.querySelectorAll("#followPanel .follow-alternative").length, 1, "the alternative is drawn once, inside the prompt");
  assert.ok(box.querySelector(".follow-alternative"), "folded under Details");
  assert.equal(app.d.querySelectorAll("#followPanel .follow-alternative [data-follow-action]").length, 0, "one pair of buttons, not two");
  const more = box.querySelector("details.prompt-more"); assert.ok(more && !more.open, "details are folded by default");
  assert.match(more.querySelector("summary").textContent, /Details of the 10:20/);
  assert.equal(followed(), "SLOW", "nothing is switched for you");
  assert.deepEqual(app.errors, []); app.close();
});

test("an unannounced platform says so, and a tight margin is amber", async () => {
  const { app, place } = await following({ platform: null });
  place(5);
  assert.match(app.text("#followPanel > .follow-prompt"), /Be on the platform at [A-Za-z' ]+ by\s*10:19 · platform not announced yet/);
  // The followed train is later (10:25) and the earlier one leaves at 10:16: at 10:13:30 there is a minute to spare.
  const tight = await following({ platform: null, slowDep: 25, slowArr: 80, fastDep: 16 });
  tight.place(13.5);
  const box = tight.app.d.querySelector("#followPanel > .follow-prompt");
  assert.ok(box, "still catchable"); assert.ok(box.classList.contains("tight"));
  assert.match(tight.app.text("#followPanel > .follow-prompt"), /Tight · (go now|\d min to spare)/);
  assert.ok(box.querySelector(".pill.warn"), "the tier pill is amber when tight");
  assert.doesNotMatch(tight.app.text("#followPanel > .follow-prompt"), /walk at your usual pace/);
  assert.match(tight.app.text("#followPanel > .follow-prompt"), /Keep 10:25/);
  assert.deepEqual(app.errors, []); assert.deepEqual(tight.app.errors, []); app.close(); tight.app.close();
});

test("when the followed train has already left there is no prompt (you may be aboard)", async () => {
  const { app, c, place, panel } = await following();
  place(17);
  assert.equal(app.d.querySelector("#followPanel .follow-prompt"), null);
  assert.match(panel(), /Departure just passed · confirm if you are on it/);
  assert.equal(c.state.saved.followRoute.option.train.serviceId, "SLOW");
  assert.deepEqual(app.errors, []); app.close();
});

test("'Switch to 10:20' follows the earlier train; the prompt is gone and the new train is 'On track'", async () => {
  const { app, place, panel, followed } = await following();
  place(5);
  app.d.querySelector('#followPanel [data-follow-action="switch"]').click();
  assert.equal(followed(), "FAST");
  place(5);
  assert.equal(app.d.querySelector("#followPanel .follow-prompt"), null, "nothing better than the train you now follow");
  assert.match(panel(), /On track/);
  assert.deepEqual(app.errors, []); app.close();
});

test("'Keep 10:15' keeps the followed train and the prompt does not come back for that train", async () => {
  const { app, c, place, panel, followed } = await following();
  place(5);
  app.d.querySelector('#followPanel [data-follow-action="dismiss"]').click();
  place(5);
  assert.equal(followed(), "SLOW");
  assert.equal(app.d.querySelector("#followPanel .follow-prompt"), null);
  assert.equal(app.d.querySelector("#followPanel .follow-alternative"), null, "declined means declined: no quieter version either");
  assert.match(panel(), /On track/); assert.ok(c.state.saved.followRoute.dismissedAlternatives.length >= 1);
  place(6);
  assert.equal(app.d.querySelector("#followPanel .follow-prompt"), null, "and not on the next refresh");
  assert.deepEqual(app.errors, []); app.close();
});

test("under ten minutes sooner it stays the quieter 'Another option' below the card, with 'On track' unchanged", async () => {
  const { app, place, panel } = await following({ fastArr: 63 });
  place(5);
  assert.equal(app.d.querySelector("#followPanel .follow-prompt"), null);
  const way = app.text("#followPanel > .follow-alternative");
  assert.match(way, /^Another option · 7 min sooner/);
  assert.ok(app.d.querySelector('#followPanel > .follow-alternative [data-follow-action="switch"]'), "its own buttons, as before");
  assert.match(panel(), /On track · train departs in 10 min/);
  assert.deepEqual(app.errors, []); app.close();
});

test("the prompt survives a refresh with Details open", async () => {
  const { app, c, place } = await following();
  place(5);
  const more = app.d.querySelector("#followPanel details.prompt-more"); more.open = true;
  more.dispatchEvent(new app.w.Event("toggle", { bubbles: true }));
  place(5.2); c.render();
  assert.ok(app.d.querySelector("#followPanel .follow-prompt"));
  assert.ok(app.d.querySelector("#followPanel details.prompt-more").open, "what you opened stays open");
  assert.deepEqual(app.errors, []); app.close();
});
