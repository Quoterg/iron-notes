//! Iron Notes core (docs/NATIVE.md): everything that isn't screen or OS — training logic now, storage
//! and backups next — shared by the Android app (Kotlin) and later the iPhone app (Swift) through
//! UniFFI. Each module mirrors one of the web app's `src/lib/*.ts`, checked against the same golden
//! fixtures (tests/golden/, generated from the TypeScript).

pub mod calc;
pub mod model;
pub mod units;

// Training logic (src/lib/effective.ts → targets.ts → lyle.ts → cycle.ts; volume.ts, muscles.ts)
pub mod cycle;
pub mod effective;
pub mod lyle;
pub mod muscles;
pub mod targets;
pub mod volume;

// Weights and records (calc.ts records, load.ts, tools.ts plates, feedback.ts)
pub mod feedback;
pub mod load;
pub mod records;
pub mod tools;

// Storage (N2): backup format and validation, starter data, the SQLite store
pub mod backup;
pub mod seed;
pub mod store;

uniffi::setup_scaffolding!();

/// The core's version, shown in the app to prove the bridge works.
#[uniffi::export]
pub fn core_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
