// Virtual clock for every test run: the time of day no longer depends on when the tests run.
// Time starts at Tue 3 Nov 2026 10:00 (Europe/London) and ticks at real speed, so timeouts and waits still work.
// Tests that need an exact moment freeze the page clock themselves (harness `now`).
const RealDate = Date;
const START = new RealDate("2026-11-03T10:00:00").getTime();
const OFFSET = START - RealDate.now();
class VirtualDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + OFFSET); }
  static now() { return RealDate.now() + OFFSET; }
}
globalThis.Date = VirtualDate;
