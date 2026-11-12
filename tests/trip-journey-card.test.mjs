// Trip on the same journey card as Commute and Leisure (Sam, 12 Nov: "I want to make sure that all the changes we're
// making apply to all modes unless you can identify a reason not to"): the countdown to the start of the next step,
// "Be on the platform by" once you've set off, and the controls folded under way.
// Story: docs/stories/leisure-journeys.md ("Trip on the journey card").
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, closeAll, sleep } from "./harness.mjs";
import { TRIP_SETTINGS, TRIP_PLACES, tripRoute, planBrightonCanterbury, until } from "./trip-fixtures.mjs";
after(closeAll);
const NOW = Date.parse("2026-11-03T09:40:00Z");
const squash = (s) => s.replace(/\s+/g, " ").trim();

async function followed() {
  const a = await createApp({ now: NOW, settings: TRIP_SETTINGS, route: tripRoute });
  await planBrightonCanterbury(a);
  a.d.querySelector(".trip-recommendations [data-trip-follow]").click();
  await until(() => a.d.querySelector("[data-trip-stop]"));
  const fix = (geo) => { a.c.state.here = geo; a.c.state.locAcc = 15; a.c.state.lastFixAt = Date.now(); a.c.state.locStatus = "ok"; a.c.render(); };
  const head = () => a.d.querySelector(".trip-follow-card .trip-headline > .journey-heading");
  return { a, fix, head };
}

test("Trip: at the start Leave by counts down to leaving; once 200 m on, 'Be on the platform by' counts down to the platform", async () => {
  const { a, fix, head } = await followed();
  const start = a.c.state.saved.tripMode.follow.journey.from.geo, j = a.c.state.saved.tripMode.follow.journey;
  fix(start);
  assert.match(squash(head().textContent), /^Leave by/); assert.equal(head().querySelector("[data-cd]")?.dataset.step, "leave");
  fix([start[0] + 0.004, start[1]]);   // about 450 m on
  assert.match(squash(head().textContent), /^Be on the platform by/);
  const cd = head().querySelector("[data-cd]"); assert.equal(cd?.dataset.step, "platform");
  // The first train's departure less the time to reach the platform (the trip's own allowance).
  const plat = [...j.before].reverse().find((s) => s.kind === "station");
  assert.equal(Number(cd.dataset.cd), j.rides[0].dep - plat.secs * 1000);
  assert.match(cd.textContent, /^(on the platform in |Head for the platform now · |platform time passed)/);
  assert.deepEqual(a.errors, []); a.close();
});

test("Trip: following folds the controls into one row, 'Trip · To Canterbury Cathedral · Leave now'; stopping brings them back", async () => {
  const { a } = await followed();
  const b = a.d.querySelector("#signalUnderwaySummary");
  assert.equal(a.d.body.hasAttribute("data-underway"), true);
  assert.equal(b.hidden, false); assert.equal(squash(b.textContent), "Trip · To Canterbury Cathedral · Leave now");
  b.click(); assert.equal(a.d.body.hasAttribute("data-controls-open"), true); b.click();
  a.d.querySelector("[data-trip-stop]").click(); await sleep(50); a.c.render();
  assert.equal(a.d.body.hasAttribute("data-underway"), false); assert.equal(b.hidden, true);
  assert.deepEqual(a.errors, []); a.close();
});

test("Trip: aboard, the left time is the arrival at the next stop and counts down to it", async () => {
  const { a, head } = await followed();
  const j = a.c.state.saved.tripMode.follow.journey, first = j.rides.findIndex((r) => r.kind !== "walk");
  a.setNow(j.rides[first].dep + 5 * 60e3);
  a.d.querySelector(`[data-trip-boarded="${first}"]`).click(); await sleep(50); a.c.render();
  assert.match(squash(head().querySelector("small").textContent), /^At /);
  assert.equal(head().querySelector("[data-cd]")?.dataset.step, "arrive");
  assert.match(head().querySelector("[data-cd]").textContent, /^(arrives in |Arriving · )/);
  assert.deepEqual(a.errors, []); a.close();
});
void TRIP_PLACES;
