# Stories

One file per capability. Each says who it's for, the real trip or decision it came from, the acceptance criteria
with exact thresholds, the tests that prove it, and its status. Update the story in the same commit as the
behaviour.

## Format
```
# <Capability>
Status: Done | Behind toggle | Partly done | Planned · Since: <date> · Issues: #n

## Story
As <who>, when <situation>, I want <what>, so that <why>.

## Where it came from
<the trip, decision or conversation, with the date; what went wrong or what was asked for>

## Acceptance criteria
- <observable behaviour with the exact numbers; each one should be testable>

## Tests
- tests/<file>.test.mjs: "<exact test name>"
  (or: "None yet (gap)". Say so rather than leave it out.)

## Not yet / open questions
- <known limits, what's deferred, links to issues>
```
`npm run check-docs` fails if a listed test name doesn't exist in that file.

## Index
### Planning
- [Never hide a train](never-hide-a-train.md) · Done
- [Top card: best and next best](top-card.md) · Done
- [Leave around](leave-around.md) · Done
- [Arrive by](arrive-by.md) · Done (earlier trains: #14)
- [Same train from several stations](same-train.md) · Done
- [Slow trains say so](slow-trains.md) · Done
- [Late trains say so](late-trains.md) · Done (test gap)
- [Standing room only](standing-room.md) · Done
- [Warnings graded by impact](warnings.md) · Done
- [Live and timetable data](live-and-timetable.md) · Done
- [Reliability when feeds fail](reliability.md) · Done

### Where you are
- [Direction and arriving](direction-and-arrival.md) · Done
- [On your way to the station](on-the-way-to-the-station.md) · Done
- [At the station: departure board](at-the-station.md) · Done
- [Which train you're on](which-train.md) · Done
- [Connections at any station](connections.md) · Done
- [Tube home decides the train](tube-home.md) · Done, still bespoke (2b-iv)
- [Elsewhere in London](elsewhere-in-london.md) · Done
- [Nearly home](nearly-home.md) · Done
- [Location prompts](location-prompts.md) · Done, limited by Safari

### Beyond the commute
- [Any start and end point](any-start-and-end-point.md) · Behind toggle
- [Discovered alternatives](discovered-alternatives.md) · Planned (#13)
- [People and trips](people-and-trips.md) · Planned
- [Laura's commute](laura-commute.md) · Planned
- [Family day out](family-day-out.md) · Planned

### Ideas (issues only, not yet stories)
Passing points #23 · Along the line / nerd mode #24 · Searchable place picker #25 · Proxy #17 · National Rail
timetable #18 · Early platforms #19 · Structured incidents #20 · Train length and crowding #21 · Native iPhone
#2–#7, #10–#12.
