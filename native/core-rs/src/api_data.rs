//! Delete all data (Settings.tsx `deleteAll`): one transaction back to a fresh install.

use crate::api::{IronCore, R};
use crate::model::{Backup, Settings};
use crate::seed;

#[uniffi::export]
impl IronCore {
    /// Wipes every table and leaves the app as on first launch: the starter library and the default body
    /// measures seeded, default settings. One transaction (an import of the fresh state, which clears all
    /// tables); the record caches are dropped.
    pub fn delete_all(&self) -> R<()> {
        let (categories, exercises) = seed::starter_library(&mut seed::uid);
        let fresh = Backup {
            app: "iron-notes".to_string(),
            version: 1,
            exported: String::new(),
            categories,
            exercises,
            sets: Vec::new(),
            comments: Vec::new(),
            settings: Settings::default(),
            routines: Vec::new(),
            metrics: seed::default_metrics(&mut seed::uid),
            body: Vec::new(),
        };
        self.with(|s| s.import_backup(&fresh, true))?;
        self.forget_all();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wipes_to_a_fresh_install() {
        let core = IronCore::in_memory().unwrap();
        let before = core.library().unwrap();
        let set = crate::model::WorkoutSet { id: crate::api::new_id(), date: "2026-11-12".into(), exercise_id: before.exercises[0].id.clone(), order: 1.0, weight: Some(100.0), reps: Some(8.0), ..Default::default() };
        core.put_set(set).unwrap();
        for e in before.exercises.clone() {
            core.delete_exercise(e.id).unwrap();
        }
        core.delete_all().unwrap();
        let lib = core.library().unwrap();
        assert_eq!(lib.exercises.len(), before.exercises.len());
        assert_eq!(lib.categories.len(), before.categories.len());
        assert_eq!(core.settings().unwrap(), Settings::default());
        assert!(!core.metrics().unwrap().is_empty());
        assert!(core.day("2026-11-12".into()).unwrap().sets.is_empty());
    }
}
