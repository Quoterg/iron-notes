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
