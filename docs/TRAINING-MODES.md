# Training modes and effective reps — design

Status: **owner's direction set 2026-10-28**, answers to the first questions folded in the same day;
details marked *open* are still to confirm. Phase 2 milestones in [ROADMAP.md](ROADMAP.md).

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
  rest-pause, drop sets).
- Goal ≈ **20 effective reps per muscle group per session** (the session that trains it directly;
  see [Per muscle group](#per-muscle-group)). With heavy sets counting every rep, that is about three
  all-out sets of 6–8 — which is what Dorian did per body part.
- **Progression: dynamic double progression.** Each working set has its own target; reps go up until
  the set reaches **12**, then *that set's* weight goes up one step (exercise increment). After a weight increase there is
  no rep target — the set goes to failure anyway, and whatever it got becomes the target to beat next
  time. Sets progress independently (a reverse pyramid's top set and back-off sets move at their own
  pace).

### Lyle effective reps (Lyle McDonald)

- Each muscle about **twice a week**; sets stopped **0–4 reps short of failure**, logged as RIR.
  Goal **20–40 effective reps per muscle group per session** (Lyle: "24 to 30 or so" per workout).
- **Progression: Lyle's cycle** (Generic Bulking Routine FAQ). Cycle length **6 weeks by default**
  (2 run-up + 4 push), changeable; Lyle's own GBR is 8 (2 + 6). The coaches Lyle puts in the same
  "progressive tension overload" family use similar blocks: DC Training (Dante Trudel) 6 weeks
  "blast" + 2 "cruise", HST (Bryan Haycock) ~8 weeks of 2-week steps.
  - **Run-up** (weeks 1–2): start submaximal — about 80–85 % of the best weight for the rep range in
    week 1, 90–95 % in week 2 — sets well short of failure.
  - **Push** (weeks 3+): add weight when the **first set reaches the top of the rep range with 1–2
    reps to spare** (RIR ≥ 1); if those reps were a grind (RIR 0), keep the weight. Steps: 2.5–5 lb
    (≈1–2.5 kg) big lifts, 1–2.5 lb (≈0.5–1 kg) small ones — the exercise's increment.
  - **Between cycles**: the next cycle's run-up *is* the recovery (Lyle rejects separate
    "deconditioning" weeks and 3-on/1-off as relics); change exercises and/or rep ranges here if wanted,
    never within a cycle. Typical ranges: "tension" sets 6–8 and "fatigue" sets 12–15 (GBR: 6–8 sets,
    40–70 total reps per muscle per workout), main lifts 6–8, secondary 10–12, isolation 12–15.

## Effective reps (both modes)

Besides plain logging (FitNotes-style "Standard" mode), Iron Notes tracks **effective reps** — reps done
with all of a muscle's high-threshold fibres recruited, which are what drive growth — per **muscle
group**, against a goal per session.

| | **Dorian HIT** | **Lyle effective reps** |
|---|---|---|
| Effort | Every working set to failure (and beyond: forced reps, rest-pause, drop sets) | Sets stopped 0–4 reps short of failure, logged as RIR |
| Effective-rep goal per muscle per session | **~20** | **20–40** (Lyle: "24 to 30 or so") |
| Volume | 1 all-out set per exercise, 2–4 exercises per muscle | 6–8 sets per muscle (4–6 to failure *or* 8–10 at ~2 RIR) |
| Warm-ups | 1–2 per first exercise (≈50 % and 75 %, far from failure), count 0 | Normal warm-ups, count 0 |
| Reps | Upper body 6–10, legs 10–15, calves 10–12 | Tension 6–8, fatigue 12–15 |
| Frequency | Each muscle once every ~7 days (4-day split) | Each muscle about twice a week |

## Effective reps per set

Lyle McDonald ("Muscular tension and muscle growth"; podcast with Solomon Nelson): full recruitment
comes either from **load** — at about 80–85 % of 1RM, a 5–8RM, every rep is under full recruitment from
the first one ("a 5RM set is 5 effective reps"; 5 sets of 3 with a 5RM are 15) — or from **fatigue**:
with lighter loads only the last ~5 reps before failure count (a 15RM to failure ≈ 5; 25–30 reps ≈ 5).
Far from failure with a light load, nothing counts. Heavier than a 5RM gives no more recruitment, only
fewer reps (a max triple is 3, a max five is 5).

**The rule.** The set's *load* is expressed as the reps it would take to reach failure,
`R = reps + RIR` (≈ the weight's rep max). The reps that count are those done with at most `W(R)` reps
left before failure:

```
W(R) = R          if R ≤ 8      (heavy: every rep counts)
       6          if R = 9      (taper, our interpolation)
       5          if R ≥ 10     (lighter: only the last 5 before failure)
effective = max(0, reps − max(0, R − W(R)))  +  reps after failure
```

| Set | R | Effective reps |
|---|---|---|
| 8 to failure | 8 | **8** |
| 5 to failure | 5 | 5 |
| 3 reps with a 5RM (2 RIR) | 5 | 3 (×5 sets = 15, Lyle's example) |
| 6 reps, 2 RIR | 8 | 6 |
| 9 to failure | 9 | 6 |
| 12 to failure | 12 | 5 |
| 15 to failure | 15 | 5 |
| 8 reps, 2 RIR | 10 | 3 (Lyle: "about 3") |
| 10 reps, 4 RIR | 14 | 1 (Lyle: "maybe 1") |
| 6 reps with a 12RM (6 RIR) | 12 | 0 |
| warm-up set | — | 0 |
| 8 to failure + 3 rest-pause + 2 forced | 8 | 8 + 5 = 13 |

- **Reps after failure** (forced reps, rest-pause and drop-set reps) are one counter per set, each
  rep = 1: they are done under full recruitment by definition. **Negatives are not tracked** (more to
  log for a small, uncertain effect; a note in the set comment is enough).
- **Dorian HIT:** working sets are RIR 0 (no input); a Warm-up toggle makes a set count 0.
- **Lyle mode:** RIR chips (0 · 1 · 2 · 3 · 4 · 5+) per set, remembered per exercise; 5+ counts 0.
- **Standard mode:** estimated, shown with "≈". `R` comes from the exercise's estimated 1RM (the
  inverse of the app's e1RM formula at the set's weight), so RIR ≈ R − reps; without history, RIR 2
  is assumed. Bodyweight-only and cardio sets count 0 unless an RIR is given.
- The constants (8, 9 → 6, 5, secondary 0.5) live in one file (`lib/effective.ts`) with tests, so they
  can be tuned without touching the screens.

## Per muscle group

Each exercise maps to muscle groups: **primary 1.0, secondary 0.5** (confirmed). E.g. bench press:
chest 1, triceps 0.5, front delts 0.5.

**Goal per session** (confirmed). A muscle's session total is checked against the goal only in a
session that trains it **directly** (at least one exercise with it as primary). Indirect work — triceps
on chest day — is shown as "+n indirect" and counts toward the weekly picture, not toward that day's
goal. Status per directly trained muscle: under (keep going), in range (done), over (enough — more
costs recovery, not growth).

- **Dorian HIT:** one direct session per muscle per ~7 days in his split, so session = week; the day
  log shows `Chest 21/20`. A muscle trained directly again within ~5 days gets a "too soon" hint.
- **Lyle mode:** two direct sessions a week, each against 20–40; the weekly view shows both sessions.

## Screens (sketch)

- **Settings → Training mode:** Standard · Dorian HIT · Lyle effective reps, and the goal range per mode.
- **Logging a set:** Dorian HIT — Warm-up / Working toggle; for working sets, one optional "+ reps after failure"
  counter (forced, rest-pause, drop). Lyle mode — RIR chips. Each saved set shows its
  effective reps.
- **Day log:** per muscle chips with today's effective reps vs goal, e.g. `Chest 18/20`.
- **Muscles tab:** bars per muscle group for the week (or per session), history by week; a body
  map later.
- **Logging screen:** the next target per set with its reason (Dorian: "11 × 100 kg last time → 12 today";
  Lyle: "run-up week 2: 92.5 kg × 8, stop at 2–3 RIR").
- **After a muscle's last set:** quick ratings (pump, soreness since last time, joints, performance).

## Feedback and autoregulation (M19) — proposal, revised with the owner

RP asks after every session about pump, soreness, joints and workload, and adds sets from that on a
schedule. Soreness rated *after* a session says little about recovery, adding sets is its only lever,
and it doesn't ask *why* performance changed. Iron Notes: measure first, ask little, find the cause
before suggesting anything, and use each mode's own lever. Every suggestion is shown with its reason
and can be dismissed.

### Signals

1. **Performance (measured):** per exercise, beat / matched / below last time (reps at the same weight,
   else e1RM).
2. **Consistency (measured):** days since the muscle's last direct session, sessions missed against
   the plan.
3. **Diet phase (one setting):** Building · Maintaining · Cutting, plus the body-weight trend from the
   Body screen (falling ≥ ~0.5 %/week counts as cutting even if not set).
4. **Readiness (one tap, before training):** when a muscle's first set of the day is logged — fresh ·
   a bit sore · still sore.
5. **Joint pain (flag on an exercise, when needed).**

### Still sore (before training)

- **Dorian HIT:** suggest doing the **next workout of the split instead** (its muscles are recovered)
  and moving the sore muscle's workout one slot later — e.g. chest still sore on chest day → do legs
  today, chest next session. If every remaining workout hits a sore muscle: a rest day.
- **Lyle mode:** the session goes ahead; that muscle gets −1 set (not below 20 effective reps).

### Joint pain

- Stop progressing the load on that exercise (no weight increase while flagged).
- Offer a **swap to another exercise for the same primary muscle**. The new exercise starts from its
  **own** history — its last weights — never the old exercise's weight. Never done before: the first
  session is a baseline (Dorian: to failure with a weight you choose, the result becomes the target;
  Lyle: a feeler session at ~2–3 RIR, the cycle continues from there).
- Lyle mode keeps exercise changes for the next cycle unless the joint flag is on (pain overrides).

### Getting weaker (below last time for 2 sessions)

Find the cause first — days off are rarely the answer:

| Cause (how the app sees it) | Suggestion |
|---|---|
| **Inconsistent** — long gap or missed sessions | Not a recovery problem: no rest. Restart one step lower (Lyle: run-up week 2 weights; Dorian: last weight that was beaten) and build back. |
| **Cutting** — phase set, or body weight falling | Expected. The goal becomes holding strength: holding the weight counts as success, weight increases aren't pushed. Lyle: volume down toward 20 effective reps, intensity kept (Lyle: on a diet cut volume up to ~⅔, keep the load). Dorian: unchanged — one heavy set already is the low-volume, high-intensity setup. |
| **One exercise only**, the rest progress | Exercise-specific: check the joint flag; suggest a variation at the next opportunity (Lyle: next cycle). |
| **Consistent, not cutting, several muscles down** — real fatigue | Lyle: start the next cycle's run-up now (his built-in reset). Dorian: one lighter week — same workouts, ~10 % less weight, stop 1–2 reps short of failure — then back to all-out. Days off only if chosen. |

### Stalled (matched, not beaten, 2 sessions)

- **Lyle mode:** fresh → +1 set (up to 40); still sore → leave the volume, it's recovery.
- **Dorian HIT:** check ≥ 7 days between direct sessions (if less, suggest spacing); otherwise add one
  rep after failure (forced or rest-pause) on the last set for a session or two.

## Questions to settle together

1. **Dorian lighter week** (~10 % less, 1–2 short of failure) as the reset for real fatigue — OK, or
   would you rather keep failure and just drop the weight?
2. **Lyle cycle:** 6 weeks as 2 run-up + 4 push (default), or 6 push weeks after the run-up?
3. **Too soon in Dorian HIT:** < 5 days between direct sessions OK as the hint threshold?

## Sources

- Lyle McDonald, [Muscular tension and muscle growth](https://bodyrecomposition.com/training/muscular-tension-and-muscle-growth) — effective reps, recruitment by load, rest-pause ≈ 8–9 effective reps.
- Lyle McDonald, [Reps per set for muscle growth](https://bodyrecomposition.com/muscle-gain/reps-per-set-for-muscle-growth) — 5–8 reps to/near failure (≤ 1 RIR); at ~70 % only the last 3–4 reps fully recruit.
- Lyle McDonald, [The hypertrophy zone](https://bodyrecomposition.com/training/hypertrophy-zone) — 6–15 reps as the practical zone; 40–70 total reps per body part (Wernbom).
- Lyle McDonald on [Muscle for Life ep. 1136](https://legionathletics.com/muscle-for-life-episode-1136-lyle-mcdonald-interview/) — sets of 8 at 2 RIR ≈ 3 effective reps; 4–6 sets to failure or 8–10 sets at 2 RIR per workout; "24 to 30 or so" effective reps; less volume closer to failure.
- Dorian Yates' warm-ups: [Fitness Volt](https://fitnessvolt.com/dorian-yates-warm-up-set-approach-that-won-him-6-mr-olympia/) (2 warm-ups at 50 % / 75 %, 8–12 reps, nowhere near failure; one set to failure and beyond); [cutting from 2 working sets to 1](https://fitnessvolt.com/dorian-yates-working-sets/).
- Dorian Yates' 1995–97 Olympia split and per-exercise sets/reps: [Set For Set](https://www.setforset.com/blogs/news/dorian-yates-workout-plan-4-programs) (secondary source).
- RP Hypertrophy app and its criticisms: reviews on alphaprogression.com, physiquecollective.com, dr-muscle.com, mesostrength.com and medium.com (secondary sources).
- Lyle McDonald's progression: Generic Bulking Routine FAQ (jcdfitness.com; summary on liftvault.com) — run-up 80–85 % / 90–95 %, add weight when the first set hits the top of the range with 1–2 reps to spare, 6–8 week cycles, change exercises only between cycles.
- Lyle McDonald, [Hypertrophy program comparison: DC, HST and GBR](https://bodyrecomposition.com/?p=472) — frequency/volume/intensity trade-offs, cycles (DC 6 + 2 cruise, HST ~8 weeks, GBR 2 + 6), his view on "strategic deconditioning".
- Lyle McDonald with Solomon Nelson, ["The truth about effective reps and periodization"](https://sozai.app/transcript/truth-effective-reps-periodization-lyle-mcdonald/) (transcript) — 80–85 % / 5–8RM full recruitment from the first rep, 15RM ≈ 5, 20–40 per workout, 3-on/1-off as a relic.
- Chris Beardsley's stimulating-reps model (≈ 5RM threshold) and its critique: [Barbell Medicine forum](https://forum.barbellmedicine.com/t/stimulating-reps/4958).
