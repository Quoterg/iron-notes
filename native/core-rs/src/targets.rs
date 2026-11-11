//! Targets for the next session — as src/lib/targets.ts (docs/TRAINING-MODES.md). Dorian HIT: dynamic
//! double progression — each working set climbs in reps against the same set last time until it reaches
//! the top of the range, then that set's weight goes up one step and the reps restart wherever failure
//! lands (no rep target).

use crate::calc::js_round;
use crate::effective::{is_main_session, muscle_totals, total_of};
use crate::model::{MuscleId, Muscles, WorkoutSet};
use serde::{Deserialize, Serialize};

/// Top of the rep range in Dorian HIT unless the exercise sets its own.
pub const DORIAN_TOP: f64 = 12.0;
/// Days a muscle should rest between main sessions in Dorian HIT before a "too soon" hint.
pub const DORIAN_REST_DAYS: f64 = 5.0;
/// Dorian's working-set goal per muscle (a main session reaches half).
pub const DORIAN_GOAL: f64 = 20.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetWhy {
    /// Last time reached the top, so the weight goes up.
    Up,
    /// Beat last time's reps.
    Beat,
    /// A lighter-week set (~10 % less, stop short of failure).
    Light,
    Gap,
    Joint,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Target {
    /// Weight in kg (unchanged, or one step up).
    pub weight: f64,
    /// Reps to reach (one more than last time), or none right after a weight increase.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reps: Option<f64>,
    pub why: TargetWhy,
    /// The same set last time.
    pub prev: WorkoutSet,
}

/// `!s.warmup && s.reps > 0`
fn working(s: &WorkoutSet) -> bool {
    !s.is_warmup() && s.reps.is_some_and(|r| r > 0.0)
}

/// Target for one working set from the same set last time; `step_kg` is the exercise's weight step.
pub fn dorian_target(prev: &WorkoutSet, step_kg: f64, top: f64) -> Option<Target> {
    if !working(prev) {
        return None;
    }
    let w = prev.weight.unwrap_or(0.0);
    let reps = prev.reps.unwrap_or(f64::NAN);
    // Body-weight sets (no weight) keep adding reps: there is no weight to put up.
    if reps >= top && w > 0.0 {
        return Some(Target { weight: w + step_kg, reps: None, why: TargetWhy::Up, prev: prev.clone() });
    }
    Some(Target { weight: w, reps: Some(reps + 1.0), why: TargetWhy::Beat, prev: prev.clone() })
}

/// Targets for this session's working sets in order (the n-th working set against last time's n-th).
pub fn dorian_targets(last_workout: &[WorkoutSet], step_kg: f64, top: f64) -> Vec<Target> {
    last_workout.iter().filter(|s| working(s)).filter_map(|s| dorian_target(s, step_kg, top)).collect()
}

/// Last workout's sets as the starting point of a routine day in Dorian HIT: sets that reached the top
/// come with the weight one step up and no reps; the others with one rep more to beat.
pub fn progressed_sets(last_workout: &[WorkoutSet], step_kg: f64, top: f64) -> Vec<WorkoutSet> {
    last_workout
        .iter()
        .map(|s| match dorian_target(s, step_kg, top) {
            Some(t) => WorkoutSet { weight: Some(t.weight), reps: t.reps, ..s.clone() },
            None => s.clone(),
        })
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Warmup {
    pub weight: f64,
    pub reps: f64,
}

/// `down` of targets.ts / lyle.ts / cycle.ts: round down to a multiple of the weight step.
pub(crate) fn down(x: f64, step: f64) -> f64 {
    if step > 0.0 {
        (x / step + 1e-9).floor() * step
    } else {
        x
    }
}

/// Dorian's warm-ups before the first working set: ≈ 50 % × 10 and 75 % × 6, rounded down to the step.
pub fn warmups(work_kg: f64, step_kg: f64) -> Vec<Warmup> {
    if !(work_kg > 0.0) {
        return vec![];
    }
    [Warmup { weight: down(work_kg * 0.5, step_kg), reps: 10.0 }, Warmup { weight: down(work_kg * 0.75, step_kg), reps: 6.0 }]
        .into_iter()
        .filter(|w| w.weight > 0.0)
        .collect()
}

/// Days since 1970-01-01 of a civil date (H. Hinnant's algorithm), any proleptic year.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// `Date.parse(s + 'T00:00Z') / 86_400_000` for a `YYYY-MM-DD` string (V8: month 1–12, day 1–31, days
/// past the month's end roll over, e.g. 02-30 is 03-02); None where `Date.parse` gives NaN.
pub(crate) fn utc_day(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let digits = |r: std::ops::Range<usize>| -> Option<i64> {
        let part = &b[r];
        if part.iter().all(u8::is_ascii_digit) {
            Some(part.iter().fold(0i64, |n, c| n * 10 + (c - b'0') as i64))
        } else {
            None
        }
    };
    let (y, m, d) = (digits(0..4)?, digits(5..7)?, digits(8..10)?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some(days_from_civil(y, m, 1) + d - 1)
}

/// `Math.round((Date.parse(b + 'T00:00Z') − Date.parse(a + 'T00:00Z')) / dayMs)`: whole days from `a`
/// to `b`; NaN when either date is unreadable.
pub fn days_between(a: &str, b: &str) -> f64 {
    match (utc_day(a), utc_day(b)) {
        (Some(x), Some(y)) => js_round((y - x) as f64),
        _ => f64::NAN,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TooSoon {
    pub muscle: MuscleId,
    pub days: f64,
}

/// Muscles of `target` that had a main session (direct effective reps ≥ half the goal) less than
/// `rest_days` before `date`, with how many days ago (the most recent). Extra work doesn't count.
pub fn too_soon(
    date: &str,
    target: Option<&Muscles>,
    earlier: &[WorkoutSet],
    muscles_of: impl Fn(&str) -> Option<Muscles>,
    effective: impl Fn(&WorkoutSet) -> f64,
    rest_days: f64,
    goal: f64,
) -> Vec<TooSoon> {
    let Some(target) = target.filter(|t| !t.primary.is_empty()) else { return vec![] };
    // Map<string, WorkoutSet[]> in insertion order.
    let mut by_date: Vec<(&str, Vec<&WorkoutSet>)> = Vec::new();
    for s in earlier {
        let d = days_between(&s.date, date);
        if d < 1.0 || d >= rest_days || s.is_planned() {
            continue;
        }
        match by_date.iter_mut().find(|(k, _)| *k == s.date.as_str()) {
            Some((_, v)) => v.push(s),
            None => by_date.push((&s.date, vec![s])),
        }
    }
    let mut out: Vec<(MuscleId, f64)> = Vec::new();
    for (d, sets) in &by_date {
        let totals = muscle_totals(sets.iter().map(|s| (muscles_of(&s.exercise_id), effective(s))));
        for &m in &target.primary {
            let ago = days_between(d, date);
            let Some(tot) = total_of(&totals, m) else { continue };
            let prev = out.iter().position(|(k, _)| *k == m);
            // `!(out.get(m) <= ago)`: an unset or later (larger) value is replaced.
            let keep = prev.is_some_and(|i| out[i].1 <= ago);
            if is_main_session(tot.direct, goal) && !keep {
                match prev {
                    Some(i) => out[i].1 = ago,
                    None => out.push((m, ago)),
                }
            }
        }
    }
    out.into_iter().map(|(muscle, days)| TooSoon { muscle, days }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn day_arithmetic() {
        assert_eq!(days_between("2026-10-28", "2026-11-01"), 4.0);
        assert_eq!(days_between("2025-12-31", "2026-01-01"), 1.0);
        assert_eq!(days_between("2026-02-30", "2026-03-02"), 0.0);
        assert!(days_between("d", "2026-03-02").is_nan());
        assert!(days_between("2026-1-5", "2026-03-02").is_nan());
    }

    #[test]
    fn warmups_round_down_to_the_step() {
        let w = warmups(105.0, 2.5);
        assert_eq!((w[0].weight, w[1].weight), (52.5, 77.5));
        assert!(warmups(0.0, 2.5).is_empty());
    }
}
