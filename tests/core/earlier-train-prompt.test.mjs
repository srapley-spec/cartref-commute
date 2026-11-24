// The earlier-train prompt (docs/stories/earlier-train-prompt.md; Sam, 24 Nov 2026). Homeward from King's Cross the
// app said "On track" for the 18:54 while the 18:48, home 18 minutes sooner, was catchable, and showed it only
// below the fold. The engine now decides that a catchable train this much sooner outranks "On track".
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, train, MIN, at } from "./helpers.mjs";

const t = at("2026-11-03", "18:44");
function option(extra = {}, trainExtra = {}) {
  const dep = t + 10 * MIN, arr = t + 49 * MIN;
  return { hub: "CEN", leave: t + 8 * MIN, arrive: t + 72 * MIN, flags: [], effort: "walk",
    train: train({ from: "CEN", to: "RVS", std: "18:54", dep, arr, serviceId: "followed", ...trainExtra }),
    legs: [{ t: t + 8 * MIN, d: "Walk to the platform" }, { t: dep, d: "Train from Central", train: true }, { t: arr, d: "Arrive Riverside" }, { t: t + 72 * MIN, d: "Arrive home" }], ...extra };
}
const start = () => core.startFollowRoute(option(), { now: t, direction: "home", mode: "commute" });
// An earlier train: `gain` minutes sooner than the followed journey; `spare` minutes until you must be moving for it.
const earlier = (r, gain, spare = 6, effort = "walk") => option({ arrive: r.expectedArrival - gain * MIN, leave: t + spare * MIN, effort },
  { serviceId: "earlier", std: "18:48", dep: t + 4 * MIN });
const update = (r, options, extra = {}) => core.updateFollowRoute(r, { now: t, options, availableOptions: options, dataFresh: true, phase: "before-train", ...extra });

test("a catchable train 18 minutes sooner takes the status slot: prompt present, 'On track' gives way", () => {
  const r = start(), e = earlier(r, 18), u = update(r, [option(), e], { boarding: "at" });
  assert.ok(u.prompt, "the prompt is there");
  assert.equal(u.alternative, e); assert.equal(u.prompt.gainMin, 18); assert.equal(u.prompt.effort, "walk");
  assert.equal(u.prompt.tier, "comfortable"); assert.equal(u.prompt.spareMin, 6);
  assert.equal(u.status, "on-track", "the followed train is still on track; what it says must not read as all well");
  assert.doesNotMatch(u.text, /On track/); assert.equal(u.level, "info");
  assert.equal(u.text, "Train departs in 10 min", "the same words, without 'On track'");
  assert.equal(u.route.id, r.id, "never swaps the followed journey; Switch is the person's tap");
});

test("the words that replace 'On track' for each form it takes, and the gain is rounded as the 'N min sooner' line always was", () => {
  const r = start(), e = earlier(r, 18);
  assert.equal(update(r, [option(), e]).text, "8 min to spare", "'On track · 8 min to spare'");
  assert.equal(update(r, [option({ leave: t }), e]).text, "Your train is unchanged", "a bare 'On track'");
  assert.equal(update(r, [option(), e], { boarding: "at" }).text, "Train departs in 10 min");
  const faster = option({ arrive: r.expectedArrival - 18 * MIN, leave: t + 11 * MIN, effort: "walk" }, { serviceId: "faster", std: "18:56", dep: t + 12 * MIN });
  assert.equal(update(r, [option(), faster], { boarding: "at", now: t + 10 * MIN - 20e3 }).text, "Train departing", "'On track · train departing'");
  const odd = update(r, [option(), earlier(r, 12.6)]);
  assert.equal(odd.prompt.gainMin, 13, "nearest minute, not rounded down"); assert.equal(odd.prompt.gainMin, -odd.deltaMin, "the same figure the 'Another option' line uses");
});

test("the threshold is ten minutes: nine is the quieter 'Another option' and keeps 'On track'", () => {
  const r = start();
  const nine = update(r, [option(), earlier(r, 9)], { boarding: "at" });
  assert.ok(nine.alternative, "still offered, from five minutes (FOLLOW_BETTER_MIN)"); assert.equal(nine.prompt, null);
  assert.equal(nine.text, "On track · train departs in 10 min"); assert.equal(nine.level, "ok");
  const justUnder = update(r, [option(), earlier(r, 9.9)], { boarding: "at" });
  assert.equal(justUnder.prompt, null, "9 min 54 s is not ten");
  const ten = update(r, [option(), earlier(r, 10)], { boarding: "at" });
  assert.equal(ten.prompt?.gainMin, 10);
  assert.equal(core.FOLLOW_PROMPT_MIN, 10); assert.equal(core.FOLLOW_BETTER_MIN, 5);
});

test("catchability tiers: three or more minutes to spare at your usual pace is comfortable; under three, or a fast walk, is tight", () => {
  const r = start(), tierOf = (spare, effort) => update(r, [option(), earlier(r, 18, spare, effort)]).prompt;
  assert.equal(tierOf(6).tier, "comfortable");
  assert.equal(tierOf(3).tier, "comfortable", "exactly FOLLOW_PROMPT_SPARE_MIN");
  assert.equal(tierOf(2.99).tier, "tight"); assert.equal(tierOf(2.99).spareMin, 2);
  assert.equal(tierOf(1).tier, "tight"); assert.equal(tierOf(0).tier, "tight");
  assert.equal(tierOf(-1).spareMin, 0, "spare is never negative");
  const fast = tierOf(8, "fast");
  assert.equal(fast.tier, "tight", "a fast walk is tight however much spare there is"); assert.equal(fast.effort, "fast");
  assert.equal(core.FOLLOW_PROMPT_SPARE_MIN, 3);
});

test("a run or a car is never prompted (the engine does not offer them as better options)", () => {
  const r = start();
  for (const effort of ["run", "car", "none"]) {
    const u = update(r, [option(), earlier(r, 25, 1, effort)]);
    assert.equal(u.alternative, null); assert.equal(u.prompt, null);
  }
});

test("no prompt for an alternative that is not catchable: missed, cancelled, uncertain or already gone", () => {
  const r = start();
  for (const e of [option({ arrive: r.expectedArrival - 20 * MIN, leave: t + 5 * MIN, missed: true }, { serviceId: "earlier", std: "18:48", dep: t + 4 * MIN }),
    option({ arrive: r.expectedArrival - 20 * MIN, leave: t + 5 * MIN }, { serviceId: "earlier", cancelled: true }),
    option({ arrive: r.expectedArrival - 20 * MIN, leave: t + 5 * MIN, uncertain: true }, { serviceId: "earlier" }),
    option({ arrive: r.expectedArrival - 20 * MIN, leave: t + 5 * MIN }, { serviceId: "earlier", dep: t - MIN })]) {
    assert.equal(update(r, [option(), e]).prompt, null);
  }
});

test("a dismissed alternative stops prompting ('Keep 18:54'); stale data never prompts", () => {
  const r = start(), e = earlier(r, 18);
  assert.ok(update(r, [option(), e]).prompt);
  const kept = core.dismissFollowAlternative(r, e);
  const u = update(kept, [option(), e]);
  assert.equal(u.prompt, null); assert.equal(u.alternative, null); assert.equal(u.text, "On track · 8 min to spare");
  assert.equal(update(r, [option(), e], { dataFresh: false }).prompt, null);
});

test("when the followed train is itself in trouble the existing recovery offer stands and no prompt is made", () => {
  const r = start(), e = earlier(r, 18);
  const cancelled = update(r, [option({}, { cancelled: true }), e]);
  assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.alternative, e); assert.equal(cancelled.prompt, null, "recovery is 'A way on', not a prompt");
  const noEstimate = update(r, [option({}, { depUnknown: true }), e]);
  assert.equal(noEstimate.prompt, null);
  const gone = update(r, [option({ effort: "none", missed: true }), e], { hasReliableLocation: true });
  assert.equal(gone.status, "missed"); assert.equal(gone.prompt, null);
});

test("only before boarding and never during a connection; on the train or after it there is no prompt", () => {
  const r = start(), e = earlier(r, 18);
  assert.equal(update(r, [option(), e], { phase: "on-train", now: t + 12 * MIN }).prompt, null);
  assert.equal(update(r, [option(), e], { phase: "after-train", now: t + 50 * MIN }).prompt, null);
  const tube = update(r, [option(), e], { activeConnection: true, readyAt: { CEN: t + 2 * MIN }, boarding: null });
  assert.equal(tube.prompt, null, "on the tube to the station an alternative is only a recovery offer");
});

test("once the followed train has gone there is no prompt: you may be aboard, so it is a question, not a better choice", () => {
  const r = start(), dep = r.option.train.dep;
  // A faster train that leaves AFTER the followed one and still gets you there 18 minutes sooner.
  const faster = option({ arrive: r.expectedArrival - 18 * MIN, leave: dep + 3 * MIN, effort: "walk" }, { serviceId: "faster", std: "18:58", dep: dep + 4 * MIN });
  const ahead = update(r, [option(), faster], { now: dep - 60e3, boarding: "at" });
  assert.ok(ahead.prompt, "a minute before the followed train leaves, still a choice"); assert.equal(ahead.prompt.gainMin, 18);
  const gone = update(r, [option(), faster], { now: dep + 30e3, boarding: "at" });
  assert.equal(gone.status, "hurry"); assert.equal(gone.text, "Departure just passed · confirm if you are on it");
  assert.ok(gone.alternative, "the way on is still offered, quietly, as before"); assert.equal(gone.prompt, null, "but no 'Switch to 18:58 / Keep 18:54' for a train that has left");
  const was = update(r, [option(), faster], { now: dep + 2 * MIN, boarding: "was", hasReliableLocation: false });
  assert.equal(was.status, "hurry"); assert.equal(was.prompt, null);
});

test("the same train from another station is the existing recovery offer, not a prompt", () => {
  // The followed 18:54 can't be reached from here (effort none) but is still possible from Market Street: that offer
  // ("Same train still possible from …") stands, even though it gets you there well over ten minutes sooner.
  const dep = t + 10 * MIN;
  const same = option({ hub: "MKT", leave: t + 6 * MIN, arrive: t + 72 * MIN - 15 * MIN }, { from: "MKT", dep: dep + 2 * MIN, arr: t + 49 * MIN });
  same.legs.find(l => l.train).t = dep + 2 * MIN;
  const r = core.startFollowRoute(option({ alts: [same] }), { now: t, direction: "home", mode: "commute" });
  const u = update(r, [option({ effort: "none" }), same], { now: t + 5 * MIN });
  assert.equal(u.status, "hurry"); assert.match(u.text, /Same train still possible from MKT/);
  assert.equal(u.alternative.train.from, "MKT"); assert.ok(u.route.expectedArrival - u.alternative.arrive >= 10 * MIN, "it really is 10+ minutes sooner");
  assert.equal(u.prompt, null);
});

test("a badly late followed train still gets the prompt (that is when a better train matters most), measured against the late arrival; not on the tube to the station", () => {
  const r = start(), e = earlier(r, 18);
  const lateArr = r.expectedArrival + 20 * MIN, lateTrain = { arr: r.option.train.arr + 20 * MIN, arrLate: 20 };
  const u = update(r, [option({}, lateTrain), e], { currentArrival: lateArr });
  assert.match(u.text, /^20 min later than planned/); assert.equal(u.level, "warn", "its own amber warning stays");
  assert.equal(u.prompt?.gainMin, 38, "18 min sooner than the plan is 38 min sooner than where you now expect to arrive");
  const tube = update(r, [option({}, lateTrain), e], { currentArrival: lateArr, activeConnection: true, readyAt: { CEN: t + 2 * MIN } });
  assert.equal(tube.prompt, null, "on the tube to the station an alternative stays a quiet recovery offer");
});

test("a tight followed train keeps its own warning beside the prompt", () => {
  const r = start(), e = earlier(r, 18);
  const u = update(r, [option({ effort: "fast", leave: t + MIN }), e]);
  assert.equal(u.status, "hurry"); assert.equal(u.text, "Tight · walk fast"); assert.equal(u.level, "warn");
  assert.ok(u.prompt, "a better train is still worth knowing about"); assert.equal(u.prompt.gainMin, 18);
});

test("a followed train running late stays amber and is not reworded by the prompt", () => {
  const r = start(), e = earlier(r, 18);
  const lateArr = r.expectedArrival + 6 * MIN;
  const u = update(r, [option({}, { arr: r.option.train.arr + 6 * MIN, arrLate: 6 }), e], { currentArrival: lateArr });
  assert.match(u.text, /^6 min later than planned/); assert.equal(u.level, "warn");
  assert.ok(u.prompt); assert.equal(u.prompt.gainMin, 24, "measured against where you now expect to arrive");
});
