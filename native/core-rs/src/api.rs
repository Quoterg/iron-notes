//! What the apps call (UniFFI): one `IronCore` object per open database. Coarse calls — a screen
//! makes one or two, not one per set. Kotlin/Swift get the model types as plain records.

use std::sync::Mutex;

use crate::model::{BodyMetric, BodyMetricEntry, Category, Exercise, Routine, Settings, WorkoutSet};
use crate::seed;
use crate::store::{Store, StoreError};

#[derive(Debug, uniffi::Error)]
pub enum CoreError {
    /// The database failed (disk full, corrupt file…).
    Storage { msg: String },
    /// A backup file that isn't a valid Iron Notes backup: nothing was changed.
    InvalidBackup { msg: String },
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CoreError::Storage { msg } => write!(f, "storage: {msg}"),
            CoreError::InvalidBackup { msg } => write!(f, "invalid backup: {msg}"),
        }
    }
}

impl std::error::Error for CoreError {}

impl From<StoreError> for CoreError {
    fn from(e: StoreError) -> Self {
        match e {
            StoreError::Invalid(msg) => CoreError::InvalidBackup { msg },
            other => CoreError::Storage { msg: other.to_string() },
        }
    }
}

type R<T> = Result<T, CoreError>;

/// The library and the day's sets in one call (the day log's first paint).
#[derive(Debug, Clone, uniffi::Record)]
pub struct DayData {
    pub date: String,
    pub sets: Vec<WorkoutSet>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ExerciseLibrary {
    pub categories: Vec<Category>,
    pub exercises: Vec<Exercise>,
}

#[derive(uniffi::Object)]
pub struct IronCore {
    store: Mutex<Store>,
}

impl IronCore {
    fn with<T>(&self, f: impl FnOnce(&Store) -> Result<T, StoreError>) -> R<T> {
        let s = self.store.lock().unwrap_or_else(|p| p.into_inner());
        Ok(f(&s)?)
    }
}

#[uniffi::export]
impl IronCore {
    /// Opens (or creates) the database at `path`; on a fresh install writes the starter library and
    /// body measures once, as the web app does (never again, even if the user deletes them all).
    #[uniffi::constructor]
    pub fn open(path: String) -> R<std::sync::Arc<Self>> {
        let store = Store::open(&path)?;
        seed_if_new(&store)?;
        Ok(std::sync::Arc::new(Self { store: Mutex::new(store) }))
    }

    /// An in-memory database (tests, previews).
    #[uniffi::constructor]
    pub fn in_memory() -> R<std::sync::Arc<Self>> {
        let store = Store::open_in_memory()?;
        seed_if_new(&store)?;
        Ok(std::sync::Arc::new(Self { store: Mutex::new(store) }))
    }

    // ---- Settings ----
    pub fn settings(&self) -> R<Settings> {
        self.with(|s| s.settings())
    }
    pub fn put_settings(&self, settings: Settings) -> R<()> {
        self.with(|s| s.put_settings(&settings))
    }

    // ---- Library ----
    pub fn library(&self) -> R<ExerciseLibrary> {
        self.with(|s| Ok(ExerciseLibrary { categories: s.categories()?, exercises: s.exercises()? }))
    }
    pub fn put_category(&self, c: Category) -> R<()> {
        self.with(|s| s.put_category(&c))
    }
    pub fn delete_category(&self, id: String) -> R<()> {
        self.with(|s| s.delete_category(&id))
    }
    pub fn put_exercise(&self, e: Exercise) -> R<()> {
        self.with(|s| s.put_exercise(&e))
    }
    /// Deletes the exercise and every set logged for it.
    pub fn delete_exercise(&self, id: String) -> R<()> {
        self.with(|s| s.delete_exercise(&id))
    }

    // ---- Sets ----
    pub fn day(&self, date: String) -> R<DayData> {
        self.with(|s| Ok(DayData { sets: s.sets_on(&date)?, comment: s.comment(&date)?, date }))
    }
    /// Every set of an exercise, by date and order (history, records, targets).
    pub fn sets_of(&self, exercise_id: String) -> R<Vec<WorkoutSet>> {
        self.with(|s| s.sets_of(&exercise_id))
    }
    pub fn sets_between(&self, from: String, to: String) -> R<Vec<WorkoutSet>> {
        self.with(|s| s.sets_between(&from, &to))
    }
    pub fn put_set(&self, set: WorkoutSet) -> R<()> {
        self.with(|s| s.put_set(&set))
    }
    pub fn put_sets(&self, sets: Vec<WorkoutSet>) -> R<()> {
        self.with(|s| s.put_sets(&sets))
    }
    pub fn delete_set(&self, id: String) -> R<()> {
        self.with(|s| s.delete_set(&id))
    }
    pub fn delete_sets(&self, ids: Vec<String>) -> R<()> {
        self.with(|s| s.delete_sets(&ids))
    }
    /// Dates with logged sets in [from, to] (the calendar).
    pub fn dates_with_sets(&self, from: String, to: String) -> R<Vec<String>> {
        self.with(|s| s.dates_with_sets(&from, &to))
    }
    pub fn put_comment(&self, date: String, text: String) -> R<()> {
        self.with(|s| s.put_comment(&date, &text))
    }

    // ---- Routines & body ----
    pub fn routines(&self) -> R<Vec<Routine>> {
        self.with(|s| s.routines())
    }
    pub fn put_routine(&self, r: Routine) -> R<()> {
        self.with(|s| s.put_routine(&r))
    }
    pub fn delete_routine(&self, id: String) -> R<()> {
        self.with(|s| s.delete_routine(&id))
    }
    pub fn metrics(&self) -> R<Vec<BodyMetric>> {
        self.with(|s| s.metrics())
    }
    pub fn put_metrics(&self, list: Vec<BodyMetric>) -> R<()> {
        self.with(|s| s.put_metrics(&list))
    }
    pub fn delete_metric(&self, id: String) -> R<()> {
        self.with(|s| s.delete_metric(&id))
    }
    pub fn body_of(&self, metric_id: String) -> R<Vec<BodyMetricEntry>> {
        self.with(|s| s.body_of(&metric_id))
    }
    pub fn put_entry(&self, e: BodyMetricEntry) -> R<()> {
        self.with(|s| s.put_entry(&e))
    }
    pub fn delete_entry(&self, id: String) -> R<()> {
        self.with(|s| s.delete_entry(&id))
    }

    // ---- Backup (the web app's file format, both ways) ----
    /// The whole database as a backup file (JSON). `exported`: an ISO time stamp for the file.
    pub fn export_backup_json(&self, exported: String) -> R<String> {
        self.with(|s| s.export_backup_json(&exported))
    }
    /// Replaces everything with a backup file. A file that isn't valid changes nothing.
    pub fn import_backup_json(&self, json: String) -> R<()> {
        self.with(|s| s.import_backup_json(&json))
    }
}

/// A new id (like the web app's `uid()`).
#[uniffi::export]
pub fn new_id() -> String {
    seed::uid()
}

fn seed_if_new(store: &Store) -> Result<(), StoreError> {
    if !store.is_seeded()? {
        if store.categories()?.is_empty() {
            let (cats, exs) = seed::starter_library(&mut seed::uid);
            for c in &cats {
                store.put_category(c)?;
            }
            for e in &exs {
                store.put_exercise(e)?;
            }
        }
        store.set_seeded()?;
    }
    if !store.is_body_seeded()? {
        if store.metrics()?.is_empty() {
            store.put_metrics(&seed::default_metrics(&mut seed::uid))?;
        }
        store.set_body_seeded()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeds_once_and_logs_a_set() {
        let core = IronCore::in_memory().unwrap();
        let lib = core.library().unwrap();
        assert_eq!(lib.categories.len(), 8);
        assert!(lib.exercises.len() > 50);
        assert!(!core.metrics().unwrap().is_empty());
        let bench = lib.exercises.iter().find(|e| e.name == "Flat Barbell Bench Press").unwrap();
        let set = WorkoutSet { id: new_id(), date: "2026-11-12".into(), exercise_id: bench.id.clone(), order: 1.0, weight: Some(100.0), reps: Some(8.0), ..Default::default() };
        core.put_set(set.clone()).unwrap();
        assert_eq!(core.day("2026-11-12".into()).unwrap().sets, vec![set]);
        // Deleting the whole library doesn't bring the starters back (seeded once).
        for e in lib.exercises {
            core.delete_exercise(e.id).unwrap();
        }
        core.with(|s| seed_if_new(s)).unwrap();
        assert!(core.library().unwrap().exercises.is_empty());
    }

    #[test]
    fn invalid_backup_is_an_error_and_changes_nothing() {
        let core = IronCore::in_memory().unwrap();
        let before = core.export_backup_json("x".into()).unwrap();
        match core.import_backup_json(r#"{"app":"iron-notes","version":2}"#.into()) {
            Err(CoreError::InvalidBackup { msg }) => assert!(msg.contains("Unsupported backup version 2"), "{msg}"),
            other => panic!("{other:?}"),
        }
        assert_eq!(core.export_backup_json("x".into()).unwrap(), before);
    }
}
