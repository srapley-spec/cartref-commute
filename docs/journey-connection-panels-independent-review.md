# Independent connection-panel review — 1 November 2026

Reviewed implementation `7e0ea1f` in a separate worktree, with the subsequent root fixes tested as described below.
No application source or generated HTML is included in this review's commit.

**Decision: approved on application source `86102bd`.** The three findings below are fixed, all six independent
page probes pass, the strengthened browser matrix passes, and all 19 deliberate source/CSS mutations are rejected.
The primary agent still completes the required committed-HEAD local CI, GitHub checks and deployment verification.

## Findings and resolutions

1. **Unusable services promised a departure.** A cancelled/no-estimate 07:07 service at 07:00 retained a
   future departure but had an expired access deadline. Because `missed` was true, the new overview displayed
   “train departs in 7m” beside Cancelled/No estimate. Reproduced for cancelled, unknown departure and unknown
   arrival. Root added the existing engine plannability/finite-time guard. The independent counterexample
   also retains the countdown for a known train with a passed access deadline, so suppressing all countdowns
   cannot pass the test.
2. **A global alternative style changed Live.** The new unqualified `.follow-alternative` grid rule changed
   explicit Live's previous block layout, including its inline heading/service text and pills. The original
   Live-origin DOM comparison could not detect this CSS effect. Root scoped the grid to alternatives containing
   the new direct journey headline. The regression checks Auto's grid and Live's preceding block layout while
   retaining the chosen service.
3. **Trip retained an unqualified On time after a failed board refresh.** A successful Brighton–Lewes board
   reported the 10:06 on time; after 31 seconds, a 503 response marked the ride's live fields false while retaining
   its old train object. The new panel still said On time. The network-level regression requires retained identity
   and an explicit Not live/Last known qualification. This is an older Trip confidence problem exposed in the
   new prominent panel, rather than a new request/refresh-policy defect. Root now consumes the ride's departure
   evidence when qualifying the panel status, preserves cancellation/delay severity with Not live, labels changed
   retained non-timetable clocks **Last known**, and removes duplicate unqualified status flags from the same row.
   The test exercises successful on-time, delayed and cancelled boards followed by an actual failed refresh.

## Test protection

Two CSS breakages initially survived the committed browser probe: reducing all connection clocks to 14 px and
concealing their scheduled clock. The probe now requires visible scheduled/expected clocks and the agreed
36 px recommendation / 30 px planning-row minimums, including doubled text. A normal Node page regression
checks those basic visibility/prominence constraints as well, so they participate in the ordinary test suite.

The four-ride Trip browser fixture previously changed `Date` after the app captured its base clock; the resulting
10:02 deadline used a 03:22 countdown. An optional context-init epoch in the existing browser boot helper fixes
the fixture at 10:00 before app startup. The probe verifies that source/session setup keeps that clock and that
the exposed countdown uses it. This changes test setup, not production timing.

Independent page regressions cover clock prominence, unusable future departures with expired access,
cancellation while following, Live alternative geometry, and a delayed second Trip train's own station,
scheduled/expected times and warning. They also cover the failed Trip board refresh described above.

## Deliberate mutations

The final targeted run rejected all 19 controlled one-line source/stylesheet mutations:

| Breakage | Result |
| --- | --- |
| Leave clock replaced by train departure | Rejected |
| Leave countdown replaced by train departure | Rejected |
| Leave by label removed | Rejected |
| Scheduled clock replaced by expected departure | Rejected |
| Expected clock replaced by scheduled departure | Rejected |
| Next best reused the primary journey | Rejected |
| Explicit Live adopted planning panels | Rejected |
| Cancelled/unknown journey regained a usable leave clock | Rejected |
| Multi-ride Trip showed only its first ride | Rejected |
| Completed Trip rides appeared as remaining connections | Rejected |
| Later Trip panels reused the first boarding station | Rejected |
| Live alternatives regained the new global grid | Rejected |
| Unusable services regained a departure promise | Rejected |
| All connection clocks shrank to metadata size | Rejected |
| Scheduled clock was hidden | Rejected |
| Expected clock was hidden | Rejected |
| Scheduled clock became transparent | Rejected |
| Next best's connection clock shrank | Rejected |
| Failed Trip refresh left retained status unqualified | Rejected |

The initial Next-best mutation was accidentally paired with an Arrive-by probe while mutating only Leave now;
the full Auto/Plan question/direction matrix rejected it when the affected renderer was exercised.

All temporary mutations and source patches were restored. Exact guard and Live-style fixes from `4de365c`
passed the first five independent probes and the strengthened browser matrix: 32 ordinary/32 enlarged scenes,
four light/dark 320/393 px Trip scenes including Follow, eight Follow/disclosure/refresh scenes, and exact explicit
Live hero/board DOM equivalence with the prior production build. All six independent probes, including the three
real-network Trip confidence cases, and the same strengthened browser matrix pass against exact application
sources from `86102bd`. The confidence qualification mutation is rejected by the new network regression.

## Scope and limits

The presentation still consumes existing canonical journey times, engine status and current ride index; no
new planner, inferred timing, request or persistence policy is introduced. Once aboard, arrival/next action
continue to lead, and panels show remaining connections. Safari/VoiceOver hardware checks are not claimed.
Trip's older result renderer resets an expanded Journey steps disclosure on an ordinary redraw; that line is
unchanged by this change and remains a separate existing limitation.

Mutation logs, before/after regressions and browser results are under
`/workspace/scratch/connection-panel-review-artifacts/`.
