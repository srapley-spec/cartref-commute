// The strip and the diagram on the card (#71; docs/stories/journey-progress.md, "Strip and diagram"). The page only
// draws the engine's strip; these check that it draws an estimate as an estimate and a report as a report.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, closeAll } from "./harness.mjs";
after(closeAll);
const NOW = Date.parse("2026-11-03T09:16:00Z"), T = (h) => Date.parse(`2026-11-03T${h}:00Z`);
const squash = (s) => s.replace(/\s+/g, " ").trim();
async function onTube(where, extra = {}) {
  const a = await createApp({ now: NOW, settings: { provider: "demo", followRoute: false }, saved: { dirMode: "office" } }), s = a.c.state;
  Object.assign(s, { here: [51.5201, -0.0973], locAcc: 30, locStatus: "ok", lastFixAt: NOW, lastFixRecvAt: NOW, onLine: false, atHub: null, inLondon: false });
  s.saved.tubeRide = { hub: "KGX", from: "KGX", t: NOW - 3 * 60000, line: "Met", vehicle: "v1", rideMs: 10 * 60000, stop: "Aldgate", stopGeo: [51.5142, -0.0755], picked: true };
  s.ald = { at: NOW, arrivals: [{ vehicle: "v1", lineId: "metropolitan", stopId: "940GZZLUALD", platform: "Northbound - Platform 2", observedAt: NOW, t: T("09:22"), where, ...extra }] };
  a.c.render();
  return { a, sec: a.d.querySelector(".journey-progress") };
}

test("Strip on the card: TfL's place is a solid marker in the Met's colour, passed dots filled, the line dark up to the marker; 'You're here · between stations' in the list", async () => {
  const { a, sec } = await onTube("Between Farringdon and Barbican");
  const marker = sec.querySelector(".jp-strip-marker");
  assert.equal(marker.dataset.kind, "reported");
  assert.equal(marker.style.left, "30%", "1.5 of 5 stations along");
  assert.match(sec.querySelector(".jp-strip").getAttribute("style"), /--strip:var\(--met\)/);
  assert.deepEqual([...sec.querySelectorAll(".jp-strip-dot")].map((d) => d.dataset.state), ["passed", "passed", "next", "upcoming", "upcoming", "yours"]);
  assert.equal(sec.querySelector(".jp-strip-fill").style.width, "30%");
  assert.match(squash(sec.querySelector(".jp-vlist").textContent), /Farringdon.*You're here · between stations.*Barbican/);
  assert.match(squash(sec.querySelector(".jp-vlist").textContent), /Moorgate ?about \d\d:\d\d \(estimate\)/, "a time no feed gives says so");
  assert.equal(sec.querySelector('.jp-stop[data-code$="ALD"], .jp-stop:last-child').dataset.time, "expected");
  assert.deepEqual(a.errors, []); a.close();
});

test("Strip on the card: with no place from TfL the marker is outlined (estimate), nothing is filled or called passed, and the words say it's an estimate", async () => {
  const { a, sec } = await onTube("");
  assert.equal(sec.querySelector(".jp-strip-marker").dataset.kind, "estimate");
  assert.equal(sec.querySelector(".jp-strip-fill").style.width, "0%", "no dark line up to an estimate");
  assert.ok([...sec.querySelectorAll(".jp-strip-dot")].slice(0, 5).every((d) => d.dataset.state === "upcoming"));
  assert.match(squash(sec.querySelector(".jp-where").textContent), /^No live position yet \(the marker is an estimate\) · your stop: Aldgate/);
  assert.match(squash(sec.querySelector(".jp-vlist").textContent), /About here \(estimate\)/);
  assert.doesNotMatch(squash(sec.querySelector(".jp-vlist").textContent), /You're here/);
  assert.deepEqual(a.errors, []); a.close();
});

test("Strip on the card: at your stop the list still says where you are", async () => {
  const { a, sec } = await onTube("At Aldgate Platform 2");
  assert.match(squash(sec.querySelector(".jp-vlist").textContent), /Aldgate · your stop ?09:22 ?You're here · at Aldgate/);
  a.close();
});
