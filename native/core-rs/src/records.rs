//! Records and set helpers — the part of src/lib/calc.ts that is not dates, time or 1RM: set order,
//! personal records, previous workout, completeness, day totals.

use crate::load::LoadedSet;
use crate::model::{ExerciseType, WorkoutSet};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashMap;

/// `byOrder`: by date, then creation order. (A NaN `order` compares equal, as a JS comparator
/// returning NaN does.)
pub fn by_order(a: &WorkoutSet, b: &WorkoutSet) -> Ordering {
    if a.date < b.date {
        Ordering::Less
    } else if a.date > b.date {
        Ordering::Greater
    } else {
        (a.order - b.order).partial_cmp(&0.0).unwrap_or(Ordering::Equal)
    }
}

/// `recordIds` for plain sets (no load mapping: 0 kg never counts). Ids in insertion order.
pub fn record_ids(sets: &[WorkoutSet], kind: ExerciseType, sorted: bool) -> Vec<String> {
    let v: Vec<(&WorkoutSet, bool)> = sets.iter().map(|s| (s, false)).collect();
    record_ids_inner(v, kind, sorted)
}

/// `recordIds` for load-mapped copies: a `vol` marks a copy where 0 kg counts (body weight alone).
pub fn record_ids_loaded(sets: &[LoadedSet], kind: ExerciseType, sorted: bool) -> Vec<String> {
    let v: Vec<(&WorkoutSet, bool)> = sets.iter().map(|s| (&s.set, s.vol.is_some())).collect();
    record_ids_inner(v, kind, sorted)
}

fn record_ids_inner(mut chrono: Vec<(&WorkoutSet, bool)>, kind: ExerciseType, sorted: bool) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut add = |id: &str| {
        if !out.iter().any(|x| x == id) {
            out.push(id.to_string());
        }
    };
    if !sorted {
        chrono.sort_by(|a, b| by_order(a.0, b.0));
    }
    if kind == ExerciseType::WeightReps {
        // rep count -> index into `best` (the Map: best set per rep count)
        let mut idx: HashMap<u64, usize> = HashMap::new();
        let mut best: Vec<(f64, &WorkoutSet)> = Vec::new();
        for (s, zero_ok) in chrono {
            let reps_ok = s.reps.map_or(false, |r| r > 0.0);
            let weight_ok = s.weight.map_or(false, |w| w > 0.0 || (zero_ok && w == 0.0));
            if s.is_planned() || s.is_warmup() || !reps_ok || !weight_ok {
                continue;
            }
            let r = s.reps.unwrap();
            match idx.get(&r.to_bits()) {
                Some(&i) => {
                    if s.weight.unwrap() > best[i].1.weight.unwrap() {
                        best[i].1 = s;
                    }
                }
                None => {
                    idx.insert(r.to_bits(), best.len());
                    best.push((r, s));
                }
            }
        }
        best.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(Ordering::Equal));
        let mut heavier = f64::NEG_INFINITY;
        for (_, s) in best {
            if s.weight.unwrap() > heavier {
                add(&s.id);
                heavier = s.weight.unwrap();
            }
        }
        return out;
    }
    let f = kind.fields()[0];
    let mut top: Option<&WorkoutSet> = None;
    for (s, _) in chrono {
        let v = s.field(f).unwrap_or(0.0);
        if !s.is_planned() && !s.is_warmup() && v > 0.0 && top.map_or(true, |t| v > t.field(f).unwrap_or(0.0)) {
            top = Some(s);
        }
    }
    if let Some(t) = top {
        add(&t.id);
    }
    out
}

/// The latest workout before `date` that has sets of the exercise, with those sets.
pub fn previous_workout(sets: &[WorkoutSet], date: &str) -> Vec<WorkoutSet> {
    let mut last = "";
    for s in sets {
        if s.date.as_str() < date && s.date.as_str() > last {
            last = &s.date;
        }
    }
    if last.is_empty() {
        return Vec::new();
    }
    let mut v: Vec<WorkoutSet> = sets.iter().filter(|s| s.date == last).cloned().collect();
    v.sort_by(by_order);
    v
}

/// Whether a set has something in every field its exercise type records.
pub fn is_complete(s: &WorkoutSet, kind: ExerciseType) -> bool {
    let fields = kind.fields();
    fields.iter().all(|&f| s.field(f).map_or(false, |v| v.is_finite() && v >= 0.0))
        && fields.iter().any(|&f| s.field(f).map_or(false, |v| v > 0.0))
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct DayTotals {
    pub sets: usize,
    pub reps: f64,
    pub volume: f64,
}

/// Totals of a day's sets. `vw`: the weight that counts in volume (see `day_totals_default`).
pub fn day_totals(sets: &[WorkoutSet], vw: impl Fn(&WorkoutSet) -> f64) -> DayTotals {
    let (mut reps, mut volume) = (0.0, 0.0);
    for s in sets {
        reps += s.reps.unwrap_or(0.0);
        volume += vw(s) * s.reps.unwrap_or(0.0);
    }
    DayTotals { sets: sets.len(), reps, volume }
}

/// `dayTotals(sets)` with the default volume weight, the entered weight.
pub fn day_totals_default(sets: &[WorkoutSet]) -> DayTotals {
    day_totals(sets, |s| s.weight.unwrap_or(0.0))
}
