# Decision: Trip mode is Signal-only (an exception to "every supported UI advances together")

Superseded by Panda retirement, 1 Nov 2026: Signal is the sole design, the design switch and parity/exception
registry are removed, and Trip retains its own Experimental opt-in. The entry below records the earlier
two-design decision; it no longer requires hiding Trip for a saved `signal:false` value.
See [retirement decision and review](../panda-retirement-review.md).

Approved by: Sam
Date: 1 Nov 2026 (early hours), in the Claude Code session that built Trip mode

## Context
Trip mode (door to door by rail between any two addresses in the region; [story](../stories/leisure-journeys.md)) was
designed and built on 31 Oct night behind Settings → Experimental → Trip, Signal only, as stated in its design.
While it was being built, `main` adopted the UI-parity rule ([story](../stories/journey-facts.md), CLAUDE.md, 31 Oct
evening): every feature ships in every supported design, and an experimental switch is not permission to leave a
design behind. Merging `main` into the Trip branch made the required parity gate fail on Trip's eight views.

Sam was asked to choose between building Trip in Panda too, a Signal-only exception, or holding Trip unmerged, and
chose **a Signal-only exception**.

## What is excepted
Only Trip's own views, and only Panda. Panda remains a supported design for everything else; nothing else may use
this record. Trip's views are registered surfaces with real-page Signal cases in the parity gate.

Design exception: surface:plan-trip-now designs:signal
Design exception: surface:plan-trip-by designs:signal
Design exception: surface:plan-trip-at designs:signal
Design exception: surface:trip-follow designs:signal
Design exception: surface:trip-access designs:signal
Design exception: surface:trip-ride designs:signal
Design exception: surface:trip-change designs:signal
Design exception: surface:trip-final designs:signal

## Consequences
- With Signal off, there is no Trip button (Panda and Leisure are unchanged).
- Trip does not yet have the Auto / Plan / Live buttons the commute views share (its view follows the followed trip's
  phase); that is a Trip "Not yet", not a parity difference between designs.
- Bringing Trip to Panda later removes these lines, and the surfaces' `designs` limits, in the same change.
