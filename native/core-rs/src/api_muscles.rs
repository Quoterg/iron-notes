//! IronCore methods for the Muscles screen, body map and the day log's muscles (N7): the numbers of
//! Muscles.tsx and DayMuscles.tsx (effective reps from `effective_of`, weeks and goals from volume.rs).

use std::collections::{HashMap, HashSet};

use crate::api::{IronCore, R};
use crate::calc::js_round;
use crate::model::{Exercise, MuscleId, Muscles, WorkoutSet};
use crate::muscles::MUSCLES;
use crate::volume::{self, Goal, Status, WeekStatus};

/// How many weeks the Muscles screen shows (WEEKS in Muscles.tsx).
const WEEKS: usize = 8;

/// The mode's effective-reps goal per main session; none in standard mode.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MuscleGoal {
    pub min: f64,
    pub max: f64,
    /// As shown: "20", "20–40".
    pub label: String,
}

impl From<Goal> for MuscleGoal {
    fn from(g: Goal) -> Self {
        MuscleGoal { min: g.min, max: g.max, label: g.label }
    }
}

/// A session or day against the goal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum MuscleStatus {
    Under,
    In,
    Over,
}

impl From<Status> for MuscleStatus {
    fn from(s: Status) -> Self {
        match s {
            Status::Under => MuscleStatus::Under,
            Status::In => MuscleStatus::In,
            Status::Over => MuscleStatus::Over,
        }
    }
}

/// A muscle's week against the goal (the body map colour).
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum MuscleWeekState {
    Nothing,
    Under,
    In,
    Over,
    Trained,
}

impl From<WeekStatus> for MuscleWeekState {
    fn from(s: WeekStatus) -> Self {
        match s {
            WeekStatus::Nothing => MuscleWeekState::Nothing,
            WeekStatus::Under => MuscleWeekState::Under,
            WeekStatus::In => MuscleWeekState::In,
            WeekStatus::Over => MuscleWeekState::Over,
            WeekStatus::Trained => MuscleWeekState::Trained,
        }
    }
}

/// One muscle of the shown day (only those with direct work, as DayMuscles.tsx lists).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct DayMuscleRow {
    pub muscle: MuscleId,
    pub direct: f64,
    pub indirect: f64,
    /// A main session: shown as "Chest 22/20"; else as "Triceps +8 extra".
    pub main: bool,
    /// Rounded direct + indirect against the goal (none without a goal).
    pub status: Option<MuscleStatus>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct DayMusclesData {
    pub rows: Vec<DayMuscleRow>,
    pub goal: Option<MuscleGoal>,
    /// Some counted set was estimated rather than logged with effort: show "≈".
    pub estimated: bool,
}

/// A main session of the week: the date, its effective reps and how they compare to the goal.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MuscleSession {
    pub date: String,
    pub n: f64,
    pub status: Option<MuscleStatus>,
}

/// One muscle's row on the Muscles screen.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MuscleRow {
    pub muscle: MuscleId,
    /// This week's direct + indirect effective reps.
    pub total: f64,
    pub state: MuscleWeekState,
    pub sessions: Vec<MuscleSession>,
    /// The weekly totals, oldest first (`week_starts`).
    pub history: Vec<f64>,
    /// Trained in any of the weeks shown (the bars and history list these).
    pub trained: bool,
}

/// An exercise that trained a muscle this week.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MuscleContribution {
    pub exercise_id: String,
    pub name: String,
    pub n: f64,
    pub direct: bool,
}

/// An exercise to train a muscle today.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MuscleSuggestion {
    pub exercise_id: String,
    pub name: String,
    pub favorite: bool,
}

/// The drill-down of one muscle.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MuscleDrill {
    pub muscle: MuscleId,
    pub total: f64,
    pub contributions: Vec<MuscleContribution>,
    /// Exercises with the muscle as primary that were not done this week. The web sorts them by shown
    /// name, favourites first, and shows four: the app does that (names are translated there).
    pub suggestions: Vec<MuscleSuggestion>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MusclesOverview {
    pub goal: Option<MuscleGoal>,
    /// The week starts, oldest first; the last is this week.
    pub week_starts: Vec<String>,
    /// All muscles in canonical order.
    pub rows: Vec<MuscleRow>,
    /// Bar scale: the largest total this week, or the goal's top times two.
    pub scale: f64,
    /// For every muscle, in canonical order.
    pub drills: Vec<MuscleDrill>,
}

fn status_for(n: f64, goal: Option<&Goal>) -> Option<MuscleStatus> {
    goal.map(|g| volume::status_of(js_round(n), g).into())
}

#[uniffi::export]
impl IronCore {
    /// DayMuscles.tsx: the day's muscles against the mode's goal.
    pub fn day_muscles(&self, date: String) -> R<DayMusclesData> {
        self.with(|s| {
            let mode = s.settings()?.mode;
            let goal = volume::goal_of(mode);
            let sets = s.sets_on(&date)?;
            let eff = self.effective_of(s, &sets)?;
            let exercises = s.exercises()?;
            let muscles: HashMap<&str, &Muscles> = exercises.iter().filter_map(|e| e.muscles.as_ref().map(|m| (e.id.as_str(), m))).collect();
            let estimated = sets.iter().any(|x| eff.get(&x.id).is_some_and(|e| e.est && e.n > 0.0));
            let list = volume::day_muscles(
                &sets,
                &|id: &str| muscles.get(id).map(|m| (*m).clone()),
                &|x: &WorkoutSet| eff.get(&x.id).map_or(0.0, |e| e.n),
                goal.as_ref(),
            );
            let rows = list
                .into_iter()
                .filter(|d| d.direct > 0.0)
                .map(|d| DayMuscleRow {
                    muscle: d.muscle,
                    direct: d.direct,
                    indirect: d.indirect,
                    main: d.main,
                    status: status_for(d.direct + d.indirect, goal.as_ref()),
                })
                .collect();
            Ok(DayMusclesData { rows, goal: goal.map(Into::into), estimated })
        })
    }

    /// Muscles.tsx: this week and the last eight, per muscle, with the drill-down of each.
    pub fn muscles_overview(&self, today: String) -> R<MusclesOverview> {
        self.with(|s| {
            let st = s.settings()?;
            let goal = volume::goal_of(st.mode);
            let starts = volume::last_weeks(&today, WEEKS, st.week_start);
            let sets = s.sets_between(&starts[0], &today)?;
            let eff = self.effective_of(s, &sets)?;
            let exercises = s.exercises()?;
            let muscles: HashMap<&str, &Muscles> = exercises.iter().filter_map(|e| e.muscles.as_ref().map(|m| (e.id.as_str(), m))).collect();
            let muscles_of = |id: &str| muscles.get(id).map(|m| (*m).clone());
            let n_of = |x: &WorkoutSet| eff.get(&x.id).map_or(0.0, |e| e.n);
            let data = volume::weeks(&sets, &muscles_of, &n_of, goal.as_ref(), st.week_start);
            let week = |w: &str, m: MuscleId| data.iter().find(|(k, _)| k == w).and_then(|(_, v)| v.iter().find(|(id, _)| *id == m)).map(|(_, v)| v);
            let this = &starts[WEEKS - 1];
            let rows: Vec<MuscleRow> = MUSCLES
                .iter()
                .map(|&m| {
                    let w = week(this, m);
                    MuscleRow {
                        muscle: m,
                        total: w.map_or(0.0, |x| x.total),
                        state: volume::week_status(w, goal.as_ref(), st.mode).into(),
                        sessions: w
                            .map(|x| x.sessions.iter().map(|q| MuscleSession { date: q.date.clone(), n: q.n, status: status_for(q.n, goal.as_ref()) }).collect())
                            .unwrap_or_default(),
                        trained: starts.iter().any(|k| week(k, m).is_some()),
                        history: starts.iter().map(|k| week(k, m).map_or(0.0, |x| x.total)).collect(),
                    }
                })
                .collect();
            let scale = rows.iter().filter(|r| r.trained).map(|r| r.total).fold(1.0_f64, f64::max).max(goal.as_ref().map_or(0.0, |g| g.max * 2.0));
            let week_sets: Vec<WorkoutSet> = sets.iter().filter(|x| x.date.as_str() >= this.as_str()).cloned().collect();
            let by_id: HashMap<&str, &Exercise> = exercises.iter().map(|e| (e.id.as_str(), e)).collect();
            let drills = MUSCLES
                .iter()
                .zip(&rows)
                .map(|(&m, r)| {
                    let list = volume::contributions(&week_sets, &muscles_of, &n_of, m);
                    let used: HashSet<&str> = list.iter().map(|c| c.exercise_id.as_str()).collect();
                    let contributions = list
                        .iter()
                        .filter_map(|c| by_id.get(c.exercise_id.as_str()).map(|e| MuscleContribution { exercise_id: c.exercise_id.clone(), name: e.name.clone(), n: c.n, direct: c.direct }))
                        .collect();
                    let suggestions = exercises
                        .iter()
                        .filter(|e| e.muscles.as_ref().is_some_and(|x| x.primary.contains(&m)) && !used.contains(e.id.as_str()))
                        .map(|e| MuscleSuggestion { exercise_id: e.id.clone(), name: e.name.clone(), favorite: e.favorite == Some(true) })
                        .collect();
                    MuscleDrill { muscle: m, total: r.total, contributions, suggestions }
                })
                .collect();
            Ok(MusclesOverview { goal: goal.map(Into::into), week_starts: starts, rows, scale, drills })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::next_order;
    use crate::model::TrainingMode;

    fn ex(core: &IronCore, name: &str) -> String {
        core.library().unwrap().exercises.into_iter().find(|e| e.name == name).unwrap().id
    }

    fn set(id: &str, date: &str, exercise: &str, w: f64, r: f64) -> WorkoutSet {
        WorkoutSet { id: id.into(), date: date.into(), exercise_id: exercise.into(), order: next_order(), weight: Some(w), reps: Some(r), rir: Some(0.0), ..Default::default() }
    }

    #[test]
    fn day_muscles_main_and_extra_against_the_goal() {
        let core = IronCore::in_memory().unwrap();
        let mut st = core.settings().unwrap();
        st.mode = TrainingMode::Dorian;
        core.put_settings(st).unwrap();
        let bench = ex(&core, "Flat Barbell Bench Press");
        core.put_sets((0..5).map(|i| set(&format!("s{i}"), "2026-11-12", &bench, 80.0, 6.0)).collect()).unwrap();
        let d = core.day_muscles("2026-11-12".into()).unwrap();
        assert_eq!(d.goal.as_ref().unwrap().label, "20");
        let chest = d.rows.iter().find(|r| r.muscle == MuscleId::Chest).unwrap();
        assert!(chest.main && chest.direct > 0.0);
        assert!(chest.status.is_some());
        // Triceps only helped (indirect): not listed.
        assert!(d.rows.iter().all(|r| r.direct > 0.0 && r.muscle != MuscleId::Triceps));
        assert!(!d.estimated);
        assert!(core.day_muscles("2026-11-01".into()).unwrap().rows.is_empty());
    }

    #[test]
    fn overview_weeks_state_and_drill_down() {
        let core = IronCore::in_memory().unwrap();
        let mut st = core.settings().unwrap();
        st.mode = TrainingMode::Dorian;
        st.week_start = 1;
        core.put_settings(st).unwrap();
        let bench = ex(&core, "Flat Barbell Bench Press");
        // 2026-11-12 is a Thursday: this week starts 2026-11-09, the previous 2026-11-02.
        core.put_sets(vec![set("a", "2026-11-10", &bench, 80.0, 8.0), set("b", "2026-11-03", &bench, 80.0, 8.0)]).unwrap();
        let o = core.muscles_overview("2026-11-12".into()).unwrap();
        assert_eq!(o.week_starts.len(), 8);
        assert_eq!(o.week_starts[7], "2026-11-09");
        assert_eq!(o.rows.len(), 15);
        let chest = &o.rows[0];
        assert_eq!(chest.muscle, MuscleId::Chest);
        assert!(chest.trained && chest.total > 0.0);
        assert_eq!(chest.history.len(), 8);
        assert!(chest.history[7] > 0.0 && chest.history[5] == 0.0);
        assert_eq!(chest.state, MuscleWeekState::Under);
        let quads = o.rows.iter().find(|r| r.muscle == MuscleId::Quads).unwrap();
        assert!(!quads.trained && quads.state == MuscleWeekState::Nothing);
        assert_eq!(o.scale, 60.0);
        let d = &o.drills[0];
        assert_eq!(d.contributions.len(), 1);
        assert_eq!(d.contributions[0].name, "Flat Barbell Bench Press");
        assert!(d.contributions[0].direct);
        assert!(d.suggestions.iter().all(|x| x.exercise_id != bench));
        assert!(!d.suggestions.is_empty());
        // Triceps got a share as a secondary muscle.
        let tri = &o.drills[MUSCLES.iter().position(|&m| m == MuscleId::Triceps).unwrap()];
        assert!(!tri.contributions[0].direct);
    }

    #[test]
    fn standard_mode_has_no_goal() {
        let core = IronCore::in_memory().unwrap();
        let bench = ex(&core, "Flat Barbell Bench Press");
        core.put_sets(vec![set("a", "2026-11-12", &bench, 80.0, 8.0)]).unwrap();
        let o = core.muscles_overview("2026-11-12".into()).unwrap();
        assert!(o.goal.is_none());
        assert_eq!(o.rows[0].state, MuscleWeekState::Trained);
        assert!(core.day_muscles("2026-11-12".into()).unwrap().rows[0].status.is_none());
    }
}
