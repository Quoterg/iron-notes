//! Port of src/lib/backup.ts: the backup file's validation and settings cleaning (N2, in progress).

use crate::model::{Backup, Settings};
use serde_json::Value;

/// `validateBackup`: a parsed backup file checked row by row, cleaned (settings, muscles, orphan body
/// entries). Err with the web app's message on anything malformed: nothing is imported then.
pub fn validate_backup(_b: &Value) -> Result<Backup, String> {
    Err("not implemented yet".into())
}

/// `cleanSettings`: known keys with valid values only, the rest defaults.
pub fn clean_settings(_st: Option<&Value>) -> Settings {
    Settings::default()
}
