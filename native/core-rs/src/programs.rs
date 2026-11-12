//! Ready-made programs (docs/TRAINING-MODES.md) — as src/lib/programs.ts: Dorian Yates' 4-day split (one
//! all-out set per exercise) and Lyle McDonald's Generic Bulking Routine (upper/lower, 6–8 main, 10–12
//! secondary, 12–15 arms). Built from the user's exercise library by name; anything missing is left out
//! and reported. Ids come from a passed generator (the TypeScript calls `uid()`).

use crate::calc::day_number;
use crate::model::{Exercise, Routine, RoutineDay, RoutineItem, TrainingMode};
use crate::model::PlannedSet;
use std::collections::HashMap;

/// (exercise name, sets, rep range — Lyle sets it on exercises that have none)
pub type Item = (&'static str, u32, Option<(f64, f64)>);

pub struct Template {
    /// "dorian4" | "lyleGbr".
    pub id: &'static str,
    pub mode: TrainingMode,
    /// Training weekdays (0 Sunday … 6 Saturday).
    pub weekdays: &'static [u8],
    pub days: &'static [(&'static str, &'static [Item])],
}

const MAIN: Option<(f64, f64)> = Some((6.0, 8.0));
const SECONDARY: Option<(f64, f64)> = Some((10.0, 12.0));
const ARMS: Option<(f64, f64)> = Some((12.0, 15.0));

pub const TEMPLATES: [Template; 2] = [
    Template {
        id: "dorian4",
        mode: TrainingMode::Dorian,
        weekdays: &[1, 2, 4, 5],
        days: &[
            ("Chest & biceps", &[("Incline Barbell Bench Press", 1, None), ("Flat Dumbbell Bench Press", 1, None), ("Dumbbell Fly", 1, None), ("Dumbbell Curl", 1, None), ("Barbell Curl", 1, None)]),
            ("Legs", &[("Leg Extension", 1, None), ("Leg Press", 1, None), ("Barbell Squat", 1, None), ("Lying Leg Curl", 1, None), ("Romanian Deadlift", 1, None), ("Standing Calf Raise", 1, None)]),
            ("Delts, traps & triceps", &[("Seated Dumbbell Press", 1, None), ("Lateral Dumbbell Raise", 1, None), ("Barbell Shrug", 1, None), ("Cable Pushdown", 1, None), ("Overhead Triceps Extension", 1, None)]),
            ("Back & rear delts", &[("Lat Pulldown", 1, None), ("Barbell Row", 1, None), ("One Arm Dumbbell Row", 1, None), ("Rear Delt Fly", 1, None), ("Deadlift", 1, None), ("Back Extension", 1, None)]),
        ],
    },
    Template {
        id: "lyleGbr",
        mode: TrainingMode::Lyle,
        weekdays: &[1, 2, 4, 5],
        days: &[
            ("Lower", &[("Barbell Squat", 3, MAIN), ("Romanian Deadlift", 3, MAIN), ("Leg Press", 2, SECONDARY), ("Lying Leg Curl", 2, SECONDARY), ("Standing Calf Raise", 3, MAIN)]),
            ("Upper", &[("Flat Barbell Bench Press", 3, MAIN), ("Barbell Row", 3, MAIN), ("Incline Dumbbell Bench Press", 2, SECONDARY), ("Lat Pulldown", 2, SECONDARY), ("Cable Pushdown", 2, ARMS), ("Barbell Curl", 2, ARMS)]),
        ],
    },
];

/// The template with this id.
pub fn template(id: &str) -> Option<&'static Template> {
    TEMPLATES.iter().find(|t| t.id == id)
}

pub struct Built {
    pub routine: Routine,
    /// Exercises that get the template's rep range (only those without one), already updated.
    pub ranges: Vec<Exercise>,
    /// Exercise names not found in the library.
    pub missing: Vec<String>,
}

/// `buildProgram`: the template as a routine from `library` (matched by name, any case), the exercises that
/// get its rep range (only those without one), and the names not found. `new_id` is called for each day,
/// then for the routine.
pub fn build_program(tpl: &Template, name: &str, library: &[Exercise], order: f64, new_id: &mut dyn FnMut() -> String) -> Built {
    let by_name: HashMap<String, &Exercise> = library.iter().map(|e| (e.name.to_lowercase(), e)).collect();
    let mut missing: Vec<String> = Vec::new();
    let mut ranges: Vec<Exercise> = Vec::new();
    let mut days = Vec::new();
    for (day_name, items) in tpl.days {
        let mut out = Vec::new();
        for (ex_name, sets, range) in items.iter() {
            let Some(ex) = by_name.get(&ex_name.to_lowercase()) else {
                if !missing.iter().any(|m| m == ex_name) {
                    missing.push(ex_name.to_string());
                }
                continue;
            };
            if let Some((bottom, top)) = range {
                if ex.rep_top.is_none() && ex.rep_bottom.is_none() && !ranges.iter().any(|r| r.id == ex.id) {
                    ranges.push(Exercise { rep_bottom: Some(*bottom), rep_top: Some(*top), ..(*ex).clone() });
                }
            }
            out.push(RoutineItem { exercise_id: ex.id.clone(), sets: (0..*sets).map(|_| PlannedSet::default()).collect(), group: None });
        }
        days.push(RoutineDay { id: new_id(), name: day_name.to_string(), items: out });
    }
    Built { routine: Routine { id: new_id(), name: name.to_string(), order, days }, ranges, missing }
}

/// `isTrainingDay`: whether `date` (YYYY-MM-DD) is a training day of the schedule (no schedule: every day).
pub fn is_training_day(weekdays: Option<&[u8]>, date: &str) -> bool {
    let Some(wd) = weekdays.filter(|w| !w.is_empty()) else { return true };
    match day_number(date) {
        // 1970-01-01 was a Thursday (4).
        Some(d) => wd.contains(&((d + 4).rem_euclid(7) as u8)),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedule() {
        assert!(is_training_day(Some(&[1, 2, 4, 5]), "2026-11-12")); // a Thursday
        assert!(!is_training_day(Some(&[1, 2, 4, 5]), "2026-11-14"));
        assert!(is_training_day(None, "2026-11-14"));
        assert_eq!(template("lyleGbr").unwrap().days.len(), 2);
    }
}
