//! What the apps call (UniFFI): one `IronCore` object per open database. Coarse calls — a screen
//! makes one or two, not one per set. Kotlin/Swift get the model types as plain records.

use std::sync::Mutex;

use crate::model::{BodyMetric, BodyMetricEntry, Category, Exercise, Routine, Settings, WorkoutSet};
use crate::{load, progress, records, seed};
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

/// A day's log in one call (the day log's first paint).
#[derive(Debug, Clone, uniffi::Record)]
pub struct DayData {
    pub date: String,
    pub sets: Vec<WorkoutSet>,
    pub comment: Option<String>,
    /// Ids of the day's sets that are personal records (rep-max rule, real load — as the web's trophies).
    pub records: Vec<String>,
    /// Log.tsx summary: sets of exercises that still exist, and their volume (kg; both dumbbells, no body weight).
    pub set_count: u32,
    pub volume: f64,
}

/// What the logging screen of one exercise on one day needs.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ExerciseLog {
    pub exercise_id: String,
    pub date: String,
    /// The exercise's sets on that day, in order.
    pub sets: Vec<WorkoutSet>,
    /// The last earlier day's sets ("last time"; planned sets left out).
    pub previous: Vec<WorkoutSet>,
    /// Ids of the exercise's record sets over its whole history.
    pub records: Vec<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ExerciseLibrary {
    pub categories: Vec<Category>,
    pub exercises: Vec<Exercise>,
}

/// What the exercise screen's History and Records tabs show (ExerciseProgress.tsx), in one call.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ExerciseProgress {
    /// Logged days with their sets, newest first (planned sets left out).
    pub workouts: Vec<progress::Workout>,
    /// Ids of record sets (trophies).
    pub records: Vec<String>,
    /// Rep maxes 1–15 that have a set, by the real load (weight and reps exercises).
    pub rep_maxes: Vec<progress::RepMax>,
    /// The best estimated 1RM (weight and reps exercises).
    pub best_orm: Option<progress::BestOrm>,
    /// Best per field (+ fastest pace), by the real load.
    pub bests: Vec<progress::Best>,
    /// The graph's metrics for this exercise type.
    pub metrics: Vec<progress::Metric>,
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
        self.with(|s| {
            let sets = s.sets_on(&date)?;
            let mut records = Vec::new();
            let mut seen: Vec<&str> = Vec::new();
            let exercises = s.exercises()?;
            for set in &sets {
                if seen.contains(&set.exercise_id.as_str()) {
                    continue;
                }
                seen.push(&set.exercise_id);
                if let Some(ex) = exercises.iter().find(|e| e.id == set.exercise_id) {
                    let ids = records_of(s, ex)?;
                    records.extend(sets.iter().filter(|x| x.exercise_id == ex.id && ids.contains(&x.id)).map(|x| x.id.clone()));
                }
            }
            let known: Vec<WorkoutSet> = sets.iter().filter(|x| exercises.iter().any(|e| e.id == x.exercise_id)).cloned().collect();
            let totals = records::day_totals(&known, |x| {
                load::volume_weight(x.weight, load::load_of(exercises.iter().find(|e| e.id == x.exercise_id)))
            });
            Ok(DayData { comment: s.comment(&date)?, sets, records, set_count: totals.sets as u32, volume: totals.volume, date })
        })
    }
    /// One exercise's logging screen for a day: its sets, last time, records.
    pub fn exercise_log(&self, exercise_id: String, date: String) -> R<ExerciseLog> {
        self.with(|s| {
            let all = s.sets_of(&exercise_id)?;
            let records = match s.exercises()?.into_iter().find(|e| e.id == exercise_id) {
                Some(ex) => records_of(s, &ex)?,
                None => Vec::new(),
            };
            let done: Vec<WorkoutSet> = all.iter().filter(|x| !x.is_planned()).cloned().collect();
            Ok(ExerciseLog {
                sets: all.iter().filter(|x| x.date == date).cloned().collect(),
                previous: records::previous_workout(&done, &date),
                records,
                exercise_id,
                date,
            })
        })
    }
    /// Every set of an exercise, by date and order (history, records, targets).
    pub fn sets_of(&self, exercise_id: String) -> R<Vec<WorkoutSet>> {
        self.with(|s| s.sets_of(&exercise_id))
    }
    /// History and Records tabs of an exercise.
    pub fn exercise_progress(&self, exercise_id: String) -> R<ExerciseProgress> {
        self.with(|s| {
            let Some(ex) = s.exercises()?.into_iter().find(|e| e.id == exercise_id) else {
                return Ok(ExerciseProgress { workouts: vec![], records: vec![], rep_maxes: vec![], best_orm: None, bests: vec![], metrics: vec![] });
            };
            let counted: Vec<WorkoutSet> = s.sets_of(&ex.id)?.into_iter().filter(|x| !x.is_planned()).collect();
            let real: Vec<WorkoutSet> = real_load(s, &ex, &counted)?.into_iter().map(|l| l.set).collect();
            let strength = ex.kind == crate::model::ExerciseType::WeightReps;
            let settings = s.settings()?;
            Ok(ExerciseProgress {
                workouts: progress::workouts(&counted),
                records: records_of(s, &ex)?,
                rep_maxes: if strength { progress::rep_max_table(&real, 15).into_iter().filter(|r| r.set.is_some()).collect() } else { vec![] },
                best_orm: if strength { progress::best_orm(&real, settings.formula) } else { None },
                bests: progress::bests(&real, ex.kind),
                metrics: progress::metrics_for(ex.kind),
            })
        })
    }
    /// The graph: one point per workout day of `metric` over `range` (ending `today`), by the real load.
    /// Values in stored units (kg, km, s; pace s/km) — the app converts for display.
    pub fn exercise_series(&self, exercise_id: String, metric: progress::Metric, range: progress::Range, today: String) -> R<Vec<progress::Point>> {
        self.with(|s| {
            let Some(ex) = s.exercises()?.into_iter().find(|e| e.id == exercise_id) else { return Ok(vec![]) };
            let counted: Vec<WorkoutSet> = s.sets_of(&ex.id)?.into_iter().filter(|x| !x.is_planned()).collect();
            let real = real_load(s, &ex, &counted)?;
            Ok(progress::daily_series(&real, metric, s.settings()?.formula, &progress::range_start(range, &today)))
        })
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

static LAST_ORDER: Mutex<f64> = Mutex::new(0.0);

/// A unique, increasing order key for a new set (state.ts `nextOrder`: ms time, made unique).
#[uniffi::export]
pub fn next_order() -> f64 {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0);
    let mut last = LAST_ORDER.lock().unwrap_or_else(|p| p.into_inner());
    *last = (*last + 1.0).max(now);
    *last
}

/// An exercise's record set ids over its whole history, by the real load (state.ts `refreshRecords` with
/// `loadedSetsOf`: body-weight exercises count the body weight of the day — the first weight measure).
fn records_of(s: &Store, ex: &Exercise) -> Result<Vec<String>, StoreError> {
    let sets = s.sets_of(&ex.id)?;
    if load::load_of(Some(ex)) == crate::model::LoadType::Total {
        return Ok(records::record_ids(&sets, ex.kind, true));
    }
    Ok(records::record_ids_loaded(&real_load(s, ex, &sets)?, ex.kind, true))
}

/// state.ts `loadedSetsOf`: sets as calculations see them — the real load (body weight ± for body-weight
/// exercises, by the first weight measure's value on the day) and the volume weight.
fn real_load(s: &Store, ex: &Exercise, sets: &[WorkoutSet]) -> Result<Vec<load::LoadedSet>, StoreError> {
    let t = load::load_of(Some(ex));
    if t == crate::model::LoadType::Total {
        return Ok(load::with_real_load(sets, t, |_| None));
    }
    let mut weights: Vec<BodyMetric> = s.metrics()?.into_iter().filter(|m| m.kind == crate::model::BodyKind::Weight).collect();
    weights.sort_by(|a, b| a.order.partial_cmp(&b.order).unwrap_or(std::cmp::Ordering::Equal));
    let entries = match weights.first() {
        Some(m) => s.body_of(&m.id)?,
        None => Vec::new(),
    };
    let bw = load::body_weight_at(&entries);
    Ok(load::with_real_load(sets, t, |d| bw.at(d)))
}

fn seed_if_new(store: &Store) -> Result<(), StoreError> {
    // Seed only a fresh library (never over the user's own, even if they deleted every starter); all of
    // it in one transaction (store.rs `seed`).
    let lib = if !store.is_seeded()? {
        if store.categories()?.is_empty() { Some(seed::starter_library(&mut seed::uid)) } else { Some((Vec::new(), Vec::new())) }
    } else {
        None
    };
    let metrics = if !store.is_body_seeded()? {
        if store.metrics()?.is_empty() { Some(seed::default_metrics(&mut seed::uid)) } else { Some(Vec::new()) }
    } else {
        None
    };
    if lib.is_none() && metrics.is_none() {
        return Ok(());
    }
    store.seed(lib.as_ref().map(|(c, e)| (c.as_slice(), e.as_slice())), metrics.as_deref())
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
    fn day_records_and_exercise_log() {
        let core = IronCore::in_memory().unwrap();
        let lib = core.library().unwrap();
        let bench = lib.exercises.iter().find(|e| e.name == "Flat Barbell Bench Press").unwrap().id.clone();
        let pull = lib.exercises.iter().find(|e| e.name == "Pull Up").unwrap();
        assert_eq!(pull.load, Some(crate::model::LoadType::Bodyweight));
        let set = |id: &str, ex: &str, date: &str, w: f64, r: f64| WorkoutSet {
            id: id.into(), date: date.into(), exercise_id: ex.into(), order: next_order(), weight: Some(w), reps: Some(r), ..Default::default()
        };
        core.put_sets(vec![
            set("a", &bench, "2026-11-10", 100.0, 5.0),
            set("b", &bench, "2026-11-12", 90.0, 5.0),  // lighter for the same reps: no record
            set("c", &bench, "2026-11-12", 80.0, 12.0), // a new rep count: record
            set("p1", &pull.id, "2026-11-10", 0.0, 10.0),
            set("p2", &pull.id, "2026-11-12", 0.0, 10.0), // same reps, but heavier body weight that day
        ]).unwrap();
        let w = core.metrics().unwrap().into_iter().find(|m| m.kind == crate::model::BodyKind::Weight).unwrap();
        core.put_entry(BodyMetricEntry { id: "w1".into(), metric_id: w.id.clone(), date: "2026-11-10".into(), value: 80.0, at: 1.0 }).unwrap();
        core.put_entry(BodyMetricEntry { id: "w2".into(), metric_id: w.id, date: "2026-11-12".into(), value: 81.0, at: 2.0 }).unwrap();
        let day = core.day("2026-11-12".into()).unwrap();
        assert_eq!(day.records, vec!["c".to_string(), "p2".to_string()]);
        assert_eq!((day.set_count, day.volume), (3, 90.0 * 5.0 + 80.0 * 12.0)); // the pull up adds no volume
        let log = core.exercise_log(bench.clone(), "2026-11-12".into()).unwrap();
        assert_eq!(log.sets.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["b", "c"]);
        assert_eq!(log.previous.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["a"]);
        assert!(log.records.contains(&"a".to_string()) && !log.records.contains(&"b".to_string()));
        let (a, b) = (next_order(), next_order());
        assert!(b > a);
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
