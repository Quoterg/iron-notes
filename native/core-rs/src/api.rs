//! What the apps call (UniFFI): one `IronCore` object per open database. Coarse calls — a screen
//! makes one or two, not one per set. Kotlin/Swift get the model types as plain records.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use crate::model::{BodyMetric, BodyMetricEntry, Category, CycleSettings, DayComment, Exercise, LightSettings, ProgramSettings, Routine, Settings, TrainingMode, WorkoutSet};
use crate::{calc, calendar, cycle, feedback, groups, load, lyle, programs, progress, records, routines, seed, targets, tools, units};
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

/// One month of the calendar (Calendar.tsx): the grid and which categories were trained each day.
#[derive(Debug, Clone, uniffi::Record)]
pub struct CalendarMonth {
    /// "YYYY-MM".
    pub month: String,
    /// The grid's days, weeks starting on `week_start` (calendar.ts `monthGrid`: "" for blanks).
    pub grid: Vec<String>,
    /// Days with done sets: their categories' ids in first-logged order.
    pub days: Vec<CalendarDay>,
    /// Workouts (days with done sets) in the month.
    pub workouts: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct CalendarDay {
    pub date: String,
    pub category_ids: Vec<String>,
}

/// A ready-made program (programs.ts `TEMPLATES`).
#[derive(Debug, Clone, uniffi::Record)]
pub struct ProgramTemplate {
    /// "dorian4" | "lyleGbr".
    pub id: String,
    pub mode: crate::model::TrainingMode,
    pub weekdays: Vec<u8>,
    /// Day names (keys into the web's strings or plain names, as programs.ts).
    pub day_names: Vec<String>,
}

/// What building a program made (programs.ts `buildProgram`): the routine, and exercise names that
/// weren't in the library (left out).
#[derive(Debug, Clone, uniffi::Record)]
pub struct BuiltProgram {
    pub routine: Routine,
    pub missing: Vec<String>,
}

/// A progression target for the next set (ExerciseScreen.tsx `target` / `lyleT`), already adjusted (long
/// gap, joint pain, lighter week) and rounded to the plates as the web does.
#[derive(Debug, Clone, uniffi::Record)]
pub struct GuideTarget {
    /// kg.
    pub weight: f64,
    /// Reps to reach; None right after a weight increase (Dorian) or when the rule gives none.
    pub reps: Option<f64>,
    /// Why (the web's `why`): Dorian "up" | "reps" | "same" | "light" | "gap" | "joint" …; Lyle "runUp" |
    /// "up" | "reps" | "gap" | "joint" … — the app shows the matching hint string.
    pub why: String,
    /// The set it's based on (last time's), if any.
    pub prev: Option<WorkoutSet>,
    /// Lyle: the cycle week (0 outside a cycle).
    pub week: f64,
}

/// A muscle trained in a main session too recently (Dorian HIT, targets.ts `tooSoon`).
#[derive(Debug, Clone, uniffi::Record)]
pub struct TooSoonMuscle {
    pub muscle: crate::model::MuscleId,
    pub days: f64,
}

/// Effective reps of one of the day's sets (effective.ts `setEffective`); `est` when the effort was estimated.
#[derive(Debug, Clone, uniffi::Record)]
pub struct SetEffort {
    pub set_id: String,
    pub n: f64,
    pub est: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct WarmupHint {
    /// kg.
    pub weight: f64,
    pub reps: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct PlatesHint {
    /// The bar (in the user's unit, as the setting holds it).
    pub bar: f64,
    /// Plates for one side, heaviest first (user's unit).
    pub per_side: Vec<f64>,
    /// Whether the weight can be loaded exactly.
    pub exact: bool,
}

/// What the logging screen shows beside the form in Dorian HIT / Lyle mode (ExerciseScreen.tsx), in one call.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ExerciseGuide {
    /// Dorian: the target per working set today (index = working sets already done), adjusted and snapped.
    pub dorian_targets: Vec<GuideTarget>,
    /// Lyle: the exercise's target for this session.
    pub lyle_target: Option<GuideTarget>,
    /// Dorian lighter week on `date`.
    pub light: bool,
    /// Days since the last normal session of the exercise (0 if none), and whether that's a long gap.
    pub gap_days: f64,
    pub long_gap: bool,
    /// Ask readiness before this set: the first set today of a muscle in a training mode.
    pub ask_readiness: bool,
    /// Dorian: muscles of this exercise trained in a main session less than ~5 days ago.
    pub too_soon: Vec<TooSoonMuscle>,
    /// Dorian + program: the program's next workout that doesn't train these muscles (for "still sore").
    pub swap_day: Option<crate::model::RoutineDay>,
    /// Effective reps of the day's sets of this exercise, and their sum (reps exercises).
    pub effort: Vec<SetEffort>,
    pub effective_today: f64,
    /// Whether targets and warm-ups are rounded to plates and plates are shown for this exercise.
    pub shows_plates: bool,
}

#[derive(uniffi::Object)]
pub struct IronCore {
    store: Mutex<Store>,
    /// Record set ids per exercise (the web's `records` store): computing them reads the exercise's whole
    /// history, so they're kept until that exercise's sets change (all of them on body-weight changes).
    records: Mutex<HashMap<String, Vec<String>>>,
    /// The last deleted workout's set ids and day comment, so `put_sets` of exactly those sets (the undo)
    /// brings the comment back too.
    deleted: Mutex<Option<(Vec<String>, DayComment)>>,
    /// Done sets of an exercise by the real load (the graph and the progress tabs), kept like `records`.
    loaded: Mutex<HashMap<String, std::sync::Arc<Vec<load::LoadedSet>>>>,
}

impl IronCore {
    fn new(store: Store) -> Self {
        Self { store: Mutex::new(store), records: Mutex::new(HashMap::new()), deleted: Mutex::new(None), loaded: Mutex::new(HashMap::new()) }
    }

    /// The exercise's done sets by the real load, from the cache or read once.
    fn loaded_cached(&self, s: &Store, ex: &Exercise) -> Result<std::sync::Arc<Vec<load::LoadedSet>>, StoreError> {
        if let Some(l) = self.loaded.lock().unwrap_or_else(|p| p.into_inner()).get(&ex.id) {
            return Ok(l.clone());
        }
        let counted: Vec<WorkoutSet> = s.sets_of(&ex.id)?.into_iter().filter(|x| !x.is_planned()).collect();
        let l = std::sync::Arc::new(real_load(s, ex, &counted)?);
        self.loaded.lock().unwrap_or_else(|p| p.into_inner()).insert(ex.id.clone(), l.clone());
        Ok(l)
    }

    fn with<T>(&self, f: impl FnOnce(&Store) -> Result<T, StoreError>) -> R<T> {
        let s = self.store.lock().unwrap_or_else(|p| p.into_inner());
        Ok(f(&s)?)
    }

    fn cache(&self) -> std::sync::MutexGuard<'_, HashMap<String, Vec<String>>> {
        self.records.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// An exercise's record ids, from the cache or computed (`sets`: its history if already read).
    fn records_cached(&self, s: &Store, ex: &Exercise, sets: Option<&[WorkoutSet]>, bw: &mut Option<load::BodyWeights>) -> Result<Vec<String>, StoreError> {
        if let Some(ids) = self.cache().get(&ex.id) {
            return Ok(ids.clone());
        }
        let ids = records_of(s, ex, sets, bw)?;
        self.cache().insert(ex.id.clone(), ids.clone());
        Ok(ids)
    }

    fn forget(&self, exercise_ids: impl IntoIterator<Item = String>) {
        let mut c = self.cache();
        let mut l = self.loaded.lock().unwrap_or_else(|p| p.into_inner());
        for id in exercise_ids {
            c.remove(&id);
            l.remove(&id);
        }
    }

    fn forget_all(&self) {
        self.cache().clear();
        self.loaded.lock().unwrap_or_else(|p| p.into_inner()).clear();
    }

    /// workout.ts `rewriteDay`: writes the day's sets in a new exercise order (and group ids), keeping each
    /// exercise's set order. Only sets whose order or group changed are written.
    fn rewrite_day(&self, sets: &[WorkoutSet], order: &[String], group_of: &HashMap<String, Option<String>>) -> R<()> {
        let Some(first) = sets.first() else { return Ok(()) };
        let base = first.order; // the day's own key range: other days are unaffected
        let mut by_exercise: HashMap<&str, Vec<&WorkoutSet>> = HashMap::new();
        for s in sets {
            by_exercise.entry(s.exercise_id.as_str()).or_default().push(s);
        }
        let before: HashMap<&str, &WorkoutSet> = sets.iter().map(|s| (s.id.as_str(), s)).collect();
        let changed: Vec<WorkoutSet> = order
            .iter()
            .flat_map(|id| by_exercise.get(id.as_str()).cloned().unwrap_or_default())
            .enumerate()
            .map(|(k, s)| WorkoutSet { order: base + k as f64, group: group_of.get(&s.exercise_id).cloned().flatten(), ..s.clone() })
            .filter(|s| before[s.id.as_str()].order != s.order || before[s.id.as_str()].group != s.group)
            .collect();
        if changed.is_empty() {
            return Ok(());
        }
        self.put_sets(changed)
    }

    /// The program screen's start (`start_program`), with today's date given.
    fn start_program_on(&self, template_id: &str, name: &str, today: &str) -> R<BuiltProgram> {
        let tpl = programs::template(template_id).ok_or_else(|| CoreError::Storage { msg: format!("unknown program template {template_id}") })?;
        let (library, count) = self.with(|s| Ok((s.exercises()?, s.routines()?.len())))?;
        let built = programs::build_program(tpl, name, &library, count as f64, &mut seed::uid);
        self.put_routine(built.routine.clone())?;
        for e in built.ranges {
            self.put_exercise(e)?;
        }
        self.with(|s| {
            let mut st = s.settings()?;
            // Lyle: a cycle starts with the program unless one is running.
            let running = st.cycle.as_ref().is_some_and(|c| lyle::cycle_week(&c.start, today) <= c.weeks);
            if tpl.mode == TrainingMode::Lyle && !running {
                st.cycle = Some(CycleSettings { start: today.to_string(), weeks: st.cycle.as_ref().map_or(6.0, |c| c.weeks) });
            }
            st.mode = tpl.mode;
            st.program = Some(ProgramSettings { routine_id: built.routine.id.clone(), last_day_id: None, weekdays: Some(tpl.weekdays.to_vec()) });
            s.put_settings(&st)
        })?;
        Ok(BuiltProgram { routine: built.routine, missing: built.missing })
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
        Ok(std::sync::Arc::new(Self::new(store)))
    }

    /// An in-memory database (tests, previews).
    #[uniffi::constructor]
    pub fn in_memory() -> R<std::sync::Arc<Self>> {
        let store = Store::open_in_memory()?;
        seed_if_new(&store)?;
        Ok(std::sync::Arc::new(Self::new(store)))
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
        self.forget([e.id.clone()]); // its type or load may have changed
        self.with(|s| s.put_exercise(&e))
    }
    /// Deletes the exercise and every set logged for it.
    pub fn delete_exercise(&self, id: String) -> R<()> {
        self.forget([id.clone()]);
        self.with(|s| s.delete_exercise(&id))
    }

    // ---- Sets ----
    pub fn day(&self, date: String) -> R<DayData> {
        self.with(|s| {
            let sets = s.sets_on(&date)?;
            let exercises: HashMap<String, Exercise> = s.exercises()?.into_iter().map(|e| (e.id.clone(), e)).collect();
            let mut records = Vec::new();
            let mut seen: HashSet<&str> = HashSet::new();
            let mut bw = None; // body weights, read once if a body-weight exercise needs them
            for set in &sets {
                if !seen.insert(set.exercise_id.as_str()) {
                    continue;
                }
                if let Some(ex) = exercises.get(&set.exercise_id) {
                    let ids: HashSet<String> = self.records_cached(s, ex, None, &mut bw)?.into_iter().collect();
                    records.extend(sets.iter().filter(|x| x.exercise_id == ex.id && ids.contains(&x.id)).map(|x| x.id.clone()));
                }
            }
            let known: Vec<WorkoutSet> = sets.iter().filter(|x| exercises.contains_key(&x.exercise_id)).cloned().collect();
            let totals = records::day_totals(&known, |x| load::volume_weight(x.weight, load::load_of(exercises.get(&x.exercise_id))));
            Ok(DayData { comment: s.comment(&date)?, sets, records, set_count: totals.sets as u32, volume: totals.volume, date })
        })
    }
    /// One exercise's logging screen for a day: its sets, last time, records.
    pub fn exercise_log(&self, exercise_id: String, date: String) -> R<ExerciseLog> {
        self.with(|s| {
            let all = s.sets_of(&exercise_id)?;
            let records = match s.exercises()?.into_iter().find(|e| e.id == exercise_id) {
                Some(ex) => self.records_cached(s, &ex, Some(&all), &mut None)?,
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
    /// History and Records tabs of an exercise. An unknown id (e.g. deleted while its screen was open)
    /// gives empty tabs rather than an error: the screen just closes or shows nothing.
    pub fn exercise_progress(&self, exercise_id: String) -> R<ExerciseProgress> {
        self.with(|s| {
            let Some(ex) = s.exercise(&exercise_id)? else {
                return Ok(ExerciseProgress { workouts: vec![], records: vec![], rep_maxes: vec![], best_orm: None, bests: vec![], metrics: vec![] });
            };
            let loaded = self.loaded_cached(s, &ex)?;
            let counted: Vec<WorkoutSet> = s.sets_of(&ex.id)?.into_iter().filter(|x| !x.is_planned()).collect();
            let real: Vec<WorkoutSet> = loaded.iter().map(|l| l.set.clone()).collect();
            let strength = ex.kind == crate::model::ExerciseType::WeightReps;
            let settings = s.settings()?;
            Ok(ExerciseProgress {
                workouts: progress::workouts(&counted),
                records: self.records_cached(s, &ex, None, &mut None)?,
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
            let Some(ex) = s.exercise(&exercise_id)? else { return Ok(vec![]) };
            let real = self.loaded_cached(s, &ex)?;
            Ok(progress::daily_series(&real, metric, s.settings()?.formula, &progress::range_start(range, &today)))
        })
    }
    pub fn sets_between(&self, from: String, to: String) -> R<Vec<WorkoutSet>> {
        self.with(|s| s.sets_between(&from, &to))
    }
    pub fn put_set(&self, set: WorkoutSet) -> R<()> {
        // An edited set may have moved from another exercise: forget both.
        let old = self.with(|s| Ok(s.set(&set.id)?.map(|o| o.exercise_id)))?;
        self.forget(old.into_iter().chain([set.exercise_id.clone()]));
        self.with(|s| s.put_set(&set))
    }
    pub fn put_sets(&self, sets: Vec<WorkoutSet>) -> R<()> {
        let old: Vec<String> = self.with(|s| Ok(sets.iter().filter_map(|x| s.set(&x.id).ok().flatten()).map(|o| o.exercise_id).collect()))?;
        self.forget(old.into_iter().chain(sets.iter().map(|x| x.exercise_id.clone())));
        self.with(|s| s.put_sets(&sets))?;
        // The undo of `delete_workout` (all of its sets back) restores the day's comment too.
        let comment = {
            let mut d = self.deleted.lock().unwrap_or_else(|p| p.into_inner());
            if d.as_ref().is_some_and(|(ids, _)| ids.iter().all(|id| sets.iter().any(|x| &x.id == id))) {
                d.take().map(|(_, c)| c)
            } else {
                None
            }
        };
        match comment {
            Some(c) => self.with(|s| s.put_comment(&c.date, &c.text)),
            None => Ok(()),
        }
    }
    pub fn delete_set(&self, id: String) -> R<()> {
        let old = self.with(|s| Ok(s.set(&id)?.map(|o| o.exercise_id)))?;
        self.forget(old);
        self.with(|s| s.delete_set(&id))
    }
    pub fn delete_sets(&self, ids: Vec<String>) -> R<()> {
        let old: Vec<String> = self.with(|s| Ok(ids.iter().filter_map(|i| s.set(i).ok().flatten()).map(|o| o.exercise_id).collect()))?;
        self.forget(old);
        self.with(|s| s.delete_sets(&ids))
    }
    /// Dates with logged sets in [from, to] (the calendar).
    pub fn dates_with_sets(&self, from: String, to: String) -> R<Vec<String>> {
        self.with(|s| s.dates_with_sets(&from, &to))
    }
    pub fn put_comment(&self, date: String, text: String) -> R<()> {
        self.with(|s| s.put_comment(&date, &text))
    }

    // ---- Training modes on the logging screen (N6; ExerciseScreen.tsx) ----

    /// Targets, readiness, too-soon, effort and plates for logging `exercise_id` on `date`.
    pub fn exercise_guide(&self, exercise_id: String, date: String) -> R<ExerciseGuide> {
        let date = date.as_str();
        let data = self.with(|s| {
            let Some(ex) = s.exercise(&exercise_id)? else { return Ok(None) };
            let history = s.sets_of(&ex.id)?;
            let real = self.loaded_cached(s, &ex)?;
            let on_date = s.sets_on(date)?;
            let near = s.sets_between(&calc::add_days(date.to_string(), -4), &calc::add_days(date.to_string(), -1))?;
            Ok(Some((s.settings()?, ex, history, real, on_date, near, s.routines()?, s.exercises()?)))
        })?;
        let Some((st, ex, history, real, on_date, near, routines, exercises)) = data else {
            return Ok(ExerciseGuide {
                dorian_targets: vec![],
                lyle_target: None,
                light: false,
                gap_days: 0.0,
                long_gap: false,
                ask_readiness: false,
                too_soon: vec![],
                swap_day: None,
                effort: vec![],
                effective_today: 0.0,
                shows_plates: false,
            });
        };
        let has_reps = ex.kind.fields().contains(&crate::model::Field::Reps);
        let round_plates = st.round_plates.unwrap_or(false);
        let plates = plates_setting(&st);
        let snap = tools::snapper_for(Some(&ex), st.unit, plates.as_ref(), round_plates);
        let step_kg = units::w_from_user(ex.increment.unwrap_or_else(|| units::default_increment(st.unit)), st.unit);
        let counted: Vec<WorkoutSet> = history.iter().filter(|x| !x.is_planned()).cloned().collect();
        let progress: Vec<WorkoutSet> = counted.iter().filter(|x| cycle::progressing(x)).cloned().collect();
        let base = records::previous_workout(&progress, date);
        // Days since this exercise's last normal session: after a long gap, targets start a step lower.
        let gap = base.first().map_or(0.0, |b| targets::days_between(&b.date, date));
        let long_gap = gap > feedback::GAP_DAYS;

        // Dorian HIT: each working set against the same set last time.
        let dorian = st.mode == TrainingMode::Dorian && has_reps;
        let light = dorian && cycle::in_light(st.light.as_ref().map(light_of).as_ref(), date);
        let mut dorian_targets = Vec::new();
        if dorian {
            let top = ex.rep_top.unwrap_or(targets::DORIAN_TOP);
            let list = if light { cycle::light_targets(&base, step_kg) } else { targets::dorian_targets(&base, step_kg, top) };
            for mut tg in list {
                if tg.why != targets::TargetWhy::Light {
                    if long_gap {
                        tg = targets::Target { weight: tg.prev.weight.unwrap_or(tg.weight), reps: None, why: targets::TargetWhy::Gap, ..tg };
                    } else if ex.joint == Some(true) && tg.why == targets::TargetWhy::Up {
                        tg = targets::Target { weight: tg.prev.weight.unwrap_or(tg.weight), reps: None, why: targets::TargetWhy::Joint, ..tg };
                    }
                }
                // A weight increase rounds up (never back to the same weight); everything else to the nearest.
                let weight = snap.snap(tg.weight, tg.why == targets::TargetWhy::Up);
                dorian_targets.push(GuideTarget { weight, reps: tg.reps, why: serde_name(&tg.why), prev: Some(tg.prev), week: 0.0 });
            }
        }

        // Lyle: one target for the exercise, from the cycle week and its first set last time.
        let lyle_on = st.mode == TrainingMode::Lyle && has_reps;
        let week = if lyle_on { st.cycle.as_ref().map_or(0.0, |c| lyle::cycle_week(&c.start, date)) } else { 0.0 };
        let mut lyle_target = None;
        if lyle_on {
            let range = lyle::rep_range(ex.rep_top, ex.rep_bottom);
            let run_up = week >= 1.0 && week <= lyle::RUN_UP.len() as f64;
            let first = lyle::last_first_set(&counted, date);
            let mut tg = None;
            // Back after a long gap: a run-up week 2 session (~92.5 % of the best) instead of pushing on.
            if long_gap && !run_up {
                tg = lyle::lyle_target(2.0, lyle::best_for_range(&counted, range.bottom, date), first, step_kg, range)
                    .map(|t| lyle::LyleTarget { weight: snap.snap(t.weight, false), why: lyle::LyleWhy::Gap, ..t });
            }
            if tg.is_none() {
                let start = st.cycle.as_ref().map_or("", |c| c.start.as_str());
                let best = if run_up { lyle::best_for_range(&counted, range.bottom, start) } else { 0.0 };
                tg = lyle::lyle_target(if run_up { week } else { 0.0 }, best, first, step_kg, range).map(|t| {
                    if ex.joint == Some(true) && t.why == lyle::LyleWhy::Up {
                        let weight = t.prev.as_ref().and_then(|p| p.weight).unwrap_or(t.weight);
                        lyle::LyleTarget { weight, reps: range.top, why: lyle::LyleWhy::Joint, ..t }
                    } else {
                        let up = t.why == lyle::LyleWhy::Up;
                        lyle::LyleTarget { weight: snap.snap(t.weight, up), ..t }
                    }
                });
            }
            lyle_target = tg.map(|t| GuideTarget { weight: t.weight, reps: Some(t.reps), why: serde_name(&t.why), prev: t.prev, week });
        }

        // Readiness, asked before a muscle's first set of the day (Dorian HIT / Lyle).
        let primary: Vec<crate::model::MuscleId> = ex.muscles.as_ref().map(|m| m.primary.clone()).unwrap_or_default();
        let muscles_of: HashMap<&str, &crate::model::Muscles> = exercises.iter().filter_map(|e| e.muscles.as_ref().map(|m| (e.id.as_str(), m))).collect();
        let trains_same = |id: &str| muscles_of.get(id).is_some_and(|m| m.primary.iter().any(|p| primary.contains(p)));
        let done_today = on_date.iter().any(|x| x.exercise_id == ex.id && !x.is_planned());
        let ask_readiness = st.mode != TrainingMode::Standard
            && !primary.is_empty()
            && has_reps
            && !done_today
            && !on_date.iter().any(|x| x.exercise_id != ex.id && !x.is_planned() && trains_same(&x.exercise_id));

        // Still sore in Dorian HIT with a program: the next workout that doesn't train these muscles.
        let mut swap_day = None;
        if let (true, Some(program)) = (dorian && !primary.is_empty(), st.program.as_ref()) {
            let routine = routines.iter().find(|r| r.id == program.routine_id);
            if let (Some(r), Some(next)) = (routine, cycle::next_program_day(routine, program.last_day_id.as_deref())) {
                let start = r.days.iter().position(|d| d.id == next.id).unwrap_or(0);
                swap_day = r.days[start..].iter().chain(r.days[..start].iter()).find(|d| d.items.iter().all(|i| !trains_same(&i.exercise_id))).cloned();
            }
        }

        // Muscles trained in a main session less than ~5 days ago (Dorian HIT).
        let too_soon = if dorian && !primary.is_empty() {
            targets::too_soon(
                date,
                ex.muscles.as_ref(),
                &near,
                |id| muscles_of.get(id).map(|m| (*m).clone()),
                |x| crate::effective::set_effective(x, 0.0, st.formula).n,
                targets::DORIAN_REST_DAYS,
                targets::DORIAN_GOAL,
            )
            .into_iter()
            .map(|t| TooSoonMuscle { muscle: t.muscle, days: t.days })
            .collect()
        } else {
            vec![]
        };

        // Effective reps of the day's sets; the best e1RM of the working sets estimates sets logged without an RIR.
        let best = real
            .iter()
            .filter(|x| !x.set.is_warmup())
            .fold(0.0, |b, x| calc::js_max(b, calc::one_rm(x.set.weight.unwrap_or(0.0), x.set.reps.unwrap_or(0.0), st.formula)));
        let effort: Vec<SetEffort> = real
            .iter()
            .filter(|x| x.set.date == date)
            .map(|x| {
                let e = crate::effective::set_effective(&x.set, best, st.formula);
                SetEffort { set_id: x.set.id.clone(), n: e.n, est: e.est }
            })
            .collect();
        let effective_today = if has_reps { effort.iter().map(|e| e.n).sum() } else { 0.0 };

        Ok(ExerciseGuide {
            dorian_targets,
            lyle_target,
            light,
            gap_days: gap,
            long_gap,
            ask_readiness,
            too_soon,
            swap_day,
            effort,
            effective_today,
            shows_plates: tools::rounds_to_plates(Some(&ex), round_plates),
        })
    }
    /// Warm-up sets before a working weight (targets.ts `warmups`), snapped to plates as the web does.
    pub fn warmups_for(&self, exercise_id: String, work_kg: f64) -> R<Vec<WarmupHint>> {
        let (st, ex) = self.with(|s| Ok((s.settings()?, s.exercise(&exercise_id)?)))?;
        let Some(ex) = ex else { return Ok(vec![]) };
        let step_kg = units::w_from_user(ex.increment.unwrap_or_else(|| units::default_increment(st.unit)), st.unit);
        let snap = tools::snapper_for(Some(&ex), st.unit, plates_setting(&st).as_ref(), st.round_plates.unwrap_or(false));
        Ok(targets::warmups(work_kg, step_kg).into_iter().map(|w| WarmupHint { weight: snap.snap(w.weight, false), reps: w.reps }).collect())
    }
    /// Plates per side for a weight in kg on this exercise's bar (None when plates aren't used/shown).
    pub fn plates_for(&self, exercise_id: String, kg: f64) -> R<Option<PlatesHint>> {
        let (st, ex) = self.with(|s| Ok((s.settings()?, s.exercise(&exercise_id)?)))?;
        if !tools::rounds_to_plates(ex.as_ref(), st.round_plates.unwrap_or(false)) {
            return Ok(None);
        }
        let cfg = tools::plate_config(st.unit, plates_setting(&st).as_ref());
        let side = tools::plates_per_side(units::w_to_user(kg, st.unit), cfg.bar, &cfg.sizes);
        Ok(Some(PlatesHint { bar: cfg.bar, per_side: side.plates, exact: side.rest < 1e-6 }))
    }

    // ---- Day tools, calendar, routines, programs (N5; workout.ts / calendar.ts / routines.ts / programs.ts) ----

    /// The calendar month `month` ("YYYY-MM"), weeks starting on `week_start` (0 Sunday, 1 Monday).
    pub fn calendar_month(&self, month: String, week_start: u8) -> R<CalendarMonth> {
        let (first, last) = calendar::month_bounds(&month);
        let (sets, exercises) = self.with(|s| Ok((s.sets_between(&first, &last)?, s.exercises()?)))?;
        let category: HashMap<&str, &str> = exercises.iter().map(|e| (e.id.as_str(), e.category_id.as_str())).collect();
        // Category ids per day in first-logged order; a routine day logged but not done isn't a workout.
        let mut days: Vec<CalendarDay> = Vec::new();
        let mut at: HashMap<String, usize> = HashMap::new();
        for s in sets.iter().filter(|s| !s.is_planned()) {
            let Some(cat) = category.get(s.exercise_id.as_str()).filter(|c| !c.is_empty()) else { continue };
            match at.get(&s.date) {
                Some(&i) => {
                    if !days[i].category_ids.iter().any(|c| c == cat) {
                        days[i].category_ids.push(cat.to_string());
                    }
                }
                None => {
                    at.insert(s.date.clone(), days.len());
                    days.push(CalendarDay { date: s.date.clone(), category_ids: vec![cat.to_string()] });
                }
            }
        }
        let grid = calendar::month_grid(&month, week_start);
        Ok(CalendarMonth { month, grid, workouts: days.len() as u32, days })
    }
    /// workout.ts `copySets`: copies these sets (another day's) to `to`, as new sets after the day's own.
    pub fn copy_sets(&self, set_ids: Vec<String>, to: String) -> R<()> {
        let (mut sets, settings) = self.with(|s| {
            let mut found = Vec::new();
            for id in &set_ids {
                found.extend(s.set(id)?);
            }
            Ok((found, s.settings()?))
        })?;
        sets.sort_by(records::by_order);
        let light = settings.light.as_ref().map(light_of);
        let copies: Vec<WorkoutSet> = sets
            .iter()
            .map(|s| WorkoutSet {
                id: seed::uid(),
                order: next_order(),
                comment: None,
                done: if settings.mark_done { Some(false) } else { None },
                at: None,
                ..cycle::redated(s, &to, light.as_ref())
            })
            .collect();
        self.put_sets(copies)
    }
    /// workout.ts `moveExercise`: moves an exercise (with its superset) up (-1) or down (1) in its day.
    pub fn move_exercise(&self, date: String, exercise_id: String, dir: i32) -> R<()> {
        let sets = self.with(|s| s.sets_on(&date))?;
        let current = groups::day_order(&sets);
        let order = groups::move_unit(&current, &exercise_id, dir.signum());
        if order.iter().zip(&current).all(|(id, c)| *id == c.exercise_id) {
            return Ok(());
        }
        let group_of: HashMap<String, Option<String>> = current.into_iter().map(|o| (o.exercise_id, o.group)).collect();
        self.rewrite_day(&sets, &order, &group_of)
    }
    /// workout.ts `groupExercises`: makes these exercises of the day a superset.
    pub fn group_exercises(&self, date: String, exercise_ids: Vec<String>) -> R<()> {
        if exercise_ids.len() < 2 {
            return Ok(());
        }
        let sets = self.with(|s| s.sets_on(&date))?;
        let members: HashSet<String> = exercise_ids.into_iter().collect();
        let current = groups::day_order(&sets);
        let g = seed::uid();
        // Joining a group takes an exercise out of its old one; a group left with one member dissolves.
        let mut left: HashMap<&str, usize> = HashMap::new();
        for o in &current {
            if let Some(og) = o.group.as_deref().filter(|_| !members.contains(&o.exercise_id)) {
                *left.entry(og).or_insert(0) += 1;
            }
        }
        let group_of: HashMap<String, Option<String>> = current
            .iter()
            .map(|o| {
                let group = if members.contains(&o.exercise_id) {
                    Some(g.clone())
                } else {
                    o.group.clone().filter(|og| left.get(og.as_str()).copied().unwrap_or(0) > 1)
                };
                (o.exercise_id.clone(), group)
            })
            .collect();
        let order = groups::pull_together(&current.iter().map(|o| o.exercise_id.clone()).collect::<Vec<_>>(), &members);
        self.rewrite_day(&sets, &order, &group_of)
    }
    /// workout.ts `ungroupExercise`: takes an exercise out of its superset that day.
    pub fn ungroup_exercise(&self, date: String, exercise_id: String) -> R<()> {
        let sets = self.with(|s| s.sets_on(&date))?;
        let current = groups::day_order(&sets);
        let Some(g) = current.iter().find(|o| o.exercise_id == exercise_id).and_then(|o| o.group.clone()) else { return Ok(()) };
        let remaining = current.iter().filter(|o| o.group.as_deref() == Some(g.as_str()) && o.exercise_id != exercise_id).count();
        let group_of: HashMap<String, Option<String>> = current
            .iter()
            .map(|o| {
                let dissolved = o.exercise_id == exercise_id || (o.group.as_deref() == Some(g.as_str()) && remaining < 2);
                (o.exercise_id.clone(), if dissolved { None } else { o.group.clone() })
            })
            .collect();
        let order: Vec<String> = current.into_iter().map(|o| o.exercise_id).collect();
        self.rewrite_day(&sets, &order, &group_of)
    }
    /// workout.ts `deleteWorkout`: deletes the day's sets (and comment); returns them for an undo (`put_sets`,
    /// which also brings the comment back when it puts all of these sets back).
    pub fn delete_workout(&self, date: String) -> R<Vec<WorkoutSet>> {
        let (sets, comment) = self.with(|s| Ok((s.sets_on(&date)?, s.comment(&date)?)))?;
        self.delete_sets(sets.iter().map(|s| s.id.clone()).collect())?;
        let ids: Vec<String> = sets.iter().map(|s| s.id.clone()).collect();
        *self.deleted.lock().unwrap_or_else(|p| p.into_inner()) = match comment {
            Some(text) if !ids.is_empty() => Some((ids, DayComment { date: date.clone(), text })),
            _ => None,
        };
        self.with(|s| s.put_comment(&date, ""))?;
        Ok(sets)
    }
    /// workout.ts `logRoutineDay`: logs a routine day into `date` as planned sets (weights from last time,
    /// Dorian/Lyle targets and lighter weeks, rounded to plates as the setting says), joins the day's
    /// supersets, and moves the program on when the day belongs to it.
    pub fn log_routine_day(&self, routine_id: String, day_id: String, date: String) -> R<()> {
        let sets = self.with(|s| plan_routine_day(s, &routine_id, &day_id, &date))?;
        if sets.is_empty() {
            return Ok(());
        }
        self.put_sets(sets)?;
        // A workout of the program: the next one comes after it.
        self.with(|s| {
            let mut st = s.settings()?;
            if let Some(p) = st.program.as_mut() {
                if s.routines()?.iter().find(|r| r.id == p.routine_id).is_some_and(|r| r.days.iter().any(|d| d.id == day_id)) {
                    p.last_day_id = Some(day_id.clone());
                    s.put_settings(&st)?;
                }
            }
            Ok(())
        })
    }
    /// routines.ts `workoutFromDay` saved as a new day of routine `routine_id` (or a new routine named
    /// `name` when `routine_id` is None): sets × reps, supersets, no weights. Returns the routine.
    /// Nothing is saved (and the routine comes back unchanged, or empty and unsaved) for a blank name or
    /// a day without exercises, as the web's Save does nothing then.
    /// `new_routine_name`: the folder created when `routine_id` is None (the web: t("myWorkouts")).
    pub fn save_workout(&self, date: String, name: String, routine_id: Option<String>, new_routine_name: String) -> R<Routine> {
        let name = name.trim().to_string();
        let (sets, exercises, mut routines) = self.with(|s| Ok((s.sets_on(&date)?, s.exercises()?, s.routines()?)))?;
        let by_id: HashMap<&str, &Exercise> = exercises.iter().map(|e| (e.id.as_str(), e)).collect();
        let workout = routines::workout_from_day(&name, &sets, &|id| by_id.get(id).map(|e| (*e).clone()), &mut seed::uid);
        let existing = routine_id.and_then(|id| routines.iter().position(|r| r.id == id));
        if name.is_empty() || workout.items.is_empty() {
            return Ok(existing.map(|i| routines.swap_remove(i)).unwrap_or(Routine { id: String::new(), name, order: 0.0, days: vec![] }));
        }
        let routine = match existing {
            Some(i) => {
                let mut r = routines.swap_remove(i);
                r.days.push(workout);
                r
            }
            None => Routine { id: seed::uid(), name: new_routine_name, order: routines.iter().map(|r| r.order).fold(-1.0, f64::max) + 1.0, days: vec![workout] },
        };
        self.put_routine(routine.clone())?;
        Ok(routine)
    }
    /// programs.ts `TEMPLATES`.
    pub fn program_templates(&self) -> Vec<ProgramTemplate> {
        programs::TEMPLATES
            .iter()
            .map(|t| ProgramTemplate {
                id: t.id.to_string(),
                mode: t.mode,
                weekdays: t.weekdays.to_vec(),
                day_names: t.days.iter().map(|(n, _)| n.to_string()).collect(),
            })
            .collect()
    }
    /// programs.ts `buildProgram` + saving it: the routine is stored, and settings get the mode, the
    /// program (routine, weekdays) and Lyle's rep ranges as the web's Programs screen does. A Lyle program
    /// also starts a cycle on `today` (the app's local date) unless one is running.
    pub fn start_program(&self, template_id: String, name: String, today: String) -> R<BuiltProgram> {
        self.start_program_on(&template_id, &name, &today)
    }
    /// The program's next workout day for `date` (cycle.ts `nextProgramDay`), or None.
    pub fn next_program_day(&self, date: String) -> R<Option<crate::model::RoutineDay>> {
        let _ = date; // the rotation doesn't depend on the day: a missed day moves the rest along
        self.with(|s| {
            let Some(p) = s.settings()?.program else { return Ok(None) };
            let routine = s.routines()?.into_iter().find(|r| r.id == p.routine_id);
            Ok(cycle::next_program_day(routine.as_ref(), p.last_day_id.as_deref()).cloned())
        })
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
        self.forget_all(); // which measure is "body weight" may change
        self.with(|s| s.put_metrics(&list))
    }
    pub fn delete_metric(&self, id: String) -> R<()> {
        self.forget_all();
        self.with(|s| s.delete_metric(&id))
    }
    pub fn body_of(&self, metric_id: String) -> R<Vec<BodyMetricEntry>> {
        self.with(|s| s.body_of(&metric_id))
    }
    /// A body entry: body-weight exercises' records depend on it (state.ts `bodyWeightsChanged`).
    pub fn put_entry(&self, e: BodyMetricEntry) -> R<()> {
        self.forget_all();
        self.with(|s| s.put_entry(&e))
    }
    pub fn delete_entry(&self, id: String) -> R<()> {
        self.forget_all();
        self.with(|s| s.delete_entry(&id))
    }

    // ---- Backup (the web app's file format, both ways) ----
    /// The whole database as a backup file (JSON). `exported`: an ISO time stamp for the file.
    pub fn export_backup_json(&self, exported: String) -> R<String> {
        self.with(|s| s.export_backup_json(&exported))
    }
    /// Replaces everything with a backup file. A file that isn't valid changes nothing.
    pub fn import_backup_json(&self, json: String) -> R<()> {
        self.forget_all();
        self.with(|s| s.import_backup_json(&json))
    }
}

/// The graph's metrics for an exercise type (progress.ts `metricsFor`): cheap, no history read.
#[uniffi::export]
pub fn metrics_for(kind: crate::model::ExerciseType) -> Vec<progress::Metric> {
    progress::metrics_for(kind)
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

/// A `why` as the web's string (its serde name).
fn serde_name<T: serde::Serialize>(v: &T) -> String {
    serde_json::to_value(v).ok().and_then(|x| x.as_str().map(String::from)).unwrap_or_default()
}

fn plates_setting(st: &Settings) -> Option<tools::PlatesSetting> {
    st.plates.as_ref().map(|p| tools::PlatesSetting { unit: p.unit, bar: p.bar, sizes: p.sizes.clone() })
}

fn light_of(l: &LightSettings) -> cycle::Light {
    cycle::Light { start: l.start.clone() }
}

/// db.ts `lastWorkoutSets`: the exercise's sets of its last workout (the day of its latest done set), in
/// order; empty if none.
fn last_workout_sets(s: &Store, exercise_id: &str) -> Result<Vec<WorkoutSet>, StoreError> {
    let all = s.sets_of(exercise_id)?;
    Ok(match all.iter().rev().find(|x| !x.is_planned()) {
        Some(last) => {
            let date = last.date.clone();
            all.into_iter().filter(|x| x.date == date && !x.is_planned()).collect()
        }
        None => Vec::new(),
    })
}

/// workout.ts `logRoutineDay`, up to the sets to write: the day's planned sets on `date` with the weights
/// the plan leaves open filled from last time (or the mode's targets). Empty when routine/day is unknown.
fn plan_routine_day(s: &Store, routine_id: &str, day_id: &str, date: &str) -> Result<Vec<WorkoutSet>, StoreError> {
    let Some(day) = s.routines()?.into_iter().find(|r| r.id == routine_id).and_then(|r| r.days.into_iter().find(|d| d.id == day_id)) else {
        return Ok(Vec::new());
    };
    let st = s.settings()?;
    let exercises: HashMap<String, Exercise> = s.exercises()?.into_iter().map(|e| (e.id.clone(), e)).collect();
    let items: Vec<_> = day.items.iter().filter(|i| exercises.contains_key(&i.exercise_id)).cloned().collect();
    // Last workout's sets per exercise: fill in the weights the plan leaves open, set by set.
    let mut ids: Vec<&str> = Vec::new();
    for i in &items {
        if !ids.contains(&i.exercise_id.as_str()) {
            ids.push(&i.exercise_id);
        }
    }
    let mut last: HashMap<String, Vec<WorkoutSet>> = HashMap::new();
    for id in &ids {
        last.insert(id.to_string(), last_workout_sets(s, id)?);
    }
    // Rounded to the bar and plates as on the logging screen (setting; barbell lifts): an increase rounds up.
    let plates = st.plates.as_ref().map(|p| tools::PlatesSetting { unit: p.unit, bar: p.bar, sizes: p.sizes.clone() });
    let snapper = |id: &str| tools::snapper_for(exercises.get(id), st.unit, plates.as_ref(), st.round_plates.unwrap_or(false));
    let step_of = |ex: &Exercise| units::w_from_user(ex.increment.unwrap_or_else(|| units::default_increment(st.unit)), st.unit);
    if st.mode == TrainingMode::Dorian {
        // Dorian HIT: from the last normal session (never a lighter week's): sets that reached the top of the
        // range come one weight step up; in a lighter week every working set ~10 % lighter.
        let lighter = cycle::in_light(st.light.as_ref().map(light_of).as_ref(), date);
        for id in &ids {
            let ex = &exercises[*id];
            let step = step_of(ex);
            // Last time's sets unless they are a lighter week's or the day's own.
            let recent = &last[*id];
            let base: Vec<WorkoutSet> = if !recent.is_empty() && recent[0].date.as_str() < date && recent.iter().all(cycle::progressing) {
                recent.clone()
            } else {
                let all: Vec<WorkoutSet> = s.sets_of(id)?.into_iter().filter(cycle::progressing).collect();
                records::previous_workout(&all, date)
            };
            let next: Vec<WorkoutSet> =
                if lighter { base.iter().map(|x| cycle::light_set(x, step)).collect() } else { targets::progressed_sets(&base, step, ex.rep_top.unwrap_or(targets::DORIAN_TOP)) };
            let snap = snapper(id);
            let snapped = next
                .into_iter()
                .enumerate()
                .map(|(i, x)| match x.weight {
                    Some(w) if !x.is_warmup() => {
                        let up = w > base.get(i).and_then(|b| b.weight).unwrap_or(f64::INFINITY);
                        WorkoutSet { weight: Some(snap.snap(w, up)), ..x }
                    }
                    _ => x,
                })
                .collect();
            last.insert(id.to_string(), snapped);
        }
    }
    if st.mode == TrainingMode::Lyle {
        // Lyle: every working set of an exercise starts at its target (run-up week or push rule).
        let cycle_set = st.cycle.as_ref();
        let week = cycle_set.map_or(0.0, |c| lyle::cycle_week(&c.start, date));
        let run_up = week >= 1.0 && week <= lyle::RUN_UP.len() as f64;
        for id in &ids {
            let ex = &exercises[*id];
            let sets = last[*id].clone();
            let range = lyle::rep_range(ex.rep_top, ex.rep_bottom);
            // Push weeks need only last time's first set; the full history only for a run-up's best, or
            // when the last workout is the day itself.
            let mut first = lyle::last_first_set(&sets, date).cloned();
            let all: Option<Vec<WorkoutSet>> =
                if run_up || (first.is_none() && !sets.is_empty()) { Some(s.sets_of(id)?.into_iter().filter(|x| !x.is_planned()).collect()) } else { None };
            if first.is_none() {
                if let Some(all) = &all {
                    first = lyle::last_first_set(all, date).cloned();
                }
            }
            let best = match (run_up, &all, cycle_set) {
                (true, Some(all), Some(c)) => lyle::best_for_range(all, range.bottom, &c.start),
                _ => 0.0,
            };
            let tg = lyle::lyle_target(if run_up { week } else { 0.0 }, best, first.as_ref(), step_of(ex), range);
            let w = snapper(id).snap(tg.as_ref().map_or(0.0, |t| t.weight), tg.as_ref().is_some_and(|t| t.why == lyle::LyleWhy::Up));
            if let Some(tg) = tg {
                last.insert(id.to_string(), sets.into_iter().filter(|x| !x.is_warmup()).map(|x| WorkoutSet { weight: Some(w), reps: Some(tg.reps), ..x }).collect());
            }
        }
    }
    let same_day = s.sets_on(date)?;
    let plan = crate::model::RoutineDay { items, ..day };
    // Sets of an exercise already in a superset that day join it.
    Ok(routines::planned_sets(&plan, date, &mut |id| last.get(id).cloned().unwrap_or_default(), &mut next_order, &mut seed::uid, st.mode == TrainingMode::Dorian)
        .into_iter()
        .map(|x| WorkoutSet { group: groups::group_of(&same_day, &x.exercise_id).or(x.group.clone()), ..x })
        .collect())
}

/// An exercise's record set ids over its whole history, by the real load (state.ts `refreshRecords` with
/// `loadedSetsOf`: body-weight exercises count the body weight of the day — the first weight measure).
fn records_of(s: &Store, ex: &Exercise, sets: Option<&[WorkoutSet]>, bw: &mut Option<load::BodyWeights>) -> Result<Vec<String>, StoreError> {
    let owned;
    let sets = match sets {
        Some(x) => x,
        None => {
            owned = s.sets_of(&ex.id)?;
            &owned
        }
    };
    let t = load::load_of(Some(ex));
    if t == crate::model::LoadType::Total {
        return Ok(records::record_ids(sets, ex.kind, true));
    }
    if bw.is_none() {
        *bw = Some(body_weights(s)?);
    }
    let bw = bw.as_ref().unwrap();
    Ok(records::record_ids_loaded(&load::with_real_load(sets, t, |d| bw.at(d)), ex.kind, true))
}

/// state.ts `loadedSetsOf`: sets as calculations see them — the real load (body weight ± for body-weight
/// exercises, by the first weight measure's value on the day) and the volume weight.
fn real_load(s: &Store, ex: &Exercise, sets: &[WorkoutSet]) -> Result<Vec<load::LoadedSet>, StoreError> {
    let t = load::load_of(Some(ex));
    if t == crate::model::LoadType::Total {
        return Ok(load::with_real_load(sets, t, |_| None));
    }
    let bw = body_weights(s)?;
    Ok(load::with_real_load(sets, t, |d| bw.at(d)))
}

/// Body weight by date: the first weight measure's entries (state.ts `bodyWeights`).
fn body_weights(s: &Store) -> Result<load::BodyWeights, StoreError> {
    let mut weights: Vec<BodyMetric> = s.metrics()?.into_iter().filter(|m| m.kind == crate::model::BodyKind::Weight).collect();
    weights.sort_by(|a, b| a.order.partial_cmp(&b.order).unwrap_or(std::cmp::Ordering::Equal));
    let entries = match weights.first() {
        Some(m) => s.body_of(&m.id)?,
        None => Vec::new(),
    };
    Ok(load::body_weight_at(&entries))
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
    fn record_cache_follows_edits() {
        let core = IronCore::in_memory().unwrap();
        let ex = core.library().unwrap().exercises.into_iter().find(|e| e.name == "Flat Barbell Bench Press").unwrap().id;
        let set = |id: &str, w: f64| WorkoutSet { id: id.into(), date: "2026-11-12".into(), exercise_id: ex.clone(), order: next_order(), weight: Some(w), reps: Some(5.0), ..Default::default() };
        core.put_set(set("a", 100.0)).unwrap();
        assert_eq!(core.day("2026-11-12".into()).unwrap().records, ["a"]);
        core.put_set(set("b", 110.0)).unwrap(); // beats a
        assert_eq!(core.day("2026-11-12".into()).unwrap().records, ["b"]);
        core.delete_set("b".into()).unwrap(); // a is the record again
        assert_eq!(core.day("2026-11-12".into()).unwrap().records, ["a"]);
        core.put_set(set("a", 90.0)).unwrap(); // edited in place: still the only set, still a record
        assert_eq!(core.exercise_log(ex.clone(), "2026-11-12".into()).unwrap().records, ["a"]);
    }

    #[test]
    fn graph_cache_follows_edits() {
        use crate::progress::{Metric, Range};
        let core = IronCore::in_memory().unwrap();
        let lib = core.library().unwrap().exercises;
        let pull = lib.iter().find(|e| e.name == "Pull Up").unwrap().id.clone();
        let w = core.metrics().unwrap().into_iter().find(|m| m.kind == crate::model::BodyKind::Weight).unwrap();
        core.put_entry(BodyMetricEntry { id: "w1".into(), metric_id: w.id.clone(), date: "2026-11-01".into(), value: 80.0, at: 1.0 }).unwrap();
        let set = |id: &str, date: &str| WorkoutSet { id: id.into(), date: date.into(), exercise_id: pull.clone(), order: next_order(), weight: Some(0.0), reps: Some(10.0), ..Default::default() };
        core.put_set(set("a", "2026-11-10")).unwrap();
        let series = |c: &IronCore| c.exercise_series(pull.clone(), Metric::MaxWeight, Range::All, "2026-11-12".into()).unwrap();
        assert_eq!(series(&core).iter().map(|p| p.value).collect::<Vec<_>>(), [80.0]); // body weight counts
        core.put_set(set("b", "2026-11-12")).unwrap();
        assert_eq!(series(&core).len(), 2); // a new day appears
        core.put_entry(BodyMetricEntry { id: "w2".into(), metric_id: w.id, date: "2026-11-11".into(), value: 82.0, at: 2.0 }).unwrap();
        assert_eq!(series(&core).iter().map(|p| p.value).collect::<Vec<_>>(), [80.0, 82.0]); // new body weight used
        core.delete_set("b".into()).unwrap();
        assert_eq!(series(&core).len(), 1);
        assert_eq!(metrics_for(crate::model::ExerciseType::WeightReps).len(), 5);
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

    // ---- N5: calendar, day tools, routines, programs ----

    use crate::model::{PlannedSet, RoutineItem};

    fn exercise(core: &IronCore, name: &str) -> Exercise {
        core.library().unwrap().exercises.into_iter().find(|e| e.name == name).unwrap_or_else(|| panic!("no {name}"))
    }
    fn logged(ex: &Exercise, date: &str, weight: f64, reps: f64) -> WorkoutSet {
        WorkoutSet { id: new_id(), date: date.into(), exercise_id: ex.id.clone(), order: next_order(), weight: Some(weight), reps: Some(reps), ..Default::default() }
    }
    fn item(ex: &Exercise, sets: usize) -> RoutineItem {
        RoutineItem { exercise_id: ex.id.clone(), sets: vec![PlannedSet::default(); sets], group: None }
    }
    fn routine_of(core: &IronCore, days: Vec<(&str, Vec<RoutineItem>)>) -> Routine {
        let r = Routine {
            id: new_id(),
            name: "Plan".into(),
            order: 0.0,
            days: days.into_iter().map(|(n, items)| crate::model::RoutineDay { id: new_id(), name: n.into(), items }).collect(),
        };
        core.put_routine(r.clone()).unwrap();
        r
    }
    fn mode(core: &IronCore, f: impl FnOnce(&mut Settings)) {
        let mut st = core.settings().unwrap();
        f(&mut st);
        core.put_settings(st).unwrap();
    }
    /// The planned sets logged on a day: (weight, reps) per set of an exercise.
    fn plan_of(core: &IronCore, date: &str, ex: &Exercise) -> Vec<(Option<f64>, Option<f64>)> {
        core.day(date.into()).unwrap().sets.iter().filter(|s| s.exercise_id == ex.id).map(|s| (s.weight, s.reps)).collect()
    }
    fn exercise_order(core: &IronCore, date: &str) -> Vec<String> {
        groups::day_order(&core.day(date.into()).unwrap().sets).into_iter().map(|o| o.exercise_id).collect()
    }

    #[test]
    fn calendar_month_counts_done_days_and_categories_in_order() {
        let core = IronCore::in_memory().unwrap();
        let (bench, curl, fly) = (exercise(&core, "Flat Barbell Bench Press"), exercise(&core, "Barbell Curl"), exercise(&core, "Dumbbell Fly"));
        let planned = WorkoutSet { planned: Some(true), done: Some(false), ..logged(&bench, "2026-11-04", 100.0, 8.0) };
        core.put_sets(vec![
            logged(&curl, "2026-11-03", 30.0, 10.0),
            logged(&bench, "2026-11-03", 100.0, 8.0),
            logged(&fly, "2026-11-03", 20.0, 12.0), // same category as the bench: one dot
            planned,                                  // not a workout
            logged(&bench, "2026-10-31", 100.0, 8.0), // another month
            logged(&bench, "2026-11-30", 100.0, 8.0),
            WorkoutSet { exercise_id: "gone".into(), ..logged(&bench, "2026-11-20", 1.0, 1.0) }, // deleted exercise
        ])
        .unwrap();
        let m = core.calendar_month("2026-11".into(), 1).unwrap();
        assert_eq!((m.grid.len(), m.grid[0].as_str(), m.grid[41].as_str()), (42, "2026-10-26", "2026-12-06"));
        assert_eq!(m.workouts, 2);
        assert_eq!(m.days.iter().map(|d| d.date.as_str()).collect::<Vec<_>>(), ["2026-11-03", "2026-11-30"]);
        assert_eq!(m.days[0].category_ids, [curl.category_id.clone(), bench.category_id.clone()]);
        assert_eq!(core.calendar_month("2026-11".into(), 0).unwrap().grid.len(), 35);
    }

    #[test]
    fn copy_sets_goes_after_the_days_own_sets() {
        let core = IronCore::in_memory().unwrap();
        let bench = exercise(&core, "Flat Barbell Bench Press");
        let own = logged(&bench, "2026-11-12", 50.0, 5.0);
        let a = WorkoutSet { comment: Some("heavy".into()), done: Some(true), at: Some(5.0), group: Some("g".into()), ..logged(&bench, "2026-11-05", 100.0, 8.0) };
        let b = logged(&bench, "2026-11-05", 100.0, 7.0);
        core.put_sets(vec![own.clone(), b.clone(), a.clone()]).unwrap();
        core.copy_sets(vec![b.id.clone(), a.id.clone(), "missing".into()], "2026-11-12".into()).unwrap();
        let day = core.day("2026-11-12".into()).unwrap().sets;
        assert_eq!(day.len(), 3);
        assert_eq!(day[0].id, own.id);
        // In their own order (a was logged before b), new ids, nothing carried but the numbers.
        assert_eq!(day[1..].iter().map(|s| s.reps).collect::<Vec<_>>(), [Some(8.0), Some(7.0)]);
        assert!(day[1..].iter().all(|s| s.id != a.id && s.id != b.id && s.comment.is_none() && s.at.is_none() && s.done.is_none() && s.date == "2026-11-12"));
        assert_eq!(day[1].group.as_deref(), Some("g")); // a superset copies as one
        assert_eq!(core.day("2026-11-05".into()).unwrap().sets.len(), 2); // the source is untouched
        // "Mark done" on: copies come back as not done yet.
        mode(&core, |st| st.mark_done = true);
        core.copy_sets(vec![a.id.clone()], "2026-11-13".into()).unwrap();
        assert_eq!(core.day("2026-11-13".into()).unwrap().sets[0].done, Some(false));
    }

    #[test]
    fn a_lighter_week_set_stays_one_only_in_a_lighter_week() {
        let core = IronCore::in_memory().unwrap();
        let bench = exercise(&core, "Flat Barbell Bench Press");
        let s = WorkoutSet { deload: Some(true), ..logged(&bench, "2026-11-10", 90.0, 8.0) };
        core.put_set(s.clone()).unwrap();
        mode(&core, |st| st.light = Some(LightSettings { start: "2026-11-09".into() }));
        core.copy_sets(vec![s.id.clone()], "2026-11-11".into()).unwrap(); // into the lighter week
        core.copy_sets(vec![s.id.clone()], "2026-11-20".into()).unwrap(); // out of it
        assert_eq!(core.day("2026-11-11".into()).unwrap().sets[0].deload, Some(true));
        assert_eq!(core.day("2026-11-20".into()).unwrap().sets[0].deload, None);
    }

    #[test]
    fn supersets_group_move_ungroup() {
        let core = IronCore::in_memory().unwrap();
        let names = ["Flat Barbell Bench Press", "Dumbbell Fly", "Barbell Curl", "Cable Pushdown"];
        let [bench, fly, curl, push] = names.map(|n| exercise(&core, n));
        let d = "2026-11-12";
        let sets = vec![logged(&bench, d, 100.0, 8.0), logged(&bench, d, 100.0, 7.0), logged(&fly, d, 20.0, 12.0), logged(&fly, d, 20.0, 11.0), logged(&curl, d, 30.0, 10.0), logged(&push, d, 40.0, 12.0)];
        let other_day = logged(&bench, "2026-11-13", 90.0, 5.0);
        core.put_sets([sets.clone(), vec![other_day.clone()]].concat()).unwrap();
        let ids = |ex: &Exercise| core.day(d.into()).unwrap().sets.into_iter().filter(|s| s.exercise_id == ex.id).map(|s| s.id).collect::<Vec<_>>();
        let group = |ex: &Exercise| groups::group_of(&core.day(d.into()).unwrap().sets, &ex.id);

        // Bench + curl become a superset, pulled together at the bench.
        core.group_exercises(d.into(), vec![curl.id.clone(), bench.id.clone()]).unwrap();
        assert_eq!(exercise_order(&core, d), [&bench, &curl, &fly, &push].map(|e| e.id.clone()));
        assert!(group(&bench).is_some() && group(&bench) == group(&curl) && group(&fly).is_none());
        assert_eq!(ids(&bench), [sets[0].id.clone(), sets[1].id.clone()]); // an exercise's sets keep their order
        assert_eq!(core.day("2026-11-13".into()).unwrap().sets, vec![other_day.clone()]); // other days untouched

        // Fly + pushdown a second one; then the second unit moves up past the first.
        core.group_exercises(d.into(), vec![fly.id.clone(), push.id.clone()]).unwrap();
        assert_ne!(group(&fly), group(&bench));
        core.move_exercise(d.into(), push.id.clone(), -1).unwrap();
        assert_eq!(exercise_order(&core, d), [&fly, &push, &bench, &curl].map(|e| e.id.clone()));
        core.move_exercise(d.into(), push.id.clone(), -1).unwrap(); // already first: nothing changes
        assert_eq!(exercise_order(&core, d), [&fly, &push, &bench, &curl].map(|e| e.id.clone()));
        core.move_exercise(d.into(), bench.id.clone(), 1).unwrap(); // already last
        assert_eq!(exercise_order(&core, d)[0], fly.id);

        // Joining another group takes the exercise out of its old one, which dissolves with one member left.
        core.group_exercises(d.into(), vec![fly.id.clone(), curl.id.clone()]).unwrap();
        assert!(group(&fly).is_some() && group(&fly) == group(&curl));
        assert!(group(&push).is_none() && group(&bench).is_none());

        // Taking one of two out dissolves the group; taking an ungrouped one is a no-op.
        core.ungroup_exercise(d.into(), curl.id.clone()).unwrap();
        assert!(group(&fly).is_none() && group(&curl).is_none());
        core.ungroup_exercise(d.into(), curl.id.clone()).unwrap();
        core.group_exercises(d.into(), vec![bench.id.clone()]).unwrap(); // fewer than 2: nothing
        assert!(group(&bench).is_none());
        // Three in a group: one leaves, the other two stay together.
        core.group_exercises(d.into(), vec![fly.id.clone(), push.id.clone(), bench.id.clone()]).unwrap();
        core.ungroup_exercise(d.into(), push.id.clone()).unwrap();
        assert!(group(&push).is_none() && group(&fly).is_some() && group(&fly) == group(&bench));
        // Records still right after the rewrites (order within each exercise is unchanged).
        assert_eq!(core.day(d.into()).unwrap().sets.len(), 6);
    }

    #[test]
    fn delete_workout_and_undo_keep_records_and_comment() {
        let core = IronCore::in_memory().unwrap();
        let bench = exercise(&core, "Flat Barbell Bench Press");
        let a = logged(&bench, "2026-11-12", 100.0, 5.0);
        let b = logged(&bench, "2026-11-12", 110.0, 5.0);
        let keep = logged(&bench, "2026-11-13", 60.0, 5.0);
        core.put_sets(vec![a.clone(), b.clone(), keep.clone()]).unwrap();
        core.put_comment("2026-11-12".into(), "Felt good".into()).unwrap();
        assert_eq!(core.exercise_log(bench.id.clone(), "2026-11-13".into()).unwrap().records, [b.id.clone()]);

        let gone = core.delete_workout("2026-11-12".into()).unwrap();
        assert_eq!(gone.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), [a.id.as_str(), b.id.as_str()]);
        let day = core.day("2026-11-12".into()).unwrap();
        assert!(day.sets.is_empty() && day.comment.is_none());
        assert_eq!(core.exercise_log(bench.id.clone(), "2026-11-13".into()).unwrap().records, [keep.id.clone()]); // cache followed
        assert_eq!(core.day("2026-11-13".into()).unwrap().sets.len(), 1);

        core.put_sets(gone).unwrap(); // undo
        let day = core.day("2026-11-12".into()).unwrap();
        assert_eq!(day.sets.len(), 2);
        assert_eq!(day.comment.as_deref(), Some("Felt good"));
        assert_eq!(core.exercise_log(bench.id.clone(), "2026-11-13".into()).unwrap().records, [b.id.clone()]);
        assert!(core.delete_workout("2030-01-01".into()).unwrap().is_empty());
    }

    #[test]
    fn standard_routine_day_takes_the_open_weights_from_last_time() {
        let core = IronCore::in_memory().unwrap();
        let (bench, curl, fly) = (exercise(&core, "Flat Barbell Bench Press"), exercise(&core, "Barbell Curl"), exercise(&core, "Dumbbell Fly"));
        core.put_sets(vec![
            logged(&bench, "2026-11-01", 90.0, 8.0),
            logged(&bench, "2026-11-05", 100.0, 8.0),
            logged(&bench, "2026-11-05", 95.0, 7.0),
            WorkoutSet { planned: Some(true), ..logged(&bench, "2026-11-10", 200.0, 1.0) }, // a planned set isn't "last time"
        ])
        .unwrap();
        let mut bench_item = item(&bench, 3);
        bench_item.sets[0].reps = Some(10.0);
        let r = routine_of(&core, vec![("Push", vec![bench_item, item(&fly, 2), item(&curl, 1)])]);
        core.delete_exercise(curl.id.clone()).unwrap(); // gone from the library: left out
        core.log_routine_day(r.id.clone(), r.days[0].id.clone(), "2026-11-12".into()).unwrap();
        // Set by set from last time's sets; the extra set from its last one; the plan's reps win.
        assert_eq!(plan_of(&core, "2026-11-12", &bench), [(Some(100.0), Some(10.0)), (Some(95.0), Some(7.0)), (Some(95.0), Some(7.0))]);
        assert_eq!(plan_of(&core, "2026-11-12", &fly), [(None, None), (None, None)]);
        let day = core.day("2026-11-12".into()).unwrap();
        assert_eq!(day.sets.len(), 5);
        assert!(day.sets.iter().all(|s| s.planned == Some(true) && s.done == Some(false) && s.group.is_none()));
        assert!(day.records.is_empty()); // planned sets are no records
        // Logging it again adds the sets after the first ones; unknown ids do nothing.
        core.log_routine_day(r.id.clone(), r.days[0].id.clone(), "2026-11-12".into()).unwrap();
        assert_eq!(core.day("2026-11-12".into()).unwrap().sets.len(), 10);
        core.log_routine_day(r.id.clone(), "nope".into(), "2026-11-12".into()).unwrap();
        core.log_routine_day("nope".into(), r.days[0].id.clone(), "2026-11-12".into()).unwrap();
        assert_eq!(core.day("2026-11-12".into()).unwrap().sets.len(), 10);
    }

    #[test]
    fn routine_day_sets_join_the_days_supersets_and_planned_ones_make_new_groups() {
        let core = IronCore::in_memory().unwrap();
        let (bench, fly, curl, push) = (exercise(&core, "Flat Barbell Bench Press"), exercise(&core, "Dumbbell Fly"), exercise(&core, "Barbell Curl"), exercise(&core, "Cable Pushdown"));
        let d = "2026-11-12";
        core.put_sets(vec![WorkoutSet { group: Some("g1".into()), ..logged(&bench, d, 100.0, 8.0) }, WorkoutSet { group: Some("g1".into()), ..logged(&fly, d, 20.0, 12.0) }]).unwrap();
        let mut curl_item = item(&curl, 2);
        let mut push_item = item(&push, 2);
        curl_item.group = Some("a".into());
        push_item.group = Some("a".into());
        let r = routine_of(&core, vec![("Arms", vec![item(&bench, 1), item(&fly, 1), curl_item, push_item])]);
        core.log_routine_day(r.id.clone(), r.days[0].id.clone(), d.into()).unwrap();
        let sets = core.day(d.into()).unwrap().sets;
        let group_of = |ex: &Exercise| sets.iter().filter(|s| s.exercise_id == ex.id && s.planned == Some(true)).map(|s| s.group.clone()).collect::<Vec<_>>();
        assert_eq!(group_of(&bench), [Some("g1".to_string())]);
        assert_eq!(group_of(&fly), [Some("g1".to_string())]);
        let new = group_of(&curl);
        assert!(new[0].is_some() && new[0] != Some("a".to_string()) && new == [new[0].clone(), new[0].clone()] && group_of(&push)[0] == new[0]);
        core.log_routine_day(r.id.clone(), r.days[0].id.clone(), "2026-11-14".into()).unwrap();
        let second = core.day("2026-11-14".into()).unwrap().sets;
        assert_ne!(second.iter().find(|s| s.exercise_id == curl.id).unwrap().group, new[0]); // a second logging, a second superset
    }

    #[test]
    fn dorian_routine_day_progresses_from_the_last_normal_session() {
        let core = IronCore::in_memory().unwrap();
        mode(&core, |st| st.mode = TrainingMode::Dorian);
        let bench = exercise(&core, "Flat Barbell Bench Press");
        core.put_sets(vec![
            logged(&bench, "2026-11-05", 100.0, 12.0), // reached the top: one step up, reps open
            logged(&bench, "2026-11-05", 100.0, 10.0), // one more rep to beat
            WorkoutSet { deload: Some(true), ..logged(&bench, "2026-11-09", 90.0, 10.0) }, // a lighter week's: never a base
        ])
        .unwrap();
        let r = routine_of(&core, vec![("Chest", vec![item(&bench, 2)])]);
        let day_id = r.days[0].id.clone();
        core.log_routine_day(r.id.clone(), day_id.clone(), "2026-11-12".into()).unwrap();
        assert_eq!(plan_of(&core, "2026-11-12", &bench), [(Some(102.5), None), (Some(100.0), Some(11.0))]);
        // A step of 1 kg, and rounding to plates (barbell lift): 101 rounds up to a loadable weight.
        let mut ex = bench.clone();
        ex.increment = Some(1.0);
        core.put_exercise(ex).unwrap();
        mode(&core, |st| st.round_plates = Some(true));
        let snapped = tools::snapper_for(Some(&bench), st_unit(&core), None, true).snap(101.0, true);
        assert!(snapped > 101.0);
        core.log_routine_day(r.id.clone(), day_id.clone(), "2026-11-13".into()).unwrap();
        assert_eq!(plan_of(&core, "2026-11-13", &bench)[0], (Some(snapped), None));
        // In a lighter week: ~10 % lighter at last time's reps (a base from before: this week's own is never used).
        mode(&core, |st| st.light = Some(LightSettings { start: "2026-11-16".into() }));
        core.log_routine_day(r.id.clone(), day_id, "2026-11-17".into()).unwrap();
        // Last normal session is the 2026-11-13 plan? No: planned sets aren't done; it is still 2026-11-05.
        let light = plan_of(&core, "2026-11-17", &bench);
        assert_eq!(light, [(Some(snapped_down(90.0, 1.0, &core)), Some(12.0)), (Some(snapped_down(90.0, 1.0, &core)), Some(10.0))]);
    }

    fn st_unit(core: &IronCore) -> crate::units::WeightUnit {
        core.settings().unwrap().unit
    }
    /// A lighter-week weight of 100 kg at a step, then rounded to plates like the app does (100 → 90).
    fn snapped_down(w: f64, _step: f64, core: &IronCore) -> f64 {
        let bench = exercise(core, "Flat Barbell Bench Press");
        tools::snapper_for(Some(&bench), st_unit(core), None, true).snap(w, false)
    }

    #[test]
    fn lyle_routine_day_pushes_and_runs_up() {
        let core = IronCore::in_memory().unwrap();
        mode(&core, |st| st.mode = TrainingMode::Lyle);
        let bench = exercise(&core, "Flat Barbell Bench Press");
        core.put_sets(vec![
            WorkoutSet { warmup: Some(true), ..logged(&bench, "2026-11-05", 40.0, 10.0) },
            WorkoutSet { rir: Some(2.0), ..logged(&bench, "2026-11-05", 80.0, 12.0) }, // top of 8–12 with reps to spare
            logged(&bench, "2026-11-05", 80.0, 9.0),
            logged(&bench, "2026-10-01", 85.0, 8.0),
        ])
        .unwrap();
        let r = routine_of(&core, vec![("Upper", vec![item(&bench, 3)])]);
        let day_id = r.days[0].id.clone();
        // No cycle: push rules. Weight up one step, back to the bottom of the range, for every set.
        core.log_routine_day(r.id.clone(), day_id.clone(), "2026-11-12".into()).unwrap();
        assert_eq!(plan_of(&core, "2026-11-12", &bench), [(Some(82.5), Some(8.0)); 3]);
        // Run-up week 1 of a cycle started 2026-11-09: 82.5 % of the best weight for 8+ reps before the
        // cycle (85), rounded down to the 2.5 step, at the top of the range.
        mode(&core, |st| st.cycle = Some(CycleSettings { start: "2026-11-09".into(), weeks: 6.0 }));
        core.log_routine_day(r.id.clone(), day_id.clone(), "2026-11-13".into()).unwrap();
        assert_eq!(plan_of(&core, "2026-11-13", &bench), [(Some(70.0), Some(12.0)); 3]);
        // Week 3 is a push week again.
        core.log_routine_day(r.id.clone(), day_id, "2026-11-24".into()).unwrap();
        assert_eq!(plan_of(&core, "2026-11-24", &bench)[0], (Some(82.5), Some(8.0)));
    }

    #[test]
    fn running_the_programs_day_moves_the_program_on() {
        let core = IronCore::in_memory().unwrap();
        let (bench, curl) = (exercise(&core, "Flat Barbell Bench Press"), exercise(&core, "Barbell Curl"));
        let r = routine_of(&core, vec![("A", vec![item(&bench, 1)]), ("B", vec![item(&curl, 1)]), ("C", vec![item(&bench, 1)])]);
        let other = routine_of(&core, vec![("X", vec![item(&curl, 1)])]);
        assert!(core.next_program_day("2026-11-12".into()).unwrap().is_none()); // no program
        mode(&core, |st| st.program = Some(ProgramSettings { routine_id: r.id.clone(), last_day_id: None, weekdays: Some(vec![1, 3]) }));
        assert_eq!(core.next_program_day("2026-11-12".into()).unwrap().unwrap().name, "A");
        core.log_routine_day(r.id.clone(), r.days[1].id.clone(), "2026-11-12".into()).unwrap();
        let p = core.settings().unwrap().program.unwrap();
        assert_eq!((p.last_day_id.as_deref(), p.weekdays), (Some(r.days[1].id.as_str()), Some(vec![1, 3])));
        assert_eq!(core.next_program_day("2026-11-13".into()).unwrap().unwrap().name, "C");
        core.log_routine_day(r.id.clone(), r.days[2].id.clone(), "2026-11-13".into()).unwrap();
        assert_eq!(core.next_program_day("2026-11-14".into()).unwrap().unwrap().name, "A"); // wraps
        // A day of another routine doesn't move it.
        core.log_routine_day(other.id.clone(), other.days[0].id.clone(), "2026-11-14".into()).unwrap();
        assert_eq!(core.settings().unwrap().program.unwrap().last_day_id.as_deref(), Some(r.days[2].id.as_str()));
    }

    #[test]
    fn save_workout_makes_a_routine_or_adds_a_day() {
        let core = IronCore::in_memory().unwrap();
        let (bench, fly, run) = (exercise(&core, "Flat Barbell Bench Press"), exercise(&core, "Dumbbell Fly"), exercise(&core, "Running"));
        let d = "2026-11-12";
        let grouped = |s: WorkoutSet| WorkoutSet { group: Some("g".into()), ..s };
        core.put_sets(vec![
            grouped(logged(&bench, d, 100.0, 8.0)),
            grouped(logged(&fly, d, 20.0, 12.0)),
            grouped(logged(&bench, d, 100.0, 7.0)),
            WorkoutSet { exercise_id: run.id.clone(), weight: None, reps: None, distance: Some(5.0), time: Some(1500.0), ..logged(&bench, d, 0.0, 0.0) },
        ])
        .unwrap();
        // A blank name or an empty day saves nothing.
        assert!(core.save_workout(d.into(), "  ".into(), None, "My workouts".into()).unwrap().id.is_empty());
        assert!(core.save_workout("2030-01-01".into(), "Empty".into(), None, "My workouts".into()).unwrap().id.is_empty());
        assert!(core.routines().unwrap().is_empty());

        let first = core.save_workout(d.into(), " Push ".into(), None, "My workouts".into()).unwrap();
        assert_eq!((first.name.as_str(), first.order, first.days.len()), ("My workouts", 0.0, 1)); // the new folder
        let day = &first.days[0];
        assert_eq!(day.name, "Push");
        assert_eq!(day.items.iter().map(|i| (i.exercise_id.clone(), i.sets.len(), i.group.is_some())).collect::<Vec<_>>(), [(bench.id.clone(), 2, true), (fly.id.clone(), 1, true), (run.id.clone(), 1, false)]);
        assert_eq!(day.items[0].sets[0], PlannedSet { reps: Some(8.0), ..Default::default() }); // no weights
        assert_eq!(day.items[2].sets[0], PlannedSet { distance: Some(5.0), time: Some(1500.0), ..Default::default() });
        assert_eq!(core.routines().unwrap(), vec![first.clone()]);

        let again = core.save_workout(d.into(), "Push B".into(), Some(first.id.clone()), "unused".into()).unwrap();
        assert_eq!((again.id.as_str(), again.days.len(), again.days[1].name.as_str()), (first.id.as_str(), 2, "Push B"));
        assert_eq!(core.routines().unwrap().len(), 1);
        let other = core.save_workout(d.into(), "Solo".into(), None, "My workouts".into()).unwrap();
        assert_eq!(other.order, 1.0); // after the others
        // The saved workout logs again with last time's weights.
        core.log_routine_day(first.id.clone(), first.days[0].id.clone(), "2026-11-14".into()).unwrap();
        assert_eq!(plan_of(&core, "2026-11-14", &bench), [(Some(100.0), Some(8.0)), (Some(100.0), Some(7.0))]);
        assert!(core.day("2026-11-14".into()).unwrap().sets.iter().filter(|s| s.group.is_some()).count() >= 3);
    }

    #[test]
    fn programs_start_with_their_mode_schedule_and_cycle() {
        let core = IronCore::in_memory().unwrap();
        let templates = core.program_templates();
        assert_eq!(templates.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["dorian4", "lyleGbr"]);
        assert_eq!(templates[1].day_names, ["Lower", "Upper"]);
        assert_eq!((templates[0].mode, templates[0].weekdays.clone()), (TrainingMode::Dorian, vec![1, 2, 4, 5]));

        core.put_routine(Routine { id: "old".into(), name: "Old".into(), order: 4.0, days: vec![] }).unwrap();
        core.delete_exercise(exercise(&core, "Leg Press").id).unwrap();
        let built = core.start_program_on("lyleGbr", "Lyle GBR", "2026-11-12").unwrap();
        assert_eq!(built.missing, ["Leg Press"]);
        assert_eq!((built.routine.name.as_str(), built.routine.order, built.routine.days.len()), ("Lyle GBR", 1.0, 2));
        assert_eq!(core.routines().unwrap().len(), 2);
        let st = core.settings().unwrap();
        assert_eq!(st.mode, TrainingMode::Lyle);
        assert_eq!(st.program, Some(ProgramSettings { routine_id: built.routine.id.clone(), last_day_id: None, weekdays: Some(vec![1, 2, 4, 5]) }));
        assert_eq!(st.cycle, Some(CycleSettings { start: "2026-11-12".into(), weeks: 6.0 }));
        // The main lifts got Lyle's 6–8 range; one that had its own range keeps it.
        let squat = exercise(&core, "Barbell Squat");
        assert_eq!((squat.rep_bottom, squat.rep_top), (Some(6.0), Some(8.0)));
        assert_eq!(core.next_program_day("2026-11-12".into()).unwrap().unwrap().name, "Lower");

        // A cycle that is running stays; Dorian leaves the cycle alone.
        let mut curl = exercise(&core, "Barbell Curl");
        assert_eq!((curl.rep_bottom, curl.rep_top), (Some(12.0), Some(15.0)));
        curl.rep_top = Some(10.0); // its own range: a later program leaves it be
        core.put_exercise(curl).unwrap();
        mode(&core, |st| st.cycle = Some(CycleSettings { start: "2026-11-02".into(), weeks: 8.0 }));
        core.start_program_on("lyleGbr", "Again", "2026-11-12").unwrap();
        assert_eq!(core.settings().unwrap().cycle, Some(CycleSettings { start: "2026-11-02".into(), weeks: 8.0 }));
        assert_eq!(exercise(&core, "Barbell Curl").rep_top, Some(10.0));
        mode(&core, |st| st.cycle = Some(CycleSettings { start: "2026-09-01".into(), weeks: 6.0 })); // over
        core.start_program_on("lyleGbr", "Third", "2026-11-12").unwrap();
        assert_eq!(core.settings().unwrap().cycle, Some(CycleSettings { start: "2026-11-12".into(), weeks: 6.0 }));
        core.start_program_on("dorian4", "Dorian", "2026-12-01").unwrap();
        let st = core.settings().unwrap();
        assert_eq!((st.mode, st.cycle.unwrap().start), (TrainingMode::Dorian, "2026-11-12".to_string()));
        assert!(core.start_program_on("nope", "x", "2026-11-12").is_err());
        assert_eq!(core.start_program("dorian4".into(), "Today".into(), "2026-11-12".into()).unwrap().routine.order, 5.0);
    }

    // ---- N6: the exercise guide ----

    fn guide(core: &IronCore, ex: &Exercise, date: &str) -> ExerciseGuide {
        core.exercise_guide(ex.id.clone(), date.into()).unwrap()
    }
    fn rir(mut s: WorkoutSet, rir: f64) -> WorkoutSet {
        s.rir = Some(rir);
        s
    }
    fn tg(g: &GuideTarget) -> (f64, Option<f64>, &str) {
        (g.weight, g.reps, g.why.as_str())
    }

    #[test]
    fn dorian_targets_progress_hold_and_adjust() {
        let core = IronCore::in_memory().unwrap();
        mode(&core, |st| st.mode = TrainingMode::Dorian);
        let curl = exercise(&core, "Dumbbell Curl");
        core.put_sets(vec![logged(&curl, "2026-11-09", 20.0, 10.0), logged(&curl, "2026-11-09", 20.0, 12.0)]).unwrap();
        // Progression: one more rep; the top reached goes up a step with no rep target.
        let g = guide(&core, &curl, "2026-11-12");
        assert_eq!(g.dorian_targets.iter().map(tg).collect::<Vec<_>>(), [(20.0, Some(11.0), "beat"), (22.5, None, "up")]);
        assert_eq!(g.dorian_targets[1].prev.as_ref().unwrap().reps, Some(12.0));
        assert_eq!((g.gap_days, g.long_gap, g.light), (3.0, false, false));
        assert!(g.lyle_target.is_none());
        // A lighter week: ~10 % less for the same reps, from the last normal session.
        mode(&core, |st| st.light = Some(LightSettings { start: "2026-11-10".into() }));
        let g = guide(&core, &curl, "2026-11-12");
        assert!(g.light);
        assert!(g.dorian_targets.iter().all(|t| t.why == "light" && t.weight < 20.0));
        assert_eq!(g.dorian_targets[0].reps, Some(10.0));
        assert!(!guide(&core, &curl, "2026-11-20").light);
        mode(&core, |st| st.light = None);
        // Joint pain: no weight increase.
        let mut sore = curl.clone();
        sore.joint = Some(true);
        core.put_exercise(sore).unwrap();
        let g = guide(&core, &curl, "2026-11-12");
        assert_eq!(g.dorian_targets.iter().map(tg).collect::<Vec<_>>(), [(20.0, Some(11.0), "beat"), (20.0, None, "joint")]);
        // After a long gap: the last weight, no rep target.
        let g = guide(&core, &curl, "2026-11-25");
        assert_eq!((g.gap_days, g.long_gap), (16.0, true));
        assert_eq!(g.dorian_targets.iter().map(tg).collect::<Vec<_>>(), [(20.0, None, "gap"), (20.0, None, "gap")]);
        // Other modes get none; an unknown exercise an empty guide.
        mode(&core, |st| st.mode = TrainingMode::Standard);
        assert!(guide(&core, &curl, "2026-11-12").dorian_targets.is_empty());
        assert!(core.exercise_guide("nope".into(), "2026-11-12".into()).unwrap().dorian_targets.is_empty());
    }

    #[test]
    fn dorian_targets_round_to_plates_and_up_never_back() {
        let core = IronCore::in_memory().unwrap();
        mode(&core, |st| {
            st.mode = TrainingMode::Dorian;
            st.round_plates = Some(true);
        });
        let mut bench = exercise(&core, "Flat Barbell Bench Press");
        bench.increment = Some(1.0);
        core.put_exercise(bench.clone()).unwrap();
        core.put_sets(vec![logged(&bench, "2026-11-09", 100.0, 12.0), logged(&bench, "2026-11-09", 100.0, 8.0)]).unwrap();
        let g = guide(&core, &bench, "2026-11-12");
        assert!(g.shows_plates);
        // 101 kg rounds up to the next loadable weight (102.5), not back to 100.
        assert_eq!(g.dorian_targets.iter().map(tg).collect::<Vec<_>>(), [(102.5, None, "up"), (100.0, Some(9.0), "beat")]);
    }

    #[test]
    fn lyle_target_run_up_push_gap_and_joint() {
        let core = IronCore::in_memory().unwrap();
        mode(&core, |st| st.mode = TrainingMode::Lyle);
        let curl = exercise(&core, "Dumbbell Curl"); // range 8-12
        // Run-up week 1: ~82.5 % of the best before the cycle, rounded down to the step.
        core.put_sets(vec![logged(&curl, "2026-10-26", 40.0, 10.0), logged(&curl, "2026-11-05", 33.0, 12.0)]).unwrap();
        mode(&core, |st| st.cycle = Some(CycleSettings { start: "2026-11-09".into(), weeks: 6.0 }));
        let g = guide(&core, &curl, "2026-11-12");
        let t = g.lyle_target.unwrap();
        assert_eq!((tg(&t), t.week), ((32.5, Some(12.0), "runup"), 1.0));
        assert!(g.dorian_targets.is_empty());
        // Week 2: ~92.5 %.
        mode(&core, |st| st.cycle = Some(CycleSettings { start: "2026-11-02".into(), weeks: 6.0 }));
        let t = guide(&core, &curl, "2026-11-12").lyle_target.unwrap();
        assert_eq!((tg(&t), t.week), ((35.0, Some(12.0), "runup"), 2.0));
        // Push (no cycle): the first set last time decides.
        mode(&core, |st| st.cycle = None);
        let first = |reps: f64, r: Option<f64>| WorkoutSet { rir: r, ..logged(&curl, "2026-11-09", 30.0, reps) };
        core.delete_sets(core.sets_of(curl.id.clone()).unwrap().into_iter().map(|s| s.id).collect()).unwrap();
        core.put_sets(vec![first(10.0, Some(1.0))]).unwrap();
        let t = guide(&core, &curl, "2026-11-12").lyle_target.unwrap();
        assert_eq!((tg(&t), t.week, t.prev.is_some()), ((30.0, Some(11.0), "reps"), 0.0, true));
        core.delete_sets(core.sets_of(curl.id.clone()).unwrap().into_iter().map(|s| s.id).collect()).unwrap();
        core.put_sets(vec![first(12.0, Some(2.0))]).unwrap();
        assert_eq!(tg(&guide(&core, &curl, "2026-11-12").lyle_target.unwrap()), (32.5, Some(8.0), "up"));
        // Joint pain: hold the weight at the top of the range.
        let mut sore = curl.clone();
        sore.joint = Some(true);
        core.put_exercise(sore).unwrap();
        assert_eq!(tg(&guide(&core, &curl, "2026-11-12").lyle_target.unwrap()), (30.0, Some(12.0), "joint"));
        // A long gap outside the run-up: a week-2 session (92.5 % of the best, 27.75 -> 27.5).
        assert_eq!(tg(&guide(&core, &curl, "2026-11-25").lyle_target.unwrap()), (27.5, Some(12.0), "gap"));
        // No history: no target.
        let row = exercise(&core, "Barbell Row");
        assert!(guide(&core, &row, "2026-11-12").lyle_target.is_none());
    }

    #[test]
    fn readiness_is_asked_before_a_muscles_first_set() {
        let core = IronCore::in_memory().unwrap();
        let bench = exercise(&core, "Flat Barbell Bench Press");
        let incline = exercise(&core, "Incline Barbell Bench Press");
        let curl = exercise(&core, "Dumbbell Curl");
        assert!(!guide(&core, &bench, "2026-11-12").ask_readiness); // Standard mode
        mode(&core, |st| st.mode = TrainingMode::Dorian);
        assert!(guide(&core, &bench, "2026-11-12").ask_readiness);
        // Another muscle's set doesn't matter; a planned one doesn't count.
        core.put_set(logged(&curl, "2026-11-12", 20.0, 10.0)).unwrap();
        core.put_set(WorkoutSet { planned: Some(true), ..logged(&incline, "2026-11-12", 60.0, 10.0) }).unwrap();
        assert!(guide(&core, &bench, "2026-11-12").ask_readiness);
        // Another chest exercise done today: already asked; so is the exercise's own set.
        core.put_set(logged(&incline, "2026-11-12", 60.0, 10.0)).unwrap();
        assert!(!guide(&core, &bench, "2026-11-12").ask_readiness);
        assert!(!guide(&core, &incline, "2026-11-12").ask_readiness);
        assert!(guide(&core, &bench, "2026-11-13").ask_readiness);
        mode(&core, |st| st.mode = TrainingMode::Lyle);
        assert!(guide(&core, &bench, "2026-11-13").ask_readiness);
    }

    #[test]
    fn too_soon_after_a_main_session() {
        let core = IronCore::in_memory().unwrap();
        mode(&core, |st| st.mode = TrainingMode::Dorian);
        let bench = exercise(&core, "Flat Barbell Bench Press");
        let incline = exercise(&core, "Incline Barbell Bench Press");
        let curl = exercise(&core, "Dumbbell Curl");
        // Two sets to failure of 8 = 16 effective reps (a main session is >= 10).
        core.put_sets(vec![rir(logged(&bench, "2026-11-10", 80.0, 8.0), 0.0), rir(logged(&bench, "2026-11-10", 80.0, 8.0), 0.0)]).unwrap();
        // A light day (3 effective reps) doesn't count.
        core.put_set(rir(logged(&curl, "2026-11-08", 15.0, 3.0), 0.0)).unwrap();
        let soon = |g: &ExerciseGuide| g.too_soon.iter().map(|t| (t.muscle, t.days)).collect::<Vec<_>>();
        assert_eq!(soon(&guide(&core, &incline, "2026-11-12")), [(crate::model::MuscleId::Chest, 2.0)]);
        assert!(soon(&guide(&core, &curl, "2026-11-12")).is_empty());
        assert!(soon(&guide(&core, &incline, "2026-11-15")).is_empty()); // 5 days: rested
        mode(&core, |st| st.mode = TrainingMode::Lyle);
        assert!(soon(&guide(&core, &incline, "2026-11-12")).is_empty()); // Dorian only
    }

    #[test]
    fn swap_day_is_the_next_workout_without_these_muscles() {
        let core = IronCore::in_memory().unwrap();
        let bench = exercise(&core, "Flat Barbell Bench Press");
        let incline = exercise(&core, "Incline Barbell Bench Press");
        let curl = exercise(&core, "Dumbbell Curl");
        let squat = exercise(&core, "Barbell Squat");
        let day = |id: &str, items: Vec<RoutineItem>| crate::model::RoutineDay { id: id.into(), name: id.into(), items };
        core.put_routine(Routine {
            id: "r".into(),
            name: "R".into(),
            order: 1.0,
            days: vec![day("push", vec![item(&bench, 3)]), day("chest2", vec![item(&incline, 3), item(&curl, 3)]), day("arms", vec![item(&curl, 3)]), day("legs", vec![item(&squat, 3)])],
        })
        .unwrap();
        mode(&core, |st| {
            st.mode = TrainingMode::Dorian;
            st.program = Some(ProgramSettings { routine_id: "r".into(), last_day_id: None, weekdays: None });
        });
        let swap = |c: &IronCore| guide(c, &bench, "2026-11-12").swap_day.map(|d| d.id);
        assert_eq!(swap(&core).as_deref(), Some("arms")); // push (next) and chest2 train chest
        mode(&core, |st| st.program.as_mut().unwrap().last_day_id = Some("push".into()));
        assert_eq!(swap(&core).as_deref(), Some("arms")); // starts at chest2, skips it
        mode(&core, |st| st.program.as_mut().unwrap().last_day_id = Some("arms".into()));
        assert_eq!(swap(&core).as_deref(), Some("legs"));
        mode(&core, |st| st.program.as_mut().unwrap().last_day_id = Some("legs".into()));
        assert_eq!(swap(&core).as_deref(), Some("arms")); // wraps: push, chest2 skipped
        mode(&core, |st| st.program.as_mut().unwrap().routine_id = "gone".into());
        assert_eq!(swap(&core), None);
        mode(&core, |st| st.program = None);
        assert_eq!(swap(&core), None);
        mode(&core, |st| {
            st.program = Some(ProgramSettings { routine_id: "r".into(), last_day_id: None, weekdays: None });
            st.mode = TrainingMode::Lyle;
        });
        assert_eq!(swap(&core), None); // Dorian only
    }

    #[test]
    fn effort_of_todays_sets() {
        let core = IronCore::in_memory().unwrap();
        mode(&core, |st| st.mode = TrainingMode::Dorian);
        let bench = exercise(&core, "Flat Barbell Bench Press");
        let a = rir(logged(&bench, "2026-11-12", 100.0, 8.0), 0.0);
        let b = logged(&bench, "2026-11-12", 95.0, 8.0); // no RIR: estimated from the best set
        let warm = WorkoutSet { warmup: Some(true), ..logged(&bench, "2026-11-12", 200.0, 1.0) }; // doesn't set the best
        let old = logged(&bench, "2026-11-05", 90.0, 8.0);
        core.put_sets(vec![old.clone(), warm.clone(), a.clone(), b.clone()]).unwrap();
        let g = guide(&core, &bench, "2026-11-12");
        let best = calc::one_rm(100.0, 8.0, calc::Formula::Epley);
        let want = crate::effective::set_effective(&b, best, calc::Formula::Epley);
        assert!(want.est && want.n > 0.0);
        let by_id = |id: &str| g.effort.iter().find(|e| e.set_id == id).map(|e| (e.n, e.est));
        assert_eq!(by_id(&a.id), Some((8.0, false)));
        assert_eq!(by_id(&b.id), Some((want.n, true)));
        assert_eq!(by_id(&warm.id), Some((0.0, false)));
        assert_eq!(by_id(&old.id), None);
        assert_eq!(g.effective_today, 8.0 + want.n);
        // Planned sets are no history.
        core.put_set(WorkoutSet { planned: Some(true), ..logged(&bench, "2026-11-12", 100.0, 8.0) }).unwrap();
        assert_eq!(guide(&core, &bench, "2026-11-12").effort.len(), 3);
    }

    #[test]
    fn warmups_snap_to_plates() {
        let core = IronCore::in_memory().unwrap();
        let mut bench = exercise(&core, "Flat Barbell Bench Press");
        bench.increment = Some(1.0);
        core.put_exercise(bench.clone()).unwrap();
        let w = |c: &IronCore, kg: f64| c.warmups_for(bench.id.clone(), kg).unwrap().into_iter().map(|h| (h.weight, h.reps)).collect::<Vec<_>>();
        assert_eq!(w(&core, 107.5), [(53.0, 10.0), (80.0, 6.0)]); // rounded down to the 1 kg step only
        mode(&core, |st| st.round_plates = Some(true));
        assert_eq!(w(&core, 107.5), [(52.5, 10.0), (80.0, 6.0)]); // 53 -> the nearest loadable weight
        assert!(w(&core, 0.0).is_empty());
        assert!(core.warmups_for("nope".into(), 100.0).unwrap().is_empty());
    }

    #[test]
    fn plates_hint_in_kg_and_lb() {
        let core = IronCore::in_memory().unwrap();
        let bench = exercise(&core, "Flat Barbell Bench Press");
        let curl = exercise(&core, "Dumbbell Curl");
        assert!(core.plates_for(bench.id.clone(), 100.0).unwrap().is_none()); // rounding off
        mode(&core, |st| st.round_plates = Some(true));
        let h = core.plates_for(bench.id.clone(), 100.0).unwrap().unwrap();
        assert_eq!((h.bar, h.per_side, h.exact), (20.0, vec![25.0, 15.0], true));
        let h = core.plates_for(bench.id.clone(), 101.0).unwrap().unwrap();
        assert_eq!((h.per_side, h.exact), (vec![25.0, 15.0], false));
        let h = core.plates_for(bench.id.clone(), 20.0).unwrap().unwrap();
        assert_eq!((h.per_side.is_empty(), h.exact), (true, true)); // the bar only
        assert!(core.plates_for(curl.id.clone(), 20.0).unwrap().is_none()); // not a bar lift
        // Pounds: the lb defaults (45 lb bar); the weight comes in kg.
        mode(&core, |st| st.unit = crate::units::WeightUnit::Lb);
        let h = core.plates_for(bench.id.clone(), units::w_from_user(100.0, crate::units::WeightUnit::Lb)).unwrap().unwrap();
        assert_eq!((h.bar, h.per_side, h.exact), (45.0, vec![25.0, 2.5], true));
        // The user's own plates, valid for their unit.
        mode(&core, |st| st.plates = Some(crate::model::PlatesSettings { unit: crate::units::WeightUnit::Lb, bar: 35.0, sizes: vec![45.0, 10.0] }));
        let h = core.plates_for(bench.id.clone(), units::w_from_user(125.0, crate::units::WeightUnit::Lb)).unwrap().unwrap();
        assert_eq!((h.bar, h.per_side, h.exact), (35.0, vec![45.0], true));
    }
}
