//! IronCore method for the exercise picker's Recent section (Picker.tsx, db.ts `recentExerciseIds`).

use crate::api::{IronCore, R};

#[uniffi::export]
impl IronCore {
    /// The `n` exercises most recently done (distinct, newest first); planned sets don't count.
    pub fn recent_exercise_ids(&self, n: u32) -> R<Vec<String>> {
        self.with(|s| s.recent_exercise_ids(n as usize))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::WorkoutSet;

    fn set(id: &str, date: &str, ex: &str, planned: bool) -> WorkoutSet {
        WorkoutSet {
            id: id.into(), date: date.into(), exercise_id: ex.into(), order: 1.0, weight: Some(60.0), reps: Some(8.0),
            planned: planned.then_some(true), ..Default::default()
        }
    }

    #[test]
    fn recent_is_distinct_newest_first_and_skips_planned() {
        let core = IronCore::in_memory().unwrap();
        assert!(core.recent_exercise_ids(8).unwrap().is_empty());
        core.with(|s| {
            s.put_sets(&[
                set("a", "2026-11-01", "squat", false),
                set("b", "2026-11-03", "bench", false),
                set("c", "2026-11-05", "plan", true),
                set("d", "2026-11-04", "squat", false),
                set("e", "2026-11-02", "row", false),
            ])
        })
        .unwrap();
        assert_eq!(core.recent_exercise_ids(8).unwrap(), ["squat", "bench", "row"]);
        assert_eq!(core.recent_exercise_ids(2).unwrap(), ["squat", "bench"]);
    }
}
