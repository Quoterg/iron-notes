//! What the exercise/category editors, the calculators (Tools.tsx) and the workout summary (Summary.tsx)
//! call: free functions over the pure logic in tools.rs / muscles.rs / lyle.rs / summary.rs, and the
//! few `IronCore` methods that need the database.

use std::collections::{HashMap, HashSet};

use crate::api::{IronCore, R};
use crate::calc::Formula;
use crate::model::{Exercise, MuscleId, Muscles, WorkoutSet};
use crate::summary::{self, DayMuscleMet, Summary};
use crate::units::WeightUnit;
use crate::{load, lyle, muscles, records, tools, volume};

// ---- Calculators (Tools.tsx) ----

/// One row of the 1RM table: reps, the share of 1RM and the weight (the user's unit).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct OrmRow {
    pub reps: f64,
    pub pct: f64,
    pub weight: f64,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct OrmResult {
    pub orm: f64,
    pub rows: Vec<OrmRow>,
}

/// Plates for one side of the bar, largest first, and what can't be loaded (both sides; 0 when exact).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct PlateLoad {
    pub plates: Vec<f64>,
    pub rest: f64,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct WarmupRow {
    pub weight: f64,
    pub reps: f64,
}

/// A bar and plate sizes (largest first) in one unit.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct PlateConfig {
    pub bar: f64,
    pub sizes: Vec<f64>,
}

/// The calculators' input limits (tools.ts).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ToolLimits {
    pub min_plate: f64,
    pub max_plate: f64,
    pub max_sizes: u32,
    pub max_target: f64,
}

/// Estimated 1RM of a set and the % table (reps 1–12), in whatever unit the weight is in.
#[uniffi::export]
pub fn tools_orm(weight: f64, reps: f64, formula: Formula) -> OrmResult {
    let orm = tools::estimate(weight, reps, formula);
    let rows = tools::percent_table(orm, formula).into_iter().map(|r| OrmRow { reps: r.reps, pct: r.pct, weight: r.weight }).collect();
    OrmResult { orm, rows }
}

#[uniffi::export]
pub fn tools_plates(target: f64, bar: f64, sizes: Vec<f64>) -> PlateLoad {
    let r = tools::plates_per_side(target, bar, &sizes);
    PlateLoad { plates: r.plates, rest: r.rest }
}

#[uniffi::export]
pub fn tools_warmup(target: f64, bar: f64, sizes: Vec<f64>) -> Vec<WarmupRow> {
    tools::warmup(target, bar, &sizes).into_iter().map(|w| WarmupRow { weight: w.weight, reps: w.reps }).collect()
}

/// A usable plate set (sizes deduped, largest first), or None.
#[uniffi::export]
pub fn tools_clean_plates(bar: f64, sizes: Vec<f64>) -> Option<PlateConfig> {
    tools::clean_plates(bar, &sizes).map(|p| PlateConfig { bar: p.bar, sizes: p.sizes })
}

#[uniffi::export]
pub fn tools_default_plates(unit: WeightUnit) -> PlateConfig {
    let p = tools::default_plates(unit);
    PlateConfig { bar: p.bar, sizes: p.sizes }
}

#[uniffi::export]
pub fn tools_limits() -> ToolLimits {
    ToolLimits { min_plate: tools::MIN_PLATE, max_plate: tools::MAX_PLATE, max_sizes: tools::MAX_SIZES as u32, max_target: tools::MAX_TARGET }
}

// ---- Exercise editor (ExerciseEditor.tsx) ----

/// The starter muscles of a known exercise name (`defaultMuscles`).
#[uniffi::export]
pub fn default_muscles_for(name: String) -> Option<Muscles> {
    muscles::default_muscles(&name)
}

/// The editor's tap cycle (`cycle`): none → primary → secondary → none, kept in canonical order.
#[uniffi::export]
pub fn cycle_muscle(current: Option<Muscles>, id: MuscleId) -> Muscles {
    let cur = current.unwrap_or_default();
    let was_primary = cur.primary.contains(&id);
    let was_secondary = cur.secondary.contains(&id);
    let mut primary: Vec<MuscleId> = cur.primary.into_iter().filter(|&x| x != id).collect();
    let mut secondary: Vec<MuscleId> = cur.secondary.into_iter().filter(|&x| x != id).collect();
    if was_primary {
        secondary.push(id);
    } else if !was_secondary {
        primary.push(id);
    }
    primary.sort();
    secondary.sort();
    Muscles { primary, secondary }
}

/// Whether a starter exercise of this name is done with a bar and plates.
#[uniffi::export]
pub fn uses_plates_for_name(name: String) -> bool {
    tools::uses_plates_by_name(&name)
}

/// The "bar and plates" value to store: only an explicit choice that differs from the name's default.
#[uniffi::export]
pub fn plates_to_store(choice: Option<bool>, name: String) -> Option<bool> {
    tools::plates_to_store(choice, &name)
}

/// The bottom of the rep range when none is set (the editor's placeholder).
#[uniffi::export]
pub fn rep_bottom_default(rep_top: Option<f64>) -> f64 {
    lyle::rep_range(rep_top, None).bottom
}

/// Top of the rep range when none is set.
#[uniffi::export]
pub fn rep_top_default() -> f64 {
    crate::targets::DORIAN_TOP
}

/// The week of a Lyle cycle `date` is in (0 before it starts) — the editor warns about range changes mid-cycle.
#[uniffi::export]
pub fn cycle_week_of(start: String, date: String) -> f64 {
    lyle::cycle_week(&start, &date)
}

/// The swatches offered for a category (seed.ts `COLORS`).
#[uniffi::export]
pub fn category_colors() -> Vec<String> {
    crate::seed::COLORS.iter().map(|c| c.to_string()).collect()
}

// ---- Workout summary (summary.ts) ----

/// Seconds from the first to the last set logged that day, or None. `tz_offset_min`: the zone's offset east
/// of UTC in minutes at that day.
#[uniffi::export]
pub fn duration_of_sets(sets: Vec<WorkoutSet>, tz_offset_min: i32) -> Option<f64> {
    summary::duration_of(&sets, tz_offset_min)
}

/// "52 min", "1 h 5 min".
#[uniffi::export]
pub fn fmt_duration(sec: f64) -> String {
    summary::fmt_duration(sec)
}

/// A set's logged time after a tick (`stampAt`).
#[uniffi::export]
pub fn stamp_at(prev_at: Option<f64>, was_done: bool, now_done: bool, now: f64) -> Option<f64> {
    summary::stamp_at(prev_at, was_done, now_done, now)
}

#[uniffi::export]
impl IronCore {
    /// How many sets are logged for an exercise (the editor locks the type, and the delete confirm names them).
    pub fn count_sets_of(&self, exercise_id: String) -> R<u32> {
        self.with(|s| Ok(s.sets_of(&exercise_id)?.len() as u32))
    }

    /// Summary.tsx: the day's workout summary. `tz_offset_min`: the device zone's offset on that day.
    pub fn workout_summary(&self, date: String, tz_offset_min: i32) -> R<Summary> {
        let day = self.day(date)?;
        self.with(|s| {
            let st = s.settings()?;
            let goal = volume::goal_of(st.mode);
            let exercises: HashMap<String, Exercise> = s.exercises()?.into_iter().map(|e| (e.id.clone(), e)).collect();
            let all: Vec<WorkoutSet> = day.sets.iter().filter(|x| !x.is_planned() && exercises.contains_key(&x.exercise_id)).cloned().collect();
            let eff = self.effective_of(s, &all)?;
            let n_of = |x: &WorkoutSet| eff.get(&x.id).map_or(0.0, |e| e.n);
            let muscles_of = |id: &str| exercises.get(id).and_then(|e| e.muscles.clone());
            let met: Vec<DayMuscleMet> = volume::day_muscles(&all, &muscles_of, &n_of, goal.as_ref())
                .into_iter()
                .map(|m| {
                    let n = m.direct + m.indirect;
                    DayMuscleMet { muscle: m.muscle, n, met: m.main && goal.as_ref().map_or(true, |g| volume::status_of(n, g) != volume::Status::Under) }
                })
                .collect();
            let volume = records::day_totals(&all, |x| load::volume_weight(x.weight, load::load_of(exercises.get(&x.exercise_id)))).volume;
            let record_ids: HashSet<String> = day.records.into_iter().collect();
            Ok(summary::summary_of(&all, volume, n_of, &record_ids, &met, tz_offset_min))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::next_order;
    use crate::model::TrainingMode;

    #[test]
    fn muscle_cycle_goes_none_primary_secondary_none() {
        let a = cycle_muscle(None, MuscleId::Triceps);
        assert_eq!((a.primary.clone(), a.secondary.clone()), (vec![MuscleId::Triceps], vec![]));
        let b = cycle_muscle(Some(cycle_muscle(Some(a), MuscleId::Chest)), MuscleId::Triceps);
        assert_eq!((b.primary.clone(), b.secondary.clone()), (vec![MuscleId::Chest], vec![MuscleId::Triceps]));
        let c = cycle_muscle(Some(b), MuscleId::Triceps);
        assert_eq!((c.primary, c.secondary), (vec![MuscleId::Chest], vec![]));
    }

    #[test]
    fn calculators() {
        let r = tools_orm(100.0, 5.0, Formula::Epley);
        assert!(r.orm > 100.0 && r.rows.len() == 12 && r.rows[0].pct == 100.0);
        let p = tools_plates(100.0, 20.0, tools_default_plates(WeightUnit::Kg).sizes);
        assert_eq!(p.plates, vec![25.0, 15.0]);
        assert_eq!(p.rest, 0.0);
        assert_eq!(tools_warmup(100.0, 20.0, tools_default_plates(WeightUnit::Kg).sizes)[0], WarmupRow { weight: 20.0, reps: 10.0 });
        assert!(tools_clean_plates(20.0, vec![]).is_none());
        assert_eq!(rep_bottom_default(Some(8.0)), 4.0);
    }

    #[test]
    fn summary_of_a_day_with_duration_records_and_goals() {
        let core = IronCore::in_memory().unwrap();
        let mut st = core.settings().unwrap();
        st.mode = TrainingMode::Dorian;
        core.put_settings(st).unwrap();
        let bench = core.library().unwrap().exercises.into_iter().find(|e| e.name == "Flat Barbell Bench Press").unwrap().id;
        // 2026-11-12 10:00 and 10:45 local (UTC+1).
        let base = 1_794_474_000_000.0_f64;
        let set = |i: usize, at: f64| WorkoutSet {
            id: format!("s{i}"), date: "2026-11-12".into(), exercise_id: bench.clone(), order: next_order(),
            weight: Some(80.0), reps: Some(6.0), rir: Some(0.0), at: Some(at), ..Default::default()
        };
        core.put_sets((0..5).map(|i| set(i, base + i as f64 * 11.0 * 60_000.0)).collect()).unwrap();
        assert_eq!(core.count_sets_of(bench.clone()).unwrap(), 5);
        let s = core.workout_summary("2026-11-12".into(), 60).unwrap();
        assert_eq!((s.sets, s.exercises), (5, 1));
        assert_eq!(s.duration, Some(44.0 * 60.0));
        assert_eq!(s.volume, 5.0 * 80.0 * 6.0);
        assert!(s.effective > 0.0 && s.records >= 1);
        assert!(s.goals_met.iter().any(|g| g.muscle == MuscleId::Chest));
        // In a zone where those times are on another date, nothing counts as logged that day.
        assert_eq!(core.workout_summary("2026-11-12".into(), 60 + 24 * 60).unwrap().duration, None);
        assert_eq!(core.workout_summary("2026-11-01".into(), 60).unwrap().sets, 0);
    }
}
