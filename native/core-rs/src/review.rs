//! Cycle / block review — as src/lib/review.ts: what a Lyle cycle or the last weeks did (strength per
//! exercise, readiness answers per muscle) and exercises to swap before the next cycle. Pure; callers
//! pass real-load sets (load.rs).

use crate::calc::{add_days, Formula};
use crate::feedback::{sessions, trend_of, Trend};
use crate::model::{Exercise, ExerciseType, MuscleId, Muscles, Routine, WorkoutSet};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// A review's span: a Lyle cycle's own dates, or the last n weeks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum ReviewSpan {
    Cycle,
    Weeks { n: u32 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DateRange {
    pub from: String,
    pub to: String,
}

/// The review's dates: a Lyle cycle's own (up to today while it runs), or the last `weeks` weeks (a
/// cycle span without a cycle counts as 6 weeks).
pub fn review_range(span: ReviewSpan, cycle: Option<(&str, f64)>, today: &str) -> DateRange {
    if let (ReviewSpan::Cycle, Some((start, weeks))) = (span, cycle) {
        let end = add_days(start.to_string(), (weeks * 7.0 - 1.0) as i32);
        return DateRange { from: start.to_string(), to: if end.as_str() < today { end } else { today.to_string() } };
    }
    let w = match span {
        ReviewSpan::Cycle => 6,
        ReviewSpan::Weeks { n } => n as i32,
    };
    DateRange { from: add_days(today.to_string(), -7 * w + 1), to: today.to_string() }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Load,
    Reps,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseChange {
    pub exercise_id: String,
    /// Best e1RM (or reps, body weight alone) of the first and the last session in the period.
    pub first: f64,
    pub last: f64,
    /// last / first − 1, or None with one session.
    pub change: Option<f64>,
    pub kind: ChangeKind,
    pub sessions: f64,
    pub trend: Trend,
}

/// Per exercise with sets in [from, to] (exercises in the given order): first vs last session and the
/// trend over the period's sessions. Best change first; no change last.
pub fn exercise_changes(by_exercise: &[(String, Vec<WorkoutSet>)], from: &str, to: &str, formula: Formula) -> Vec<ExerciseChange> {
    let mut out = Vec::new();
    for (id, sets) in by_exercise {
        let in_range: Vec<WorkoutSet> = sets.iter().filter(|s| s.date.as_str() >= from && s.date.as_str() <= to).cloned().collect();
        // One scale per exercise: sets with a load (kg) when there are any, else reps — never mixed.
        let loaded: Vec<WorkoutSet> = in_range.iter().filter(|s| s.weight.map_or(false, |w| w > 0.0)).cloned().collect();
        let (kind, list) = if loaded.is_empty() {
            (ChangeKind::Reps, sessions(&in_range, formula, ""))
        } else {
            (ChangeKind::Load, sessions(&loaded, formula, ""))
        };
        if list.is_empty() {
            continue;
        }
        let (first, last) = (list[0].score, list[list.len() - 1].score);
        out.push(ExerciseChange {
            exercise_id: id.clone(),
            first,
            last,
            change: if list.len() > 1 && first > 0.0 { Some(last / first - 1.0) } else { None },
            kind,
            sessions: list.len() as f64,
            trend: trend_of(&list),
        });
    }
    let key = |c: &ExerciseChange| c.change.unwrap_or(f64::NEG_INFINITY);
    out.sort_by(|a, b| key(b).partial_cmp(&key(a)).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// Readiness answers per muscle in the period [fresh, a bit sore, still sore], in first-seen order: every
/// set that carries one (the logger saves it on the first set of a muscle's day only).
pub fn soreness(
    sets: &[WorkoutSet],
    muscles_of: &impl Fn(&str) -> Option<Muscles>,
    from: &str,
    to: &str,
) -> Vec<(MuscleId, [f64; 3])> {
    let mut out: Vec<(MuscleId, [f64; 3])> = Vec::new();
    for s in sets {
        let Some(sore) = s.sore else { continue };
        if s.date.as_str() < from || s.date.as_str() > to {
            continue;
        }
        let Some(m) = muscles_of(&s.exercise_id) else { continue };
        for mu in m.primary {
            let i = match out.iter().position(|(x, _)| *x == mu) {
                Some(i) => i,
                None => {
                    out.push((mu, [0.0; 3]));
                    out.len() - 1
                }
            };
            out[i].1[sore.clamp(0.0, 2.0) as usize] += 1.0;
        }
    }
    out
}

/// Exercises worth swapping before the next cycle: no progress, getting weaker, or joint pain flagged.
pub fn to_swap(c: &ExerciseChange, ex: Option<&Exercise>) -> bool {
    ex.map_or(false, |e| e.joint == Some(true))
        || c.trend == Trend::Weaker
        || c.trend == Trend::Stalled
        || (c.change.map_or(false, |x| x <= 0.0) && c.sessions >= 3.0)
}

/// Name order close to `localeCompare`: case-insensitive first, lower case before upper on a tie.
fn locale_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    a.to_lowercase().cmp(&b.to_lowercase()).then_with(|| b.cmp(a))
}

/// Alternatives for the same main muscle (the first primary), not already in use, favourites first.
pub fn alternatives<'a>(ex: &Exercise, library: &'a [Exercise], exclude: &HashSet<String>, n: usize, name_of: &impl Fn(&Exercise) -> String) -> Vec<&'a Exercise> {
    let Some(m) = ex.muscles.as_ref().and_then(|m| m.primary.first().copied()) else { return Vec::new() };
    let mut v: Vec<&Exercise> = library
        .iter()
        .filter(|x| x.id != ex.id && !exclude.contains(&x.id) && x.muscles.as_ref().and_then(|m| m.primary.first().copied()) == Some(m) && x.kind == ex.kind)
        .collect();
    v.sort_by(|a, b| (b.favorite == Some(true)).cmp(&(a.favorite == Some(true))).then_with(|| locale_cmp(&name_of(a), &name_of(b))));
    v.truncate(n);
    v
}

/// The routine with `from` replaced by `to` in every day: sets × reps kept, planned weights dropped (they
/// were the old exercise's; the new one's come from its own last time).
pub fn swap_in_routine(r: &Routine, from: &str, to: &str) -> Routine {
    let mut r = r.clone();
    for d in &mut r.days {
        for i in &mut d.items {
            if i.exercise_id == from {
                i.exercise_id = to.to_string();
                for p in &mut i.sets {
                    p.weight = None;
                }
            }
        }
    }
    r
}

/// Whether an exercise type has a reps field (the review only follows those).
pub fn has_reps(k: ExerciseType) -> bool {
    k.fields().contains(&crate::model::Field::Reps)
}
