//! Port of src/lib/progress.ts: progress of one exercise over time — graph series, rep maxes, bests and
//! workouts. Pure functions over an exercise's sets in byOrder order (date, then order); one pass each.
//! (N4: types and signatures fixed here; bodies ported to match the golden fixtures.)

use crate::calc::Formula;
use crate::load::LoadedSet;
use crate::model::{ExerciseType, WorkoutSet};
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
    let _ = m;
    MetricKind::Weight
}

/// `metricsFor`: the metrics an exercise type can show, in METRICS order.
pub fn metrics_for(t: ExerciseType) -> Vec<Metric> {
    let _ = t;
    Vec::new()
}

/// `dailySeries`: one point per workout day from `since` (inclusive) on. Volume uses each copy's `vol`
/// (both dumbbells, no body weight) when set, else its weight.
pub fn daily_series(sets: &[LoadedSet], metric: Metric, formula: Formula, since: &str) -> Vec<Point> {
    let _ = (sets, metric, formula, since);
    Vec::new()
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
    let _ = (range, today);
    String::new()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct RepMax {
    pub reps: f64,
    /// Heaviest (then earliest) set with at least `reps` reps, or none.
    pub set: Option<WorkoutSet>,
}

/// `repMaxTable` for 1..=max_reps.
pub fn rep_max_table(sets: &[WorkoutSet], max_reps: u32) -> Vec<RepMax> {
    let _ = (sets, max_reps);
    Vec::new()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct BestOrm {
    pub value: f64,
    pub set: WorkoutSet,
}

/// `bestOrm`: the set with the best estimated 1RM.
pub fn best_orm(sets: &[WorkoutSet], formula: Formula) -> Option<BestOrm> {
    let _ = (sets, formula);
    None
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
    let _ = (sets, t);
    Vec::new()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct Workout {
    pub date: String,
    pub sets: Vec<WorkoutSet>,
}

/// `workouts`: days with their sets, newest first.
pub fn workouts(sets: &[WorkoutSet]) -> Vec<Workout> {
    let _ = sets;
    Vec::new()
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
    let _ = (min, max, time_steps);
    Scale { lo: 0.0, hi: 1.0, ticks: vec![0.0, 1.0] }
}
