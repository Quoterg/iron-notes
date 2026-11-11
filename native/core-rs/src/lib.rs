//! Iron Notes core (docs/NATIVE.md): everything that isn't screen or OS — training logic now, storage
//! and backups next — shared by the Android app (Kotlin) and later the iPhone app (Swift) through
//! UniFFI. Each module mirrors one of the web app's `src/lib/*.ts`, checked against the same golden
//! fixtures (tests/golden/, generated from the TypeScript).

pub mod calc;
pub mod units;

uniffi::setup_scaffolding!();

/// The core's version, shown in the app to prove the bridge works.
#[uniffi::export]
pub fn core_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
