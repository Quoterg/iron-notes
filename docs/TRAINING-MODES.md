# Training modes and effective reps — design

Status: **owner's direction set 2026-10-28** (goal and progression per mode below); details marked
*open* are still to confirm. Phase 2 milestones in [ROADMAP.md](ROADMAP.md).

## Goal: better than the RP Hypertrophy app, fast on old phones

RP Hypertrophy (the reference) runs 4–6-week mesocycles with an automatic deload week; after a session
you rate pump, soreness, joint pain, effort and performance, and next week's sets and weights are
adjusted from that. Reviews praise the feedback-driven volume and deloads and criticise: web-only (no
offline), ~$35/month, an opaque algorithm, sets added on a fixed schedule rather than from performance,
no allowance for missed sessions or faster recovery, mesocycle length fixed once started, and volume
that tends to run too high. Iron Notes aims to do what it does, better:

| | RP Hypertrophy | Iron Notes |
|---|---|---|
| Runs | Web app, online, subscription | Offline PWA, free, no account, fast on old phones |
| Volume | Sets per muscle, fixed add-a-set schedule | **Effective reps per muscle** against the mode's goal; sets follow from it |
| Effort model | One generic scheme | Two coherent modes: **Dorian HIT** (failure) and **Lyle effective reps** (RIR) |
| Progression | Algorithm, not shown | Per-mode rules, every suggestion says *why* ("12 reps last time → +2.5 kg") |
| Feedback | Pump, soreness, joints, workload | Same quick ratings per muscle, used visibly (shown what it changed) |
| Readiness | Ignores missed sessions | Missed session / long gap / slow recovery adjust the next targets |
| Mesocycles | Fixed length once started | Length changeable mid-cycle; deload when due or on request |

## The two modes

### Dorian HIT (Dorian Yates' "Blood and Guts")

- Each muscle about **once a week**; 1–2 warm-ups (≈50 % / 75 %, far from failure), then **one all-out
  set per exercise** (or the owner's reverse pyramid), taken to failure and beyond (forced reps,
  negatives, rest-pause).
- Goal ≈ **20 effective reps per muscle group per session/week**.
- **Progression: dynamic double progression.** Each working set has its own target; reps go up until
  the set reaches **12**, then *that set's* weight goes up one step (exercise increment) and its reps
  restart lower. Sets progress independently (a reverse pyramid's top set and back-off sets move at
  their own pace). *Open:* the reps to restart at after a weight increase (proposal: the set's bottom,
  default 8, or "whatever you get" — the next session records it).

### Lyle effective reps (Lyle McDonald)

- Each muscle about **twice a week**; sets stopped **0–4 reps short of failure**, logged as RIR.
  Goal **20–40 effective reps per muscle group per session** (Lyle: "24 to 30 or so" per workout).
- **Progression: Lyle's cycle** (Generic Bulking Routine FAQ): cycles of 6–8 weeks.
  - **Run-up** (weeks 1–2): start submaximal — about 80–85 % of the best weight for the rep range in
    week 1, 90–95 % in week 2 — sets well short of failure.
  - **Push** (weeks 3+): add weight when the **first set reaches the top of the rep range with 1–2
    reps to spare** (RIR ≥ 1); if those reps were a grind (RIR 0), keep the weight. Steps: 2.5–5 lb
    (≈1–2.5 kg) big lifts, 1–2.5 lb (≈0.5–1 kg) small ones — the exercise's increment.
  - **Between cycles**: a light week, then change exercises and/or rep ranges if wanted (never within
    a cycle). Typical ranges: main lifts 6–8, secondary 10–12, isolation 12–15.

## Effective reps (both modes)

Besides plain logging (FitNotes-style "Standard" mode), Iron Notes tracks **effective reps** — the reps
done with all of a muscle's high-threshold fibres recruited, which are what drive growth — per
**muscle group**, against a goal of **20–40 effective reps per muscle group**. The two modes in numbers:

| | **Dorian HIT** | **Lyle effective reps** |
|---|---|---|
| Effort | Every working set to failure (and beyond: forced reps, negatives, rest-pause) | Sets stopped 0–4 reps short of failure, logged as RIR |
| Effective-rep goal per muscle | **~20** (low end: failure sets give the most per set) | **20–40** (Lyle: "24 to 30 or so" per workout) |
| Volume | 1 all-out set per exercise, 2–4 exercises per muscle | 4–6 sets to failure *or* 8–10 sets at ~2 RIR per workout |
| Warm-ups | 1–2 per first exercise (≈50 % and 75 % of working weight, 8–12 reps, far from failure) | Normal warm-ups, not counted |
| Reps | Upper body 6–10, legs 10–15 (pre-exhaust extensions 12–15), calves 10–12 | Mostly 6–15 ("hypertrophy zone"), core work 5–8 |
| Frequency | Each muscle once every ~7 days (4 workouts / week: delts+traps+triceps, back+rear delts, chest+biceps, legs) | Each muscle about twice a week; more frequent → less per workout |

## Effective reps per set (proposed rule)

Lyle's examples: a set of 8 to failure → last 4–5 reps effective; 8 reps at 2 RIR → about 3; 10 to
failure → reps 6–10; 15 to failure → the last 5; 3–4 RIR is about the least that counts; heavy sets
(≥ ~80–85 % 1RM, ≤ ~5–8RM) recruit everything from rep 1.

**Proposed:** `effective = max(0, min(reps, 5 − RIR))` for a normal set, plus beyond-failure reps:

| Set | Effective reps |
|---|---|
| 8 reps, 0 RIR (failure) | 5 |
| 8 reps, 2 RIR | 3 |
| 15 reps, 0 RIR | 5 |
| 3 reps, 0 RIR (heavy) | 3 |
| 10 reps, 4 RIR | 1 |
| any set, 5+ RIR (warm-up) | 0 |
| Dorian: 8 to failure + 2 forced reps | 5 + 2 = 7 |
| Rest-pause: 8 to failure, +3, +2 after short pauses | 5 + 3 + 2 = 10 (Lyle: ~8–9 per rest-pause set) |
| Drop set: 8 to failure, drop 10–20 %, +6 to failure | 5 + 5 = 10 (each drop counts as its own set to failure) |

- Dorian HIT: working sets are RIR 0 by definition (no RIR input); warm-up sets count 0.
- Lyle mode: RIR chips (0 · 1 · 2 · 3 · 4 · 5+) on each set, remembered per exercise.
- Standard mode: no effort input; effective reps not shown (or estimated, see questions).

## Per muscle group

Each exercise maps to muscle groups with a weight: **primary 1.0, secondary 0.5** (the way recent
volume research counts indirect sets as half). E.g. bench press: chest 1, triceps 0.5, front delts 0.5.
Muscle groups (proposal): chest, front delts, side delts, rear delts, lats/upper back, traps, lower
back, biceps, triceps, forearms, quads, hamstrings, glutes, calves, abs.

Per muscle the app shows effective reps **this session** and **this training week** against the
mode's goal: under the goal (keep going), in range (done), above (enough — more won't help, costs
recovery). Dorian HIT also shows days since the muscle was last trained (Dorian: ~7).

## Screens (sketch)

- **Settings → Training mode:** Standard · Dorian HIT · Lyle mode, and the goal range per mode.
- **Logging a set:** Dorian HIT — Warm-up / Working toggle; for working sets, optional "+ forced",
  "+ negatives", "+ rest-pause", "+ drop" counts. Lyle mode — RIR chips. Each saved set shows its
  effective reps.
- **Day log:** per muscle chips with today's effective reps vs goal, e.g. `Chest 18/20`.
- **Muscles tab:** bars per muscle group for the week (or per session), history by week; a body
  map later.
- **Logging screen:** the next target per set with its reason (Dorian: "11 × 100 kg last time → 12 today";
  Lyle: "run-up week 2: 92.5 kg × 8, stop at 2–3 RIR").
- **After a muscle's last set:** quick ratings (pump, soreness since last time, joints, performance).

## Questions to settle together

1. **Goal per session or per week?** Dorian trains each muscle once a week, so it's the same there.
   Lyle's 20–40 is per *workout*, with each muscle trained ~2×/week (≈ 40–80 per week). Proposal:
   goal per session, weekly view shows sessions × goal.
2. **Secondary muscles at 0.5**, or count only the primary muscle?
3. **Negatives:** count each forced negative as 1 effective rep, 0.5, or not at all?
4. **The 5-rep window:** keep 5 for all loads, or 4 for heavy sets (≤ 6 reps) and 5 above?
5. **Standard mode:** show estimated effective reps (assume ~2 RIR) or nothing?
6. **Dorian: reps after a weight increase** — target the set's bottom (e.g. 8), or no target ("beat it
   next time")? And is 12 the top for every exercise, or legs/calves higher (Dorian: legs 10–15)?
7. **Lyle: cycle length** default 6 or 8 weeks? Light week between cycles at ~80 % for one week?
8. **Feedback (M19):** how much may it change — ±1 set per muscle per session within the mode's range?

## Sources

- Lyle McDonald, [Muscular tension and muscle growth](https://bodyrecomposition.com/training/muscular-tension-and-muscle-growth) — effective reps, recruitment by load, rest-pause ≈ 8–9 effective reps.
- Lyle McDonald, [Reps per set for muscle growth](https://bodyrecomposition.com/muscle-gain/reps-per-set-for-muscle-growth) — 5–8 reps to/near failure (≤ 1 RIR); at ~70 % only the last 3–4 reps fully recruit.
- Lyle McDonald, [The hypertrophy zone](https://bodyrecomposition.com/training/hypertrophy-zone) — 6–15 reps as the practical zone; 40–70 total reps per body part (Wernbom).
- Lyle McDonald on [Muscle for Life ep. 1136](https://legionathletics.com/muscle-for-life-episode-1136-lyle-mcdonald-interview/) — sets of 8 at 2 RIR ≈ 3 effective reps; 4–6 sets to failure or 8–10 sets at 2 RIR per workout; "24 to 30 or so" effective reps; less volume closer to failure.
- Dorian Yates' warm-ups: [Fitness Volt](https://fitnessvolt.com/dorian-yates-warm-up-set-approach-that-won-him-6-mr-olympia/) (2 warm-ups at 50 % / 75 %, 8–12 reps, nowhere near failure; one set to failure and beyond); [cutting from 2 working sets to 1](https://fitnessvolt.com/dorian-yates-working-sets/).
- Dorian Yates' 1995–97 Olympia split and per-exercise sets/reps: [Set For Set](https://www.setforset.com/blogs/news/dorian-yates-workout-plan-4-programs) (secondary source).
- RP Hypertrophy app and its criticisms: reviews on alphaprogression.com, physiquecollective.com, dr-muscle.com, mesostrength.com and medium.com (secondary sources).
- Lyle McDonald's progression: Generic Bulking Routine FAQ (jcdfitness.com; summary on liftvault.com) — run-up 80–85 % / 90–95 %, add weight when the first set hits the top of the range with 1–2 reps to spare, 6–8 week cycles, change exercises only between cycles.
