//! Port of src/lib/progress.ts: progress of one exercise over time — graph series, rep maxes, bests and
//! workouts. Pure functions over an exercise's sets in byOrder order (date, then order); one pass each.
//! (N4: types and signatures fixed here; bodies ported to match the golden fixtures.)

use crate::calc::{add_days, js_max, js_min, js_round, one_rm, Formula};
use crate::load::LoadedSet;
use crate::model::{ExerciseType, Field, WorkoutSet};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct Point {
    pub date: String,
    pub value: f64,
}

/// What the graph can show (progress.ts `Metric`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "camelCase")]
pub enum Metric {
    Orm,
    MaxWeight,
    MaxReps,
    Volume,
    TotalReps,
    MaxDistance,
    TotalDistance,
    MaxTime,
    TotalTime,
    Pace,
}

/// The unit family of a metric's values (progress.ts `Kind`): weight kg, reps, distance km, time s, pace s/km.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "camelCase")]
pub enum MetricKind {
    Weight,
    Reps,
    Distance,
    Time,
    Pace,
}

/// All metrics in progress.ts `METRICS` key order.
pub const ALL_METRICS: [Metric; 10] = [
    Metric::Orm,
    Metric::MaxWeight,
    Metric::MaxReps,
    Metric::Volume,
    Metric::TotalReps,
    Metric::MaxDistance,
    Metric::TotalDistance,
    Metric::MaxTime,
    Metric::TotalTime,
    Metric::Pace,
];

#[uniffi::export]
pub fn metric_kind(m: Metric) -> MetricKind {
    match m {
        Metric::Orm | Metric::MaxWeight | Metric::Volume => MetricKind::Weight,
        Metric::MaxReps | Metric::TotalReps => MetricKind::Reps,
        Metric::MaxDistance | Metric::TotalDistance => MetricKind::Distance,
        Metric::MaxTime | Metric::TotalTime => MetricKind::Time,
        Metric::Pace => MetricKind::Pace,
    }
}

/// METRICS[m].needs.
fn needs(m: Metric) -> &'static [Field] {
    use Field::*;
    match m {
        Metric::Orm | Metric::Volume => &[Weight, Reps],
        Metric::MaxWeight => &[Weight],
        Metric::MaxReps | Metric::TotalReps => &[Reps],
        Metric::MaxDistance | Metric::TotalDistance => &[Distance],
        Metric::MaxTime | Metric::TotalTime => &[Time],
        Metric::Pace => &[Distance, Time],
    }
}

/// progress.ts `max` fold: ignores undefined and non-positive values.
fn fold_max(acc: Option<f64>, v: Option<f64>) -> Option<f64> {
    match v {
        Some(v) if v > 0.0 => Some(match acc {
            None => v,
            Some(a) => js_max(a, v),
        }),
        _ => acc,
    }
}

/// progress.ts `sum` fold.
fn fold_sum(acc: Option<f64>, v: Option<f64>) -> Option<f64> {
    match v {
        Some(v) if v > 0.0 => Some(acc.unwrap_or(0.0) + v),
        _ => acc,
    }
}

fn fold(m: Metric, acc: Option<f64>, s: &LoadedSet, f: Formula) -> Option<f64> {
    let w = &s.set;
    match m {
        Metric::Orm => fold_max(acc, Some(one_rm(w.weight.unwrap_or(0.0), w.reps.unwrap_or(0.0), f))),
        Metric::MaxWeight => fold_max(acc, w.weight),
        Metric::MaxReps => fold_max(acc, w.reps),
        Metric::Volume => fold_sum(acc, Some(s.vol.or(w.weight).unwrap_or(0.0) * w.reps.unwrap_or(0.0))),
        Metric::TotalReps => fold_sum(acc, w.reps),
        Metric::MaxDistance => fold_max(acc, w.distance),
        Metric::TotalDistance => fold_sum(acc, w.distance),
        Metric::MaxTime => fold_max(acc, w.time),
        Metric::TotalTime => fold_sum(acc, w.time),
        Metric::Pace => {
            let (d, t) = (w.distance, w.time);
            if !(d.map_or(false, |d| d > 0.0)) || !(t.map_or(false, |t| t > 0.0)) {
                return acc;
            }
            let p = t.unwrap() / d.unwrap();
            Some(match acc {
                None => p,
                Some(a) => js_min(a, p),
            })
        }
    }
}

/// `metricsFor`: the metrics an exercise type can show, in METRICS order.
pub fn metrics_for(t: ExerciseType) -> Vec<Metric> {
    let f = t.fields();
    ALL_METRICS.iter().copied().filter(|m| needs(*m).iter().all(|n| f.contains(n))).collect()
}

/// `dailySeries`: one point per workout day from `since` (inclusive) on. Volume uses each copy's `vol`
/// (both dumbbells, no body weight) when set, else its weight.
pub fn daily_series(sets: &[LoadedSet], metric: Metric, formula: Formula, since: &str) -> Vec<Point> {
    let mut out = Vec::new();
    let mut date: &str = "";
    let mut acc: Option<f64> = None;
    let flush = |out: &mut Vec<Point>, date: &str, acc: Option<f64>| {
        if let Some(a) = acc {
            if !date.is_empty() && a.is_finite() && a > 0.0 {
                out.push(Point { date: date.to_string(), value: a });
            }
        }
    };
    for s in sets {
        if s.set.date.as_str() < since {
            continue;
        }
        if s.set.date != date {
            flush(&mut out, date, acc);
            date = &s.set.date;
            acc = None;
        }
        acc = fold(metric, acc, s, formula);
    }
    flush(&mut out, date, acc);
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, uniffi::Enum)]
pub enum Range {
    #[serde(rename = "1m")]
    M1,
    #[serde(rename = "3m")]
    M3,
    #[serde(rename = "6m")]
    M6,
    #[serde(rename = "1y")]
    Y1,
    #[serde(rename = "all")]
    All,
}

/// `rangeStart`: the first date of a range ending today ("" for all).
pub fn range_start(range: Range, today: &str) -> String {
    let days = match range {
        Range::M1 => 30,
        Range::M3 => 91,
        Range::M6 => 182,
        Range::Y1 => 365,
        Range::All => 0,
    };
    if days != 0 {
        add_days(today.to_string(), -days)
    } else {
        String::new()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct RepMax {
    pub reps: f64,
    /// Heaviest (then earliest) set with at least `reps` reps, or none.
    pub set: Option<WorkoutSet>,
}

/// `repMaxTable` for 1..=max_reps.
pub fn rep_max_table(sets: &[WorkoutSet], max_reps: u32) -> Vec<RepMax> {
    let gt0 = |x: Option<f64>| x.map_or(false, |x| x > 0.0);
    // Best set per exact rep count (keys are the reps values; sets are in order, so ties keep the earliest).
    let mut exact: Vec<(f64, &WorkoutSet)> = Vec::new();
    let mut top = 0.0f64;
    for s in sets {
        if !gt0(s.weight) || !gt0(s.reps) {
            continue;
        }
        let r = s.reps.unwrap();
        match exact.iter_mut().find(|(k, _)| *k == r) {
            Some(slot) => {
                if s.weight.unwrap() > slot.1.weight.unwrap() {
                    slot.1 = s;
                }
            }
            None => exact.push((r, s)),
        }
        top = js_max(top, r);
    }
    let earlier = |a: &WorkoutSet, b: &WorkoutSet| a.date < b.date || (a.date == b.date && a.order < b.order);
    let n = max_reps as usize;
    let mut rows: Vec<Option<RepMax>> = vec![None; n];
    let mut best: Option<&WorkoutSet> = None;
    let mut r = top;
    while r >= 1.0 {
        let e = exact.iter().find(|(k, _)| *k == r).map(|(_, s)| *s);
        if let Some(e) = e {
            let take = match best {
                None => true,
                Some(b) => e.weight.unwrap() > b.weight.unwrap() || (e.weight == b.weight && earlier(e, b)),
            };
            if take {
                best = Some(e);
            }
        }
        if r <= max_reps as f64 && r.fract() == 0.0 {
            rows[r as usize - 1] = Some(RepMax { reps: r, set: best.cloned() });
        }
        r -= 1.0;
    }
    rows.into_iter().enumerate().map(|(i, row)| row.unwrap_or(RepMax { reps: (i + 1) as f64, set: None })).collect()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct BestOrm {
    pub value: f64,
    pub set: WorkoutSet,
}

/// `bestOrm`: the set with the best estimated 1RM.
pub fn best_orm(sets: &[WorkoutSet], formula: Formula) -> Option<BestOrm> {
    let mut best: Option<BestOrm> = None;
    for s in sets {
        let v = one_rm(s.weight.unwrap_or(0.0), s.reps.unwrap_or(0.0), formula);
        if v > 0.0 && best.as_ref().map_or(true, |b| v > b.value) {
            best = Some(BestOrm { value: v, set: s.clone() });
        }
    }
    best
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum BestField {
    Weight,
    Reps,
    Distance,
    Time,
    Pace,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct Best {
    pub field: BestField,
    pub set: WorkoutSet,
    pub value: f64,
}

/// `bests`: best (first-reached) value per field of the type, plus fastest pace for distance and time,
/// in first-found order (a JS Map's insertion order).
pub fn bests(sets: &[WorkoutSet], t: ExerciseType) -> Vec<Best> {
    let fields = t.fields();
    let mut found: Vec<Best> = Vec::new();
    for s in sets {
        for &f in fields {
            let bf = match f {
                Field::Weight => BestField::Weight,
                Field::Reps => BestField::Reps,
                Field::Distance => BestField::Distance,
                Field::Time => BestField::Time,
            };
            if let Some(v) = s.field(f) {
                if v > 0.0 {
                    let cur = found.iter().position(|b| b.field == bf);
                    // !(found.get(f)?.value >= v): also true for a NaN value
                    if !cur.map_or(false, |i| found[i].value >= v) {
                        let b = Best { field: bf, set: s.clone(), value: v };
                        match cur {
                            Some(i) => found[i] = b,
                            None => found.push(b),
                        }
                    }
                }
            }
        }
        if fields.contains(&Field::Distance) && fields.contains(&Field::Time) && s.distance.map_or(false, |d| d > 0.0) && s.time.map_or(false, |t| t > 0.0) {
            let p = s.time.unwrap() / s.distance.unwrap();
            match found.iter().position(|b| b.field == BestField::Pace) {
                Some(i) => {
                    if p < found[i].value {
                        found[i] = Best { field: BestField::Pace, set: s.clone(), value: p };
                    }
                }
                None => found.push(Best { field: BestField::Pace, set: s.clone(), value: p }),
            }
        }
    }
    found
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct Workout {
    pub date: String,
    pub sets: Vec<WorkoutSet>,
}

/// `workouts`: days with their sets, newest first.
pub fn workouts(sets: &[WorkoutSet]) -> Vec<Workout> {
    let mut out: Vec<Workout> = Vec::new();
    for s in sets {
        match out.last_mut() {
            Some(last) if last.date == s.date => last.sets.push(s.clone()),
            _ => out.push(Workout { date: s.date.clone(), sets: vec![s.clone()] }),
        }
    }
    out.reverse();
    out
}

/// `TIME_STEPS`: whole-second steps for time and pace axes.
pub const TIME_STEPS: [f64; 14] = [1.0, 2.0, 5.0, 10.0, 15.0, 30.0, 60.0, 120.0, 300.0, 600.0, 900.0, 1800.0, 3600.0, 7200.0];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct Scale {
    pub lo: f64,
    pub hi: f64,
    pub ticks: Vec<f64>,
}

/// `niceScale`: round axis bounds and 3–5 ticks covering [min, max]; `time_steps` restricts the step to
/// TIME_STEPS (time and pace axes).
#[uniffi::export]
pub fn nice_scale(min: f64, max: f64, time_steps: bool) -> Scale {
    let (mut min, mut max) = (min, max);
    if !min.is_finite() || !max.is_finite() {
        return Scale { lo: 0.0, hi: 1.0, ticks: vec![0.0, 1.0] };
    }
    if min == max {
        let pad = if min.abs() > 1.0 { min.abs() * 0.05 } else { 1.0 };
        min -= pad;
        max += pad;
    }
    let raw = (max - min) / 4.0;
    let mag = 10f64.powf(raw.log10().floor());
    // JS: `.find(...)!` is undefined when nothing matches, which makes the arithmetic below NaN.
    let step = if time_steps {
        TIME_STEPS.iter().copied().find(|s| *s >= raw).unwrap_or(TIME_STEPS[TIME_STEPS.len() - 1])
    } else {
        [1.0, 2.0, 2.5, 5.0, 10.0].iter().map(|m| m * mag).find(|s| *s >= raw).unwrap_or(f64::NAN)
    };
    let lo = (min / step).floor() * step;
    let hi = (max / step).ceil() * step;
    let mut ticks = Vec::new();
    let mut v = lo;
    while v <= hi + step / 2.0 {
        ticks.push(js_round(v / step) * step);
        v += step;
    }
    Scale { lo, hi, ticks }
}
