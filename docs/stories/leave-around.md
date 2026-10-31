# Leave around
Status: Done · Since: 27 Oct 2026

## Story
As a commuter planning ahead ("I'll leave about 17:40"), I want the trains around that time, so that I can pick
one before I set off.

## Acceptance criteria
- Pick a time (default 17:40).
- Listed from 15 min before the chosen time (earlier leaves flagged); recommended (card) only from 10 min before
  or any time after.
- Leaving order; card follows the [top-card](top-card.md) rule.
- Uses the live board while its start is within 119 min of now; beyond that the timetable, labelled.
- Where the live board stops short, later trains come from the timetable and the heading says so.
- When the first location establishes the direction after initial loading, the selected Leave-around question is planned without another tap. Returning from simulation restores the real date/time and alternative origin before replanning.

## Tests
- tests/rules.test.mjs: "Leave around: listed from 15 min before; recommended only from 10 min before"
- tests/core/search.test.mjs: "Leave around: from 15 min before (earlier leaves flagged), card from 10 min before, leaving order"
- tests/app.test.mjs: "Leave around 17:40: the best train (alone when nothing else is close) and every train around then, in leaving order"
- tests/rules.test.mjs: "Leave around with live data: the live board is used while its start is within 119 min; beyond that, the timetable"
- tests/app.test.mjs: "Leave around: where the live board stops short, later trains come from the timetable and the heading says so"
- tests/simulator-planning-resume.test.mjs: "Leave around plans the actual requested time when the first location arrives after initial loading"
- tests/simulator-stop-review.test.mjs: "independent simulation isolation: real planning dates and runtime origin return after dock Stop and source disable"
