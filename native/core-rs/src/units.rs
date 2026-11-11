//! Stored units (kg, km, s) ↔ what the user sees — as src/lib/units.ts. Convert only for display.

pub const KG_PER_LB: f64 = 0.45359237;
pub const KM_PER_MI: f64 = 1.609344;

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum WeightUnit {
    Kg,
    Lb,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum DistUnit {
    Km,
    Mi,
    M,
}

#[uniffi::export]
pub fn w_to_user(kg: f64, u: WeightUnit) -> f64 {
    match u {
        WeightUnit::Lb => kg / KG_PER_LB,
        WeightUnit::Kg => kg,
    }
}

#[uniffi::export]
pub fn w_from_user(v: f64, u: WeightUnit) -> f64 {
    match u {
        WeightUnit::Lb => v * KG_PER_LB,
        WeightUnit::Kg => v,
    }
}

#[uniffi::export]
pub fn d_to_user(km: f64, u: DistUnit) -> f64 {
    match u {
        DistUnit::Mi => km / KM_PER_MI,
        DistUnit::M => km * 1000.0,
        DistUnit::Km => km,
    }
}

#[uniffi::export]
pub fn d_from_user(v: f64, u: DistUnit) -> f64 {
    match u {
        DistUnit::Mi => v * KM_PER_MI,
        DistUnit::M => v / 1000.0,
        DistUnit::Km => v,
    }
}

/// Default weight step for the +/− buttons.
#[uniffi::export]
pub fn default_increment(u: WeightUnit) -> f64 {
    match u {
        WeightUnit::Lb => 5.0,
        WeightUnit::Kg => 2.5,
    }
}
