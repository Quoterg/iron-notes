//! Settings helpers for the apps (UniFFI): the plate editor's limits are the core's (`tools::clean_plates`).

use crate::model::PlatesSettings;
use crate::tools::{clean_plates, default_plates};
use crate::units::WeightUnit;

/// The plate sizes a set would keep (deduped, largest first, within the limits), or None when the bar
/// or the sizes are unusable (as the web's `cleanPlates`).
#[uniffi::export]
pub fn clean_plate_sizes(bar: f64, sizes: Vec<f64>) -> Option<Vec<f64>> {
    clean_plates(bar, &sizes).map(|p| p.sizes)
}

/// The default bar and plates of a unit (`DEFAULT_PLATES`).
#[uniffi::export]
pub fn default_plate_set(unit: WeightUnit) -> PlatesSettings {
    let p = default_plates(unit);
    PlatesSettings { unit, bar: p.bar, sizes: p.sizes }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_like_the_web() {
        assert_eq!(clean_plate_sizes(20.0, vec![5.0, 25.0, 5.0, 0.1]), Some(vec![25.0, 5.0]));
        assert_eq!(clean_plate_sizes(-1.0, vec![5.0]), None);
        assert_eq!(clean_plate_sizes(20.0, vec![]), None);
        assert_eq!(default_plate_set(WeightUnit::Lb).bar, 45.0);
    }
}
