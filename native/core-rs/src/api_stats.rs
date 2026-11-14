//! IronCore methods for Statistics (Analysis.tsx, analysis.ts) and the cycle review (Review.tsx,
//! review.ts) (N7): one call per screen.

use std::collections::{HashMap, HashSet};

use crate::analysis::{period_start, summarize, StatsPeriod};
use crate::api::{body_weights, IronCore, R};
use crate::load::{self, load_of, uses_body_weight};
use crate::model::{Exercise, MuscleId, TrainingMode, WorkoutSet};
use crate::review::{alternatives, exercise_changes, has_reps, review_range, soreness, swap_in_routine, to_swap, ChangeKind, ReviewSpan};
use crate::volume::{goal_of, period_muscles};

/// Statistics of a period (Analysis.tsx): totals, categories, workouts per week, the most frequent
/// exercises, and effective reps per muscle.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct StatsSummary {
    /// The period's dates; `from` is "" for "all".
    pub from: String,
    pub to: String,
    pub workouts: u32,
    pub sets: u32,
    pub reps: u32,
    /// kg
    pub volume: f64,
    /// seconds
    pub time: f64,
    /// km
    pub distance: f64,
    /// Sets by category, most first.
    pub categories: Vec<StatsCategory>,
    /// Exercises, most workouts first (the screen shows the top ten).
    pub exercises: Vec<StatsExercise>,
    /// Workout days per week, oldest first.
    pub weeks: Vec<StatsWeek>,
    /// All effective reps in the period.
    pub effective_total: f64,
    /// Effective reps per muscle, most first.
    pub muscles: Vec<StatsMuscle>,
    /// The period's length in weeks (at least 1), for per-week averages.
    pub muscle_weeks: f64,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct StatsCategory {
    pub category_id: String,
    pub sets: u32,
    /// kg
    pub volume: f64,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct StatsExercise {
    pub exercise_id: String,
    pub sets: u32,
    pub workouts: u32,
    /// Best estimated 1RM (kg) on the first and the last workout day of the period.
    pub first_orm: Option<f64>,
    pub last_orm: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct StatsWeek {
    pub start: String,
    pub workouts: u32,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct StatsMuscle {
    pub muscle: MuscleId,
    pub total: f64,
    /// Main sessions in the period.
    pub sessions: u32,
}

/// The cycle / block review (Review.tsx).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ReviewData {
    pub from: String,
    pub to: String,
    /// Lyle mode with a cycle set: the "this cycle" span exists.
    pub has_cycle: bool,
    pub cycle_start: String,
    pub cycle_weeks: u32,
    /// Strength per exercise, best change first.
    pub changes: Vec<ReviewChange>,
    /// Effective reps per muscle with readiness answers, most first.
    pub muscles: Vec<ReviewMuscle>,
    pub muscle_weeks: f64,
    /// Exercises worth swapping, with alternatives.
    pub swaps: Vec<ReviewSwap>,
    /// Whether the active program's routine exists (swaps can be applied to it).
    pub has_program: bool,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ReviewChange {
    pub exercise_id: String,
    pub first: f64,
    pub last: f64,
    /// last / first − 1; None with one session.
    pub change: Option<f64>,
    /// first/last are e1RM in kg (true) or reps (body weight alone).
    pub is_load: bool,
    pub sessions: u32,
    /// "none" | "up" | "stalled" | "weaker".
    pub trend: String,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ReviewMuscle {
    pub muscle: MuscleId,
    pub total: f64,
    pub sessions: u32,
    pub fresh: u32,
    pub bit_sore: u32,
    pub still_sore: u32,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ReviewSwap {
    pub exercise_id: String,
    /// "joint" | "weaker" | "stalled" (the web's reason strings: jointPain, trendWeaker, trendStalled).
    pub why: String,
    /// The exercise is in the active program's routine: a swap can be applied there.
    pub in_program: bool,
    pub alternatives: Vec<Exercise>,
}

fn trend_name(t: crate::feedback::Trend) -> &'static str {
    use crate::feedback::Trend::*;
    match t {
        None => "none",
        Up => "up",
        Stalled => "stalled",
        Weaker => "weaker",
    }
}

#[uniffi::export]
impl IronCore {
    /// Statistics for a period ending `today` (`from`/`to` only for `Custom`).
    pub fn stats_summary(&self, period: StatsPeriod, today: String, from: String, to: String) -> R<StatsSummary> {
        let (from, to) = if period == StatsPeriod::Custom { (from, to) } else { (period_start(period, &today), today) };
        self.with(|s| {
            let st = s.settings()?;
            let exs: HashMap<String, Exercise> = s.exercises()?.into_iter().map(|e| (e.id.clone(), e)).collect();
            let sets = s.sets_between(if from.is_empty() { "0000-01-01" } else { &from }, &to)?;
            // Body weight by date only when a body-weight exercise is in the period.
            let bw = if sets.iter().any(|x| uses_body_weight(load_of(exs.get(&x.exercise_id)))) { Some(body_weights(s)?) } else { None };
            let sum = summarize(&sets, &|id: &str| exs.get(id).cloned(), &from, &to, st.week_start, st.formula, &|d: &str| bw.as_ref().and_then(|b| b.at(d)));
            let eff = self.effective_of(s, &sets)?;
            let n_of = |x: &WorkoutSet| eff.get(&x.id).map_or(0.0, |e| e.n);
            let muscles_of = |id: &str| exs.get(id).and_then(|e| e.muscles.clone());
            let per = period_muscles(&sets, &muscles_of, &n_of, goal_of(st.mode).as_ref(), &from, &to);
            Ok(StatsSummary {
                from,
                to,
                workouts: sum.totals.workouts as u32,
                sets: sum.totals.sets as u32,
                reps: sum.totals.reps as u32,
                volume: sum.totals.volume,
                time: sum.totals.time,
                distance: sum.totals.distance,
                categories: sum.categories.iter().map(|c| StatsCategory { category_id: c.category_id.clone(), sets: c.sets as u32, volume: c.volume }).collect(),
                exercises: sum
                    .exercises
                    .iter()
                    .map(|e| StatsExercise { exercise_id: e.exercise_id.clone(), sets: e.sets as u32, workouts: e.workouts as u32, first_orm: e.first_orm, last_orm: e.last_orm })
                    .collect(),
                weeks: sum.weeks.iter().map(|w| StatsWeek { start: w.start.clone(), workouts: w.workouts as u32 }).collect(),
                effective_total: per.total,
                muscles: per.list.iter().map(|m| StatsMuscle { muscle: m.muscle, total: m.total, sessions: m.sessions as u32 }).collect(),
                muscle_weeks: per.weeks,
            })
        })
    }

    /// The review of a Lyle cycle or the last n weeks, ending `today`.
    pub fn review_data(&self, span: ReviewSpan, today: String) -> R<ReviewData> {
        self.with(|s| {
            let st = s.settings()?;
            let cycle = if st.mode == TrainingMode::Lyle { st.cycle.clone() } else { None };
            let range = review_range(span, cycle.as_ref().map(|c| (c.start.as_str(), c.weeks)), &today);
            let library = s.exercises()?;
            let exs: HashMap<&str, &Exercise> = library.iter().map(|e| (e.id.as_str(), e)).collect();
            let sets: Vec<WorkoutSet> = s.sets_between(&range.from, &range.to)?.into_iter().filter(|x| !x.is_planned()).collect();
            let bw = if sets.iter().any(|x| uses_body_weight(load_of(exs.get(x.exercise_id.as_str()).copied()))) { Some(body_weights(s)?) } else { None };
            // Per exercise with a reps field, in the order first seen; real load.
            let mut by: Vec<(String, Vec<WorkoutSet>)> = Vec::new();
            for x in &sets {
                if !exs.get(x.exercise_id.as_str()).map_or(false, |e| has_reps(e.kind)) {
                    continue;
                }
                match by.iter_mut().find(|(id, _)| *id == x.exercise_id) {
                    Some((_, l)) => l.push(x.clone()),
                    None => by.push((x.exercise_id.clone(), vec![x.clone()])),
                }
            }
            let by: Vec<(String, Vec<WorkoutSet>)> = by
                .into_iter()
                .map(|(id, l)| {
                    let t = load_of(exs.get(id.as_str()).copied());
                    let real = load::with_real_load(&l, t, |d| bw.as_ref().and_then(|b| b.at(d))).into_iter().map(|x| x.set).collect();
                    (id, real)
                })
                .collect();
            let changes = exercise_changes(&by, &range.from, &range.to, st.formula);
            let muscles_of = |id: &str| exs.get(id).and_then(|e| e.muscles.clone());
            let sore = soreness(&sets, &muscles_of, &range.from, &range.to);
            let eff = self.effective_of(s, &sets)?;
            let per = period_muscles(&sets, &muscles_of, &|x: &WorkoutSet| eff.get(&x.id).map_or(0.0, |e| e.n), goal_of(st.mode).as_ref(), &range.from, &range.to);

            let program = match &st.program {
                Some(p) => s.routines()?.into_iter().find(|r| r.id == p.routine_id),
                None => None,
            };
            let in_program: HashSet<String> = program.iter().flat_map(|r| r.days.iter().flat_map(|d| d.items.iter().map(|i| i.exercise_id.clone()))).collect();
            let swaps = changes
                .iter()
                .filter_map(|c| {
                    let ex = exs.get(c.exercise_id.as_str()).copied()?;
                    if !to_swap(c, Some(ex)) {
                        return None;
                    }
                    let why = if ex.joint == Some(true) {
                        "joint"
                    } else if c.trend == crate::feedback::Trend::Weaker {
                        "weaker"
                    } else {
                        "stalled"
                    };
                    let alts = alternatives(ex, &library, &in_program, 3, &|e: &Exercise| e.name.clone()).into_iter().cloned().collect();
                    Some(ReviewSwap { exercise_id: ex.id.clone(), why: why.into(), in_program: in_program.contains(&ex.id), alternatives: alts })
                })
                .collect();

            Ok(ReviewData {
                from: range.from.clone(),
                to: range.to.clone(),
                has_cycle: cycle.is_some(),
                cycle_start: cycle.as_ref().map(|c| c.start.clone()).unwrap_or_default(),
                cycle_weeks: cycle.as_ref().map_or(0, |c| c.weeks as u32),
                changes: changes
                    .iter()
                    .filter(|c| exs.contains_key(c.exercise_id.as_str()))
                    .map(|c| ReviewChange {
                        exercise_id: c.exercise_id.clone(),
                        first: c.first,
                        last: c.last,
                        change: c.change,
                        is_load: c.kind == ChangeKind::Load,
                        sessions: c.sessions as u32,
                        trend: trend_name(c.trend).into(),
                    })
                    .collect(),
                muscles: per
                    .list
                    .iter()
                    .map(|m| {
                        let [fresh, bit, still] = sore.iter().find(|(x, _)| *x == m.muscle).map_or([0.0; 3], |(_, c)| *c);
                        ReviewMuscle { muscle: m.muscle, total: m.total, sessions: m.sessions as u32, fresh: fresh as u32, bit_sore: bit as u32, still_sore: still as u32 }
                    })
                    .collect(),
                muscle_weeks: per.weeks,
                swaps,
                has_program: program.is_some(),
            })
        })
    }

    /// "Swap in program": `from` replaced by `to` in every day of the active program's routine (planned
    /// weights dropped). False when there is no program or the exercise isn't in it.
    pub fn swap_in_program(&self, from_id: String, to_id: String) -> R<bool> {
        self.with(|s| {
            let Some(p) = s.settings()?.program else { return Ok(false) };
            let Some(r) = s.routines()?.into_iter().find(|r| r.id == p.routine_id) else { return Ok(false) };
            let swapped = swap_in_routine(&r, &from_id, &to_id);
            if swapped == r {
                return Ok(false);
            }
            s.put_routine(&swapped)?;
            Ok(true)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CycleSettings, PlannedSet, ProgramSettings, Routine, RoutineDay, RoutineItem};

    fn set(id: &str, ex: &str, date: &str, w: f64, r: f64) -> WorkoutSet {
        WorkoutSet { id: id.into(), date: date.into(), exercise_id: ex.into(), order: id.bytes().map(|b| b as f64).sum(), weight: Some(w), reps: Some(r), ..Default::default() }
    }

    fn find(core: &IronCore, name: &str) -> Exercise {
        core.library().unwrap().exercises.into_iter().find(|e| e.name == name).unwrap()
    }

    #[test]
    fn stats_summary_totals_exercises_and_muscles() {
        let core = IronCore::in_memory().unwrap();
        let bench = find(&core, "Flat Barbell Bench Press");
        let sq = find(&core, "Barbell Squat");
        core.put_sets(vec![
            set("a", &bench.id, "2026-11-02", 100.0, 5.0),
            set("b", &bench.id, "2026-11-02", 100.0, 5.0),
            set("c", &bench.id, "2026-11-12", 110.0, 5.0),
            set("d", &sq.id, "2026-11-12", 120.0, 5.0),
            set("old", &bench.id, "2026-01-01", 50.0, 5.0),
        ])
        .unwrap();
        let week = core.stats_summary(StatsPeriod::Week, "2026-11-12".into(), String::new(), String::new()).unwrap();
        assert_eq!(week.from, "2026-11-06");
        assert_eq!((week.workouts, week.sets, week.reps), (1, 2, 10));
        assert_eq!(week.volume, 110.0 * 5.0 + 120.0 * 5.0);
        let month = core.stats_summary(StatsPeriod::Month, "2026-11-12".into(), String::new(), String::new()).unwrap();
        assert_eq!((month.workouts, month.sets), (2, 4));
        assert_eq!(month.exercises[0].exercise_id, bench.id);
        assert_eq!(month.exercises[0].sets, 3);
        assert!(month.exercises[0].last_orm.unwrap() > month.exercises[0].first_orm.unwrap());
        assert!(month.effective_total > 0.0 && !month.muscles.is_empty());
        assert!(month.muscles.iter().any(|m| m.muscle == MuscleId::Chest));
        assert_eq!(month.weeks.last().unwrap().workouts, 1);
        let all = core.stats_summary(StatsPeriod::All, "2026-11-12".into(), String::new(), String::new()).unwrap();
        assert_eq!((all.from.as_str(), all.workouts), ("", 3));
        assert_eq!(all.weeks.first().unwrap().start, "2025-12-29");
        let custom = core.stats_summary(StatsPeriod::Custom, "2026-11-12".into(), "2026-01-01".into(), "2026-01-31".into()).unwrap();
        assert_eq!((custom.workouts, custom.sets), (1, 1));
        let none = core.stats_summary(StatsPeriod::Week, "2026-06-12".into(), String::new(), String::new()).unwrap();
        assert_eq!(none.workouts, 0);
    }

    #[test]
    fn review_changes_swaps_and_apply_to_program() {
        let core = IronCore::in_memory().unwrap();
        let bench = find(&core, "Flat Barbell Bench Press");
        let curl = core.library().unwrap().exercises.into_iter().find(|e| e.muscles.as_ref().map_or(false, |m| m.primary.first() == Some(&MuscleId::Biceps)) && e.kind == bench.kind).unwrap();
        // Bench stalls over three weeks, the curl goes up.
        let mut sets = Vec::new();
        for (i, d) in ["2026-11-02", "2026-11-09", "2026-11-16"].iter().enumerate() {
            sets.push(set(&format!("b{i}"), &bench.id, d, 100.0, 5.0));
            sets.push(WorkoutSet { sore: Some(2.0), ..set(&format!("s{i}"), &bench.id, d, 100.0, 5.0) });
            sets.push(set(&format!("c{i}"), &curl.id, d, 20.0 + 2.5 * i as f64, 8.0));
        }
        core.put_sets(sets).unwrap();
        let routine = Routine {
            id: "r".into(),
            name: "R".into(),
            order: 1.0,
            days: vec![RoutineDay { id: "d".into(), name: "A".into(), items: vec![RoutineItem { exercise_id: bench.id.clone(), sets: vec![PlannedSet { weight: Some(100.0), reps: Some(5.0), ..Default::default() }], group: None }] }],
        };
        core.put_routine(routine).unwrap();
        let mut st = core.settings().unwrap();
        st.mode = TrainingMode::Lyle;
        st.cycle = Some(CycleSettings { start: "2026-11-02".into(), weeks: 8.0 });
        st.program = Some(ProgramSettings { routine_id: "r".into(), last_day_id: None, weekdays: None });
        core.put_settings(st).unwrap();

        let r = core.review_data(ReviewSpan::Cycle, "2026-11-20".into()).unwrap();
        assert!(r.has_cycle, "cycle"); assert!(r.has_program, "program");
        assert_eq!((r.from.as_str(), r.to.as_str(), r.cycle_weeks), ("2026-11-02", "2026-11-20", 8));
        assert_eq!(r.changes[0].exercise_id, curl.id); // best change first
        assert!(r.changes[0].change.unwrap() > 0.0 && r.changes[0].is_load);
        let b = r.changes.iter().find(|c| c.exercise_id == bench.id).unwrap();
        assert_eq!((b.trend.as_str(), b.sessions), ("stalled", 3));
        let m = r.muscles.iter().find(|m| m.muscle == MuscleId::Chest).unwrap();
        assert_eq!(m.still_sore, 3);
        assert_eq!(r.swaps.len(), 1);
        assert_eq!((r.swaps[0].exercise_id.as_str(), r.swaps[0].why.as_str(), r.swaps[0].in_program), (bench.id.as_str(), "stalled", true));
        let alt = r.swaps[0].alternatives.first().expect("alternatives for the chest").clone();
        assert!(alt.id != bench.id);
        // Weeks span ignores the cycle; a month back there is nothing.
        let w = core.review_data(ReviewSpan::Weeks { n: 4 }, "2026-11-20".into()).unwrap();
        assert_eq!(w.from, "2026-10-24");
        assert!(core.review_data(ReviewSpan::Weeks { n: 4 }, "2027-03-20".into()).unwrap().changes.is_empty());

        // Apply the swap to the program: the exercise changes, planned weights go.
        assert!(core.swap_in_program(bench.id.clone(), alt.id.clone()).unwrap());
        let r2 = core.routines().unwrap().remove(0);
        assert_eq!(r2.days[0].items[0].exercise_id, alt.id);
        assert_eq!(r2.days[0].items[0].sets[0], PlannedSet { weight: None, reps: Some(5.0), ..Default::default() });
        assert!(!core.swap_in_program(bench.id, alt.id).unwrap()); // no longer in it
    }

    #[test]
    fn review_without_cycle_or_program() {
        let core = IronCore::in_memory().unwrap();
        let r = core.review_data(ReviewSpan::Cycle, "2026-11-20".into()).unwrap();
        assert!(!r.has_cycle && !r.has_program);
        assert_eq!(r.from, "2026-10-10"); // six weeks
        assert!(!core.swap_in_program("x".into(), "y".into()).unwrap());
    }
}
