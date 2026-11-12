//! Training cycles on the calendar — as src/lib/cycle.ts (docs/TRAINING-MODES.md): Lyle's cycle (run-up
//! weeks, then push) and Dorian's lighter week (~10 % less, stop 1–2 reps short of failure; its sets
//! don't drive progression), plus the program: a routine whose workouts rotate as the cycle's sessions.

use crate::calc::add_days;
use crate::lyle::{cycle_week, RUN_UP};
pub use crate::model::{Routine, RoutineDay};
use crate::model::{TrainingMode, WorkoutSet};
use crate::targets::{down, Target, TargetWhy};
use serde::{Deserialize, Serialize};

/// A lighter week lasts this many days.
pub const LIGHT_DAYS: i32 = 7;
/// Share of the working weight in a lighter week.
pub const LIGHT_SHARE: f64 = 0.9;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Runup,
    Push,
    Light,
}

/// Lyle's cycle: first day and length in weeks (2 run-up + the rest push).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Cycle {
    pub start: String,
    pub weeks: f64,
}

/// Dorian HIT's lighter week (7 days from `start`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Light {
    pub start: String,
}

/// The part of `Settings` that `phaseOn` reads.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct PhaseSettings {
    #[serde(default)]
    pub mode: TrainingMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cycle: Option<Cycle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub light: Option<Light>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PhaseInfo {
    pub phase: Phase,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub week: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weeks: Option<f64>,
}

/// Whether `date` is in the lighter week started on `start`.
pub fn in_light(light: Option<&Light>, date: &str) -> bool {
    light.is_some_and(|l| date >= l.start.as_str() && date < add_days(l.start.clone(), LIGHT_DAYS).as_str())
}

/// Last day of a lighter week.
pub fn light_end(light: &Light) -> String {
    add_days(light.start.clone(), LIGHT_DAYS - 1)
}

/// The cycle phase of `date` for the mode (None outside any cycle).
pub fn phase_on(st: &PhaseSettings, date: &str) -> Option<PhaseInfo> {
    match st.mode {
        TrainingMode::Dorian => in_light(st.light.as_ref(), date).then_some(PhaseInfo { phase: Phase::Light, week: None, weeks: None }),
        TrainingMode::Lyle => {
            let cycle = st.cycle.as_ref()?;
            let week = cycle_week(&cycle.start, date);
            if week < 1.0 || week > cycle.weeks {
                return None;
            }
            let phase = if week <= RUN_UP.len() as f64 { Phase::Runup } else { Phase::Push };
            Some(PhaseInfo { phase, week: Some(week), weeks: Some(cycle.weeks) })
        }
        TrainingMode::Standard => None,
    }
}

/// A lighter-week set from the same set of the last normal session: ~10 % less, same reps to aim for.
pub fn light_set(s: &WorkoutSet, step_kg: f64) -> WorkoutSet {
    let weight = match s.weight {
        Some(w) if !s.is_warmup() && w > 0.0 => w,
        _ => return s.clone(),
    };
    let lighter = down(weight * LIGHT_SHARE, step_kg);
    // `down(...) || s.weight`
    let new = if lighter == 0.0 || lighter.is_nan() { s.weight } else { Some(lighter) };
    WorkoutSet { weight: new, ..s.clone() }
}

/// Lighter-week targets: each working set of the last normal session, ~10 % lighter, same reps to aim for.
pub fn light_targets(last: &[WorkoutSet], step_kg: f64) -> Vec<Target> {
    last.iter()
        .filter(|s| !s.is_warmup() && s.reps.is_some_and(|r| r > 0.0))
        .map(|s| Target { weight: light_set(s, step_kg).weight.unwrap_or(0.0), reps: s.reps, why: TargetWhy::Light, prev: s.clone() })
        .collect()
}

/// A set copied to `to`: a lighter-week set stays one only when copied into a lighter week.
pub fn redated(s: &WorkoutSet, to: &str, light: Option<&Light>) -> WorkoutSet {
    let deload = if s.is_deload() && in_light(light, to) { Some(true) } else { None };
    WorkoutSet { date: to.to_string(), deload, ..s.clone() }
}

/// Sets that drive progression: done, not from a lighter week.
pub fn progressing(s: &WorkoutSet) -> bool {
    !s.is_planned() && !s.is_deload()
}

/// The program's next workout: the one after the last logged from it (the first when none).
pub fn next_program_day<'a>(routine: Option<&'a Routine>, last_day_id: Option<&str>) -> Option<&'a RoutineDay> {
    let days = &routine?.days;
    if days.is_empty() {
        return None;
    }
    // findIndex → -1 when not found, so the first day follows.
    let next = last_day_id.and_then(|id| days.iter().position(|d| d.id == id)).map_or(0, |i| (i + 1) % days.len());
    days.get(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lyle_phases() {
        let st = PhaseSettings { mode: TrainingMode::Lyle, cycle: Some(Cycle { start: "2026-10-26".into(), weeks: 6.0 }), light: None };
        assert_eq!(phase_on(&st, "2026-11-09").unwrap().phase, Phase::Push);
        assert!(phase_on(&st, "2026-12-07").is_none());
    }

    #[test]
    fn lighter_week_end() {
        assert_eq!(light_end(&Light { start: "2026-10-29".into() }), "2026-11-04");
    }
}
