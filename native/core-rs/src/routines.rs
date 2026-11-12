//! Routines: named plans with days of exercises and planned sets — as src/lib/routines.ts (pure helpers;
//! storage in store.rs). `planSummary` is display text and stays with the apps.
//! Ids come from a passed generator (the TypeScript calls `uid()`), orders from `next_order`.

use crate::groups::day_order;
use crate::load::{load_of, uses_body_weight};
use crate::model::{Exercise, Field, PlannedSet, RoutineDay, RoutineItem, WorkoutSet};
use std::collections::HashMap;

/// `defaultPlan`: default plan for a newly added exercise: 3 sets of 8–10 reps, or 1 set for cardio/time work.
pub fn default_plan(ex: &Exercise) -> Vec<PlannedSet> {
    let f = ex.kind.fields();
    // Weighted sets 3 × 8; body-weight work (with or without added load) 3 × 10.
    let weighted = f.contains(&Field::Weight) && !uses_body_weight(load_of(Some(ex)));
    if f.contains(&Field::Reps) {
        return (0..3).map(|_| PlannedSet { reps: Some(if weighted { 8.0 } else { 10.0 }), ..Default::default() }).collect();
    }
    vec![PlannedSet::default()]
}

/// `plannedSets`: the sets a routine day logs on `date`: planned (not done), in plan order. Missing values
/// come from the exercise's last workout, set by set (set 1 from last time's set 1, …; extra sets from its
/// last set), so a reverse pyramid keeps its shape; still-missing values stay empty.
///
/// `warmups` (Dorian HIT): last time's warm-ups come back as warm-ups — but only when the plan has room for
/// all of last time's sets; otherwise, and in the other modes, sets are matched to last time's working sets.
pub fn planned_sets(
    day: &RoutineDay,
    date: &str,
    last_sets: &mut dyn FnMut(&str) -> Vec<WorkoutSet>,
    next_order: &mut dyn FnMut() -> f64,
    new_id: &mut dyn FnMut() -> String,
    warmups: bool,
) -> Vec<WorkoutSet> {
    let mut out = Vec::new();
    // A workout's supersets become new groups on the day (logging it twice makes two separate supersets).
    let mut groups: HashMap<String, String> = HashMap::new();
    for item in &day.items {
        let all = last_sets(&item.exercise_id);
        let working: Vec<WorkoutSet> = all.iter().filter(|s| !s.is_warmup()).cloned().collect();
        let with_warmups = warmups && item.sets.len() >= all.len();
        let prev = if with_warmups || working.is_empty() { all } else { working };
        let group = match item.group.as_deref().filter(|g| !g.is_empty()) {
            Some(key) => Some(groups.entry(key.to_string()).or_insert_with(|| new_id()).clone()),
            None => None,
        };
        for (i, p) in item.sets.iter().enumerate() {
            let last = prev.get(i).or(prev.last());
            let id = new_id();
            out.push(WorkoutSet {
                id,
                date: date.to_string(),
                exercise_id: item.exercise_id.clone(),
                order: next_order(),
                weight: p.weight.or(last.and_then(|l| l.weight)),
                reps: p.reps.or(last.and_then(|l| l.reps)),
                distance: p.distance.or(last.and_then(|l| l.distance)),
                time: p.time.or(last.and_then(|l| l.time)),
                done: Some(false),
                planned: Some(true),
                // A warm-up stays a warm-up (Dorian HIT), so filling it in doesn't count it as a working set.
                warmup: if with_warmups && last.is_some_and(|l| l.is_warmup()) && i < prev.len() { Some(true) } else { None },
                group: group.clone(),
                ..Default::default()
            });
        }
    }
    out
}

/// `isDone`: sets that count (records, graphs, history): a routine's planned, not yet done ones don't.
pub fn is_done(s: &WorkoutSet) -> bool {
    !s.is_planned()
}

/// `workoutFromDay`: a saved workout from a logged day: its exercises in order with sets × reps (distance
/// and time for those types) and its supersets — no weights: those come from the last time when it's logged.
pub fn workout_from_day(name: &str, day_sets: &[WorkoutSet], exercise: &dyn Fn(&str) -> Option<Exercise>, new_id: &mut dyn FnMut() -> String) -> RoutineDay {
    let mut items = Vec::new();
    for o in day_order(day_sets) {
        let Some(ex) = exercise(&o.exercise_id) else { continue };
        let f: Vec<Field> = ex.kind.fields().iter().copied().filter(|k| *k != Field::Weight).collect();
        let mut sets: Vec<PlannedSet> = day_sets
            .iter()
            .filter(|s| s.exercise_id == o.exercise_id)
            .map(|s| {
                let get = |k: Field| if f.contains(&k) { s.field(k) } else { None };
                PlannedSet { weight: None, reps: get(Field::Reps), distance: get(Field::Distance), time: get(Field::Time) }
            })
            .collect();
        if sets.is_empty() {
            sets.push(PlannedSet::default());
        }
        items.push(RoutineItem { exercise_id: o.exercise_id, sets, group: o.group });
    }
    RoutineDay { id: new_id(), name: name.to_string(), items }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ExerciseType;

    #[test]
    fn default_plans() {
        let ex = |kind, load| Exercise { kind, load, ..Default::default() };
        assert_eq!(default_plan(&ex(ExerciseType::WeightReps, None)).iter().map(|p| p.reps).collect::<Vec<_>>(), [Some(8.0); 3]);
        assert_eq!(default_plan(&ex(ExerciseType::WeightReps, Some(crate::model::LoadType::Bodyweight))).len(), 3);
        assert_eq!(default_plan(&ex(ExerciseType::DistanceTime, None)), vec![PlannedSet::default()]);
    }
}
