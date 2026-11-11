//! Lyle McDonald's progression — as src/lib/lyle.ts (Generic Bulking Routine FAQ; docs/TRAINING-MODES.md):
//! cycles of 6 weeks (2 run-up + 4 push; his own 8 selectable). Run-up: week 1 at ~80–85 % of the best
//! weight for the rep range, week 2 at ~90–95 %, well short of failure. Push: the exercise follows its
//! first set — top of the range reached with 1–2 reps to spare → weight up one step; a grind (0 in
//! reserve) → hold.

use crate::calc::{js_max, js_min};
use crate::model::WorkoutSet;
use crate::targets::{days_between, down, DORIAN_TOP};
use serde::{Deserialize, Serialize};

pub const CYCLE_WEEKS: [u32; 2] = [6, 8];
pub const DEFAULT_CYCLE: u32 = 6;
/// Run-up weeks and the share of the best weight they start from.
pub const RUN_UP: [f64; 2] = [0.825, 0.925];
/// Default width of the rep range below its top (top 12 → 8–12).
pub const RANGE_WIDTH: f64 = 4.0;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RepRange {
    pub bottom: f64,
    pub top: f64,
}

/// `repRange`: the exercise's rep range from its `repTop` / `repBottom`.
pub fn rep_range(rep_top: Option<f64>, rep_bottom: Option<f64>) -> RepRange {
    let top = rep_top.unwrap_or(DORIAN_TOP);
    let bottom = js_min(top, rep_bottom.unwrap_or_else(|| js_max(1.0, top - RANGE_WIDTH)));
    RepRange { bottom, top }
}

/// Week of the cycle that `date` is in (1 = the cycle's first week); 0 before it starts.
pub fn cycle_week(start: &str, date: &str) -> f64 {
    let days = days_between(start, date);
    if days < 0.0 {
        0.0
    } else {
        (days / 7.0).floor() + 1.0
    }
}

/// `!warmup && !planned && !deload && reps > 0 && weight > 0`
fn working(s: &WorkoutSet) -> bool {
    !s.is_warmup() && !s.is_planned() && !s.is_deload() && s.reps.is_some_and(|r| r > 0.0) && s.weight.is_some_and(|w| w > 0.0)
}

/// Best weight lifted for at least the bottom of the range, from sets before `before` (the cycle start).
pub fn best_for_range(sets: &[WorkoutSet], bottom: f64, before: &str) -> f64 {
    let mut best = 0.0;
    for s in sets {
        if working(s) && s.date.as_str() < before && s.reps.unwrap_or(f64::NAN) >= bottom {
            best = js_max(best, s.weight.unwrap_or(f64::NAN));
        }
    }
    best
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LyleWhy {
    /// Submaximal week (1 or 2).
    Runup,
    /// Top reached with reps to spare.
    Up,
    /// Top at 0 RIR: hold.
    Grind,
    /// Top reached without an RIR logged: hold until one is.
    Norir,
    /// Below the top: one more rep.
    Reps,
    Gap,
    Joint,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LyleTarget {
    pub weight: f64,
    pub reps: f64,
    pub why: LyleWhy,
    pub week: f64,
    /// Last session's first working set (push weeks).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prev: Option<WorkoutSet>,
}

/// The exercise's target for a session in `week` of the cycle (0 = no cycle: push rules). `last_first`
/// is the first working set of the last session before today; `best` the best weight for the range.
pub fn lyle_target(week: f64, best: f64, last_first: Option<&WorkoutSet>, step_kg: f64, range: RepRange) -> Option<LyleTarget> {
    // `RUN_UP[week - 1]`: only whole weeks 1 and 2 index the array.
    let pct = if week >= 1.0 && week.fract() == 0.0 && week <= RUN_UP.len() as f64 { Some(RUN_UP[week as usize - 1]) } else { None };
    if let Some(pct) = pct {
        if best > 0.0 {
            // A step bigger than the run-up weight: the share itself, unrounded (never more than planned).
            let d = down(best * pct, step_kg);
            let weight = if d == 0.0 || d.is_nan() { best * pct } else { d };
            return Some(LyleTarget { weight, reps: range.top, why: LyleWhy::Runup, week, prev: None });
        }
    }
    let last = last_first.filter(|s| working(s))?;
    let w = last.weight.unwrap_or(f64::NAN);
    let r = last.reps.unwrap_or(f64::NAN);
    let prev = Some(last.clone());
    if r >= range.top {
        // The weight only goes up on a set known to have reps to spare; without an RIR it holds and says why.
        return Some(match last.rir {
            None => LyleTarget { weight: w, reps: range.top, why: LyleWhy::Norir, week, prev },
            Some(rir) if rir >= 1.0 => LyleTarget { weight: w + step_kg, reps: range.bottom, why: LyleWhy::Up, week, prev },
            Some(_) => LyleTarget { weight: w, reps: range.top, why: LyleWhy::Grind, week, prev },
        });
    }
    Some(LyleTarget { weight: w, reps: js_min(range.top, r + 1.0), why: LyleWhy::Reps, week, prev })
}

/// The first working set of the last session before `date`.
pub fn last_first_set<'a>(sets: &'a [WorkoutSet], date: &str) -> Option<&'a WorkoutSet> {
    let mut first: Option<&WorkoutSet> = None;
    for s in sets {
        if !working(s) || s.date.as_str() >= date {
            continue;
        }
        if first.map_or(true, |f| s.date > f.date || (s.date == f.date && s.order < f.order)) {
            first = Some(s);
        }
    }
    first
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weeks_and_ranges() {
        assert_eq!(cycle_week("2026-10-26", "2026-11-02"), 2.0);
        assert_eq!(cycle_week("2026-10-26", "2026-10-25"), 0.0);
        assert_eq!(rep_range(None, None), RepRange { bottom: 8.0, top: 12.0 });
        assert_eq!(rep_range(Some(5.0), Some(9.0)), RepRange { bottom: 5.0, top: 5.0 });
    }
}
