# Training modes and effective reps — design draft (for discussion)

Status: **draft, to brainstorm with the owner** before M13–M16. Nothing here is built yet.

## Idea

Besides plain logging (FitNotes-style "Standard" mode), Iron Notes tracks **effective reps** — the reps
done with all of a muscle's high-threshold fibres recruited, which are what drive growth — per
**muscle group**, against a goal of **20–40 effective reps per muscle group**. Two HIT modes:

| | **Failure-HIT** (Dorian Yates) | **RIR-HIT** (Lyle McDonald) |
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

- Failure-HIT: working sets are RIR 0 by definition (no RIR input); warm-up sets count 0.
- RIR-HIT: RIR chips (0 · 1 · 2 · 3 · 4 · 5+) on each set, remembered per exercise.
- Standard mode: no effort input; effective reps not shown (or estimated, see questions).

## Per muscle group

Each exercise maps to muscle groups with a weight: **primary 1.0, secondary 0.5** (the way recent
volume research counts indirect sets as half). E.g. bench press: chest 1, triceps 0.5, front delts 0.5.
Muscle groups (proposal): chest, front delts, side delts, rear delts, lats/upper back, traps, lower
back, biceps, triceps, forearms, quads, hamstrings, glutes, calves, abs.

Per muscle the app shows effective reps **this session** and **this training week** against the
mode's goal: under the goal (keep going), in range (done), above (enough — more won't help, costs
recovery). Failure-HIT also shows days since the muscle was last trained (Dorian: ~7).

## Screens (sketch)

- **Settings → Training mode:** Standard · Failure-HIT · RIR-HIT, and the goal range per mode.
- **Logging a set:** Failure-HIT — Warm-up / Working toggle; for working sets, optional "+ forced",
  "+ negatives", "+ rest-pause", "+ drop" counts. RIR-HIT — RIR chips. Each saved set shows its
  effective reps.
- **Day log:** per muscle chips with today's effective reps vs goal, e.g. `Chest 18/20`.
- **Muscles tab:** bars per muscle group for the week (or per session), history by week; a body
  map later.
- **HIT templates:** a Dorian-style 4-day split and a Lyle-style upper/lower routine as starting
  routines (M5 routines needed first). Double progression hint: top of the rep range reached in the
  all-out set → more weight next time.

## Questions to settle together

1. **Goal per session or per week?** Dorian trains each muscle once a week, so it's the same there.
   Lyle's 20–40 is per *workout*, with each muscle trained ~2×/week (≈ 40–80 per week). Proposal:
   goal per session, weekly view shows sessions × goal.
2. **Secondary muscles at 0.5**, or count only the primary muscle?
3. **Negatives:** count each forced negative as 1 effective rep, 0.5, or not at all?
4. **The 5-rep window:** keep 5 for all loads, or 4 for heavy sets (≤ 6 reps) and 5 above?
5. **Standard mode:** show estimated effective reps (assume ~2 RIR) or nothing?
6. **Warm-ups in Failure-HIT:** suggest the 50 % / 75 % warm-up weights automatically?
7. **Deload/recovery:** warn when a muscle is trained again too soon (e.g. < 5 days in Failure-HIT)?

## Sources

- Lyle McDonald, [Muscular tension and muscle growth](https://bodyrecomposition.com/training/muscular-tension-and-muscle-growth) — effective reps, recruitment by load, rest-pause ≈ 8–9 effective reps.
- Lyle McDonald, [Reps per set for muscle growth](https://bodyrecomposition.com/muscle-gain/reps-per-set-for-muscle-growth) — 5–8 reps to/near failure (≤ 1 RIR); at ~70 % only the last 3–4 reps fully recruit.
- Lyle McDonald, [The hypertrophy zone](https://bodyrecomposition.com/training/hypertrophy-zone) — 6–15 reps as the practical zone; 40–70 total reps per body part (Wernbom).
- Lyle McDonald on [Muscle for Life ep. 1136](https://legionathletics.com/muscle-for-life-episode-1136-lyle-mcdonald-interview/) — sets of 8 at 2 RIR ≈ 3 effective reps; 4–6 sets to failure or 8–10 sets at 2 RIR per workout; "24 to 30 or so" effective reps; less volume closer to failure.
- Dorian Yates' warm-ups: [Fitness Volt](https://fitnessvolt.com/dorian-yates-warm-up-set-approach-that-won-him-6-mr-olympia/) (2 warm-ups at 50 % / 75 %, 8–12 reps, nowhere near failure; one set to failure and beyond); [cutting from 2 working sets to 1](https://fitnessvolt.com/dorian-yates-working-sets/).
- Dorian Yates' 1995–97 Olympia split and per-exercise sets/reps: [Set For Set](https://www.setforset.com/blogs/news/dorian-yates-workout-plan-4-programs) (secondary source).
