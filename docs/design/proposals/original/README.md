# Proposal: original

By Claude · 29 Oct 2026 · Status: **superseded** by [womble](../womble/), kept for its system board and its review.

## The idea
Keep the current page's skeleton (controls → status line → hero card → list) and restyle it with a proper token set,
in two skins: **A "Signal"** (dark-first, Inter Tight + JetBrains Mono, amber accent, vertical stop rail on the live
card, bottom tab bar) and **B "Board"** (light-first, Archivo + Public Sans, departure-board rules, horizontal progress
strip, single scroll).

## What it changed about the busy screen
- Mode, direction and the Auto note collapse into one context button; pace becomes one toggle.
- The banner stack becomes one status line; every banner moves to a Lines screen, still graded and folded.
- Line status grid, request counts and build number leave the main screen.
- Model note folds into "Why these trains?".

## Recommend drop / hide (for Sam to decide)
Request counts → Lines › Data · build → Settings › About · line status grid → Lines · model note folded · grey notice
tiers → Lines · "total" off list rows (kept on the card) · tube chips smaller on rows · "Journey steps" replaced by
"Then" on live cards · timetable-not-live banner demoted to a card label and per-train pill.

## Screens
[`index.html`](index.html) shows them all. [`system.html`](system.html) is the tokens / type / components / IA board
with the drop/hide table.

## Why it was set aside
Sam: "very similar to the existing design"; the independent review agreed the two directions were two skins of one
layout. The review ([`review.md`](review.md)) also found: Arrive by / Leave around not drawn; seven live states and the
empty/error states undrawn and unlisted; wrong sample arithmetic (since fixed); a one-line status summary that could
hide a cancellation behind an amber operator headline; opacity-dimmed rows below 4.5:1; several targets under 44 px.
Those findings carry over to any proposal that keeps the same devices.
