//! Load types — as src/lib/load.ts: what the weight typed for a set means, and read-only copies of
//! sets with the real load for calculations.

use crate::calc::js_max;
use crate::model::{Exercise, LoadType, WorkoutSet};
use serde::{Deserialize, Serialize};

pub const LOAD_TYPES: [LoadType; 4] = [LoadType::Total, LoadType::PerHand, LoadType::Bodyweight, LoadType::Assisted];

/// A body-metric entry (model.ts `BodyEntry`): one type, shared with the store and backups.
pub use crate::model::BodyMetricEntry as BodyEntry;

/// A read-only copy for calculations: `weight` is the real load, `vol` the weight that counts in volume.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct LoadedSet {
    #[serde(flatten)]
    pub set: WorkoutSet,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vol: Option<f64>,
}

pub fn load_of(ex: Option<&Exercise>) -> LoadType {
    ex.and_then(|e| e.load).unwrap_or(LoadType::Total)
}

/// Whether the load depends on body weight.
pub fn uses_body_weight(t: LoadType) -> bool {
    t == LoadType::Bodyweight || t == LoadType::Assisted
}

/// `bodyWeightAt(entries)`: body weight on a date — the latest entry on or before it, else the first
/// one after.
#[derive(Debug, Clone, Default)]
pub struct BodyWeights {
    sorted: Vec<BodyEntry>,
}

pub fn body_weight_at(entries: &[BodyEntry]) -> BodyWeights {
    let mut sorted: Vec<BodyEntry> = entries.iter().filter(|e| e.value > 0.0).cloned().collect();
    sorted.sort_by(|a, b| {
        if a.date < b.date {
            std::cmp::Ordering::Less
        } else if a.date > b.date {
            std::cmp::Ordering::Greater
        } else {
            (a.at - b.at).partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal)
        }
    });
    BodyWeights { sorted }
}

impl BodyWeights {
    pub fn at(&self, date: &str) -> Option<f64> {
        if self.sorted.is_empty() {
            return None;
        }
        let (mut lo, mut hi) = (0i64, self.sorted.len() as i64 - 1);
        let mut found = -1i64;
        while lo <= hi {
            let mid = (lo + hi) >> 1;
            if self.sorted[mid as usize].date.as_str() <= date {
                found = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        Some(self.sorted[if found >= 0 { found as usize } else { 0 }].value)
    }
}

/// The load the muscles moved, in kg: the entered weight for total and per hand; body weight plus the
/// added load; body weight minus the assistance. Unknown body weight: the added load only (body weight
/// + load) or nothing (assisted).
pub fn real_load(weight: Option<f64>, t: LoadType, bw: Option<f64>) -> Option<f64> {
    match t {
        LoadType::Bodyweight => Some(bw.unwrap_or(0.0) + weight.unwrap_or(0.0)),
        LoadType::Assisted => bw.map(|b| js_max(0.0, b - weight.unwrap_or(0.0))),
        _ => weight,
    }
}

/// The weight that counts in volume: both dumbbells, the added load only, none for an assisted machine.
pub fn volume_weight(weight: Option<f64>, t: LoadType) -> f64 {
    match t {
        LoadType::PerHand => 2.0 * weight.unwrap_or(0.0),
        LoadType::Assisted => 0.0,
        _ => weight.unwrap_or(0.0),
    }
}

/// Copies of `sets` with the real load and volume weight (total loads: plain copies, no `vol`).
pub fn with_real_load(sets: &[WorkoutSet], t: LoadType, bw_at: impl Fn(&str) -> Option<f64>) -> Vec<LoadedSet> {
    if t == LoadType::Total {
        return sets.iter().map(|s| LoadedSet { set: s.clone(), vol: None }).collect();
    }
    sets.iter()
        .map(|s| {
            let mut c = s.clone();
            c.weight = real_load(s.weight, t, bw_at(&s.date));
            LoadedSet { set: c, vol: Some(volume_weight(s.weight, t)) }
        })
        .collect()
}

/// Whether a body-weight load type is missing its body weight.
pub fn needs_body_weight(t: LoadType, bw_at: impl Fn(&str) -> Option<f64>, date: &str) -> bool {
    uses_body_weight(t) && bw_at(date).is_none()
}
