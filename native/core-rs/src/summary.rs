//! A workout's summary — as src/lib/summary.ts (M26): duration (first to last set logged), sets, volume,
//! effective reps, records and the muscles that met the mode's goal.

use std::collections::HashSet;

use crate::calc::{date_of, js_round};
use crate::model::{MuscleId, WorkoutSet};

/// The local calendar date of a time in ms, given the zone's offset east of UTC in minutes (the web
/// reads the device's zone: `isoDate(new Date(at))`).
fn local_date(at: f64, offset_min: i32) -> String {
    date_of(((at + f64::from(offset_min) * 60_000.0) / 86_400_000.0).floor() as i64)
}

/// Seconds from the first to the last set logged that day (`at`), or None with fewer than two. Only sets
/// logged on their own date count: a set added to Monday on Tuesday says nothing about how long that
/// workout took.
pub fn duration_of(sets: &[WorkoutSet], offset_min: i32) -> Option<f64> {
    let mut lo = f64::INFINITY;
    let mut hi = f64::NEG_INFINITY;
    for s in sets {
        let Some(at) = s.at else { continue };
        if s.is_planned() || local_date(at, offset_min) != s.date {
            continue;
        }
        lo = lo.min(at);
        hi = hi.max(at);
    }
    (hi > lo).then(|| js_round((hi - lo) / 1000.0))
}

/// A set's logged time after a tick: turning it done is "now"; otherwise it keeps its time.
pub fn stamp_at(prev_at: Option<f64>, was_done: bool, now_done: bool, now: f64) -> Option<f64> {
    if now_done && !was_done {
        Some(now)
    } else {
        prev_at
    }
}

/// "52 min", "1 h 5 min".
pub fn fmt_duration(sec: f64) -> String {
    let m = crate::calc::js_max(1.0, js_round(sec / 60.0)) as i64;
    if m < 60 {
        format!("{m} min")
    } else if m % 60 != 0 {
        format!("{} h {} min", m / 60, m % 60)
    } else {
        format!("{} h", m / 60)
    }
}

/// A muscle of the day, for `summary_of`: its effective reps and whether its session met the goal.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct DayMuscleMet {
    pub muscle: MuscleId,
    pub n: f64,
    pub met: bool,
}

/// A muscle whose main session met (or passed) the goal, with its effective reps.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct GoalMet {
    pub muscle: MuscleId,
    pub n: f64,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Summary {
    pub duration: Option<f64>,
    pub exercises: u32,
    pub sets: u32,
    pub volume: f64,
    pub effective: f64,
    pub records: u32,
    pub goals_met: Vec<GoalMet>,
}

pub fn summary_of(
    sets: &[WorkoutSet],
    volume: f64,
    effective: impl Fn(&WorkoutSet) -> f64,
    record_ids: &HashSet<String>,
    muscles: &[DayMuscleMet],
    offset_min: i32,
) -> Summary {
    let done: Vec<WorkoutSet> = sets.iter().filter(|s| !s.is_planned()).cloned().collect();
    let exercises: HashSet<&str> = done.iter().map(|s| s.exercise_id.as_str()).collect();
    Summary {
        duration: duration_of(&done, offset_min),
        exercises: exercises.len() as u32,
        sets: done.len() as u32,
        volume,
        effective: js_round(done.iter().map(&effective).fold(0.0, |a, b| a + b)),
        records: done.iter().filter(|s| record_ids.contains(&s.id)).count() as u32,
        goals_met: muscles.iter().filter(|m| m.met).map(|m| GoalMet { muscle: m.muscle, n: js_round(m.n) }).collect(),
    }
}
