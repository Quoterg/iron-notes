//! The data the app stores — as src/lib/model.ts. Weights in kg, distances in km, times in seconds.
//! Serde names match the web app's JSON (backups, golden fixtures) exactly; UniFFI exposes the same
//! types to Kotlin/Swift.

use serde::{Deserialize, Serialize};

/// What a set of an exercise records, in display order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, uniffi::Enum)]
pub enum ExerciseType {
    #[serde(rename = "weight,reps")]
    WeightReps,
    #[serde(rename = "weight,distance")]
    WeightDistance,
    #[serde(rename = "weight,time")]
    WeightTime,
    #[serde(rename = "reps,distance")]
    RepsDistance,
    #[serde(rename = "reps,time")]
    RepsTime,
    #[serde(rename = "distance,time")]
    DistanceTime,
    #[serde(rename = "weight")]
    Weight,
    #[serde(rename = "reps")]
    Reps,
    #[serde(rename = "distance")]
    Distance,
    #[serde(rename = "time")]
    Time,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum Field {
    Weight,
    Reps,
    Distance,
    Time,
}

impl ExerciseType {
    /// `fieldsOf`: the fields a set of this type records, in display order.
    pub fn fields(self) -> &'static [Field] {
        use Field::*;
        match self {
            Self::WeightReps => &[Weight, Reps],
            Self::WeightDistance => &[Weight, Distance],
            Self::WeightTime => &[Weight, Time],
            Self::RepsDistance => &[Reps, Distance],
            Self::RepsTime => &[Reps, Time],
            Self::DistanceTime => &[Distance, Time],
            Self::Weight => &[Weight],
            Self::Reps => &[Reps],
            Self::Distance => &[Distance],
            Self::Time => &[Time],
        }
    }
}

/// Muscle groups (effective reps per muscle group). Order as `MuscleId` in model.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "camelCase")]
pub enum MuscleId {
    Chest,
    FrontDelts,
    SideDelts,
    RearDelts,
    Lats,
    Traps,
    LowerBack,
    Biceps,
    Triceps,
    Forearms,
    Quads,
    Hamstrings,
    Glutes,
    Calves,
    Abs,
}

/// The muscles an exercise trains: primary (the target) and secondary (helping).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
pub struct Muscles {
    pub primary: Vec<MuscleId>,
    pub secondary: Vec<MuscleId>,
}

/// What the entered weight means (lib/load.ts). Unset = total.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "camelCase")]
pub enum LoadType {
    #[default]
    Total,
    PerHand,
    Bodyweight,
    Assisted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum TrainingMode {
    #[default]
    Standard,
    Dorian,
    Lyle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum Diet {
    Build,
    Maintain,
    Cut,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct Exercise {
    pub id: String,
    pub name: String,
    pub category_id: String,
    #[serde(rename = "type")]
    pub kind: ExerciseType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    /// Weight step for the +/− buttons, in the user's weight unit. Default: 2.5 kg / 5 lb.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub increment: Option<f64>,
    /// Top of the rep range (Dorian: reach it, then the weight goes up). Default 12.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rep_top: Option<f64>,
    /// Bottom of the rep range (Lyle: reps to restart from after a weight increase). Default top − 4.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rep_bottom: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub joint: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub load: Option<LoadType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plates: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rest: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favorite: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub muscles: Option<Muscles>,
}

impl Default for ExerciseType {
    fn default() -> Self {
        Self::WeightReps
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct WorkoutSet {
    pub id: String,
    /// Local date, YYYY-MM-DD.
    pub date: String,
    pub exercise_id: String,
    /// Creation order (ms timestamp, made unique).
    pub order: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reps: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distance: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done: Option<bool>,
    /// Logged from a routine and not done yet: left out of records, history, graphs, "last time".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub planned: Option<bool>,
    /// Reps in reserve (0 = failure, 5 = 5+). Standard mode leaves it out.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rir: Option<f64>,
    /// Reps after failure: forced, rest-pause and drop-set reps.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub warmup: Option<bool>,
    /// Logged in a Dorian lighter week: not used for progression targets.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deload: Option<bool>,
    /// Readiness before the exercise's first set that day: 0 fresh, 1 a bit sore, 2 still sore.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sore: Option<f64>,
    /// When it was logged as done (ms).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<f64>,
}

impl WorkoutSet {
    /// A field's value (`set[k]` in TS).
    pub fn field(&self, f: Field) -> Option<f64> {
        match f {
            Field::Weight => self.weight,
            Field::Reps => self.reps,
            Field::Distance => self.distance,
            Field::Time => self.time,
        }
    }
    /// `!!s.planned` etc. — TS truthiness of the optional flags.
    pub fn is_planned(&self) -> bool {
        self.planned == Some(true)
    }
    pub fn is_warmup(&self) -> bool {
        self.warmup == Some(true)
    }
    pub fn is_deload(&self) -> bool {
        self.deload == Some(true)
    }
}

// ---- The rest of the stored data (N2): library, routines, body, comments, settings, backup ----

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
pub struct Category {
    pub id: String,
    pub name: String,
    /// #rrggbb
    pub color: String,
    pub order: f64,
    /// Default rest for its exercises, seconds (an exercise's own rest wins).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rest: Option<f64>,
}

/// A planned set of a routine (stored units; missing values are filled in when logging).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
pub struct PlannedSet {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reps: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distance: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct RoutineItem {
    pub exercise_id: String,
    pub sets: Vec<PlannedSet>,
    /// Items sharing this key are done as a superset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
pub struct RoutineDay {
    pub id: String,
    pub name: String,
    pub items: Vec<RoutineItem>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
pub struct Routine {
    pub id: String,
    pub name: String,
    pub order: f64,
    pub days: Vec<RoutineDay>,
}

/// What a body measure records, and so its unit: kg/lb, %, cm/in or a plain number.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum BodyKind {
    #[default]
    Weight,
    Percent,
    Length,
    Number,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
pub struct BodyMetric {
    pub id: String,
    pub name: String,
    pub kind: BodyKind,
    pub order: f64,
}

/// A body-measure entry (value in kg, %, cm or the plain number) — model.ts `BodyEntry`.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct BodyMetricEntry {
    pub id: String,
    pub metric_id: String,
    /// Local date, YYYY-MM-DD.
    pub date: String,
    pub value: f64,
    /// When it was entered (ms): of two entries on one date, the later counts.
    pub at: f64,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, uniffi::Record)]
pub struct DayComment {
    pub date: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct PlatesSettings {
    pub unit: crate::units::WeightUnit,
    pub bar: f64,
    pub sizes: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct CycleSettings {
    pub start: String,
    pub weeks: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
pub struct LightSettings {
    pub start: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct ProgramSettings {
    pub routine_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_day_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weekdays: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    En,
    Sv,
}

/// The user's settings — as model.ts `Settings` (`Settings::default()` = `DEFAULT_SETTINGS`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub mode: TrainingMode,
    pub unit: crate::units::WeightUnit,
    pub dist: crate::units::DistUnit,
    /// Default rest timer, seconds.
    pub rest: f64,
    pub auto_timer: bool,
    pub timer_sound: bool,
    pub mark_done: bool,
    pub formula: crate::calc::Formula,
    /// First day of the week: 0 Sunday, 1 Monday.
    pub week_start: u8,
    pub keep_screen_on: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plates: Option<PlatesSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cycle: Option<CycleSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub light: Option<LightSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub program: Option<ProgramSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diet: Option<Diet>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rest_notify: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub round_plates: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gym_english: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lang: Option<Lang>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            mode: TrainingMode::Standard,
            unit: crate::units::WeightUnit::Kg,
            dist: crate::units::DistUnit::Km,
            rest: 90.0,
            auto_timer: true,
            timer_sound: true,
            mark_done: false,
            formula: crate::calc::Formula::Epley,
            week_start: 1,
            keep_screen_on: false,
            plates: None,
            cycle: None,
            light: None,
            program: None,
            diet: None,
            rest_notify: None,
            round_plates: None,
            gym_english: None,
            lang: None,
        }
    }
}

/// A backup file — the web app's format (`app: "iron-notes"`, `version: 1`), read and written by both apps.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Backup {
    pub app: String,
    pub version: u32,
    pub exported: String,
    pub categories: Vec<Category>,
    pub exercises: Vec<Exercise>,
    pub sets: Vec<WorkoutSet>,
    pub comments: Vec<DayComment>,
    pub settings: Settings,
    pub routines: Vec<Routine>,
    pub metrics: Vec<BodyMetric>,
    pub body: Vec<BodyMetricEntry>,
}
