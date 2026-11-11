//! Effective reps — as src/lib/effective.ts: reps done with all of a muscle's high-threshold fibres
//! recruited (docs/TRAINING-MODES.md).

use crate::calc::js_max;
use crate::calc::{js_round, Formula};
use crate::model::{MuscleId, Muscles, WorkoutSet};
use serde::{Deserialize, Serialize};

/// Reps-to-failure at or below which every rep counts (≈ 80 % of 1RM).
pub const HEAVY_RM: f64 = 8.0;
/// Reps before failure that count with a lighter load.
pub const LIGHT_WINDOW: f64 = 5.0;
/// RIR this high or more counts as no effort (the 5+ chip).
pub const MAX_RIR: f64 = 5.0;
/// How much a secondary muscle gets of an exercise's effective reps.
pub const SECONDARY: f64 = 0.5;

/// Reps before failure that count for a set whose load allows `rm` reps to failure.
pub fn window(rm: f64) -> f64 {
    if rm <= HEAVY_RM {
        rm
    } else if rm == HEAVY_RM + 1.0 {
        LIGHT_WINDOW + 1.0 // taper, so 9 to failure isn't worth less than 8
    } else {
        LIGHT_WINDOW
    }
}

/// Effective reps of one set: `reps` done with `rir` reps left in reserve (0 = failure), plus reps
/// after failure (forced, rest-pause, drop) which all count.
pub fn effective_reps(reps: f64, rir: f64, after_failure: f64) -> f64 {
    if !(reps > 0.0) {
        return 0.0;
    }
    let r = js_max(0.0, js_round(rir));
    let after = if after_failure.is_nan() { 0.0 } else { after_failure }; // `afterFailure || 0`
    let extra = js_max(0.0, js_round(after));
    if r >= MAX_RIR {
        return 0.0;
    }
    let rm = reps + r;
    js_max(0.0, reps - js_max(0.0, rm - window(rm))) + extra
}

/// Reps in reserve estimated from the exercise's best e1RM (Standard mode, no effort logged): the reps
/// this weight would allow to failure by the inverse of the 1RM formula, minus the reps done.
pub fn estimate_rir(weight: f64, reps: f64, e1rm: f64, formula: Formula) -> f64 {
    if !(weight > 0.0) || !(reps > 0.0) || !(e1rm > 0.0) {
        return 2.0;
    }
    if weight >= e1rm {
        return 0.0;
    }
    let rm = match formula {
        Formula::Brzycki => 37.0 - (36.0 * weight) / e1rm,
        Formula::Epley => 30.0 * (e1rm / weight - 1.0),
    };
    js_max(0.0, js_round(rm) - reps)
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SetEffective {
    pub n: f64,
    pub est: bool,
}

/// Effective reps of a logged set, whatever mode is on now: the effort stored with the set (RIR, reps
/// after failure, warm-up) when there is one, else estimated from the exercise's best e1RM.
/// Sets without reps, and body-weight sets without an RIR, count 0.
pub fn set_effective(s: &WorkoutSet, e1rm: f64, formula: Formula) -> SetEffective {
    let none = SetEffective { n: 0.0, est: false };
    let reps = match s.reps {
        Some(r) if !s.is_warmup() && r > 0.0 => r,
        _ => return none,
    };
    let after = s.after.unwrap_or(0.0);
    if let Some(rir) = s.rir {
        return SetEffective { n: effective_reps(reps, rir, after), est: false };
    }
    match s.weight {
        Some(w) if w > 0.0 => SetEffective { n: effective_reps(reps, estimate_rir(w, reps, e1rm, formula), after), est: true },
        _ => none,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct MuscleTotal {
    /// Effective reps from exercises with this muscle as primary.
    pub direct: f64,
    /// Secondary share from other exercises (SECONDARY × their effective reps).
    pub indirect: f64,
}

/// Effective reps per muscle of a session, from (muscles, effective reps) per set; in order of first
/// appearance (a JS Map's iteration order).
pub fn muscle_totals<I>(sets: I) -> Vec<(MuscleId, MuscleTotal)>
where
    I: IntoIterator<Item = (Option<Muscles>, f64)>,
{
    let mut out: Vec<(MuscleId, MuscleTotal)> = Vec::new();
    fn get(out: &mut Vec<(MuscleId, MuscleTotal)>, m: MuscleId) -> &mut MuscleTotal {
        let i = match out.iter().position(|(k, _)| *k == m) {
            Some(i) => i,
            None => {
                out.push((m, MuscleTotal::default()));
                out.len() - 1
            }
        };
        &mut out[i].1
    }
    for (muscles, effective) in sets {
        let Some(ms) = muscles else { continue };
        if !(effective > 0.0) {
            continue;
        }
        for &m in &ms.primary {
            get(&mut out, m).direct += effective;
        }
        for &m in &ms.secondary {
            if !ms.primary.contains(&m) {
                get(&mut out, m).indirect += effective * SECONDARY;
            }
        }
    }
    out
}

/// The entry of a `muscle_totals` result for a muscle.
pub fn total_of(totals: &[(MuscleId, MuscleTotal)], m: MuscleId) -> Option<MuscleTotal> {
    totals.iter().find(|(k, _)| *k == m).map(|(_, t)| *t)
}

/// A session is a muscle's main session when its direct work reaches half the goal; less is extra work.
pub fn is_main_session(direct: f64, goal_min: f64) -> bool {
    direct >= goal_min / 2.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table() {
        for (reps, rir, extra, want) in [(8.0, 0.0, 0.0, 8.0), (9.0, 0.0, 0.0, 6.0), (12.0, 0.0, 0.0, 5.0), (10.0, 4.0, 0.0, 1.0), (8.0, 0.0, 5.0, 13.0), (5.0, 5.0, 0.0, 0.0)] {
            assert_eq!(effective_reps(reps, rir, extra), want);
        }
        assert!(effective_reps(8.0, f64::NAN, 0.0).is_nan());
    }
}
