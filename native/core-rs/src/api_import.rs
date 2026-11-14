//! Imports and CSV export (IronCore methods): what Settings.tsx does for "Export CSV", "Import from
//! FitNotes (CSV)" and "Import from Iron Log". Each import has a `preview_*` (what the confirm dialog
//! shows, nothing written) and the import itself, which plans and writes in ONE transaction and then
//! drops the caches.

use std::collections::HashSet;

use crate::api::{next_order, CoreError, IronCore, R};
use crate::model::Diet;
use crate::{csv, ironlog, seed};

/// What importing a FitNotes CSV adds (the web's `ImportPlan`, counts only).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ImportReport {
    /// New sets. 0 = nothing to import.
    pub sets: u32,
    pub exercises: u32,
    pub categories: u32,
    /// Rows identical to a stored set.
    pub duplicates: u32,
    /// Rows that couldn't be read.
    pub skipped: u32,
    /// The first and last date among the new sets.
    pub first: Option<String>,
    pub last: Option<String>,
}

/// What an Iron Log backup holds and, after an import, what it added.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct IronLogReport {
    /// Days with body measurements in the file (0 = nothing to import).
    pub days: u32,
    pub first: Option<String>,
    pub last: Option<String>,
    /// Iron Log's energy target and the estimated maintenance (kcal), if the profile has them.
    pub kcal: Option<f64>,
    pub maintenance: Option<f64>,
    /// The diet phase they suggest (set by the import).
    pub phase: Option<Diet>,
    /// Import only: measurements written, those on days already there, and the measures that were missing.
    pub added: u32,
    pub skipped: u32,
    pub missing: Vec<String>,
}

fn invalid(msg: String) -> CoreError {
    CoreError::InvalidBackup { msg }
}

fn parse_iron_log(json: &str) -> R<ironlog::IronLogData> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|e| invalid(e.to_string()))?;
    ironlog::parse_iron_log(&v).map_err(invalid)
}

impl IronCore {
    /// The plan for a FitNotes CSV against what is stored. `lines` order keys are reserved for it.
    fn plan_fitnotes(&self, text: &str) -> R<csv::ImportPlan> {
        let (cats, exs, sets) = self.with(|s| Ok((s.categories()?, s.exercises()?, s.sets_between("0000-00-00", "9999-99-99")?)))?;
        // reserveOrders(lines): consecutive keys, one per line of the file.
        let lines = text.split('\n').count().max(1);
        let start = next_order();
        for _ in 1..lines {
            next_order();
        }
        csv::plan_import(text, &cats, &exs, &sets, start, &mut seed::uid).map_err(invalid)
    }
}

fn report(p: &csv::ImportPlan) -> ImportReport {
    ImportReport {
        sets: p.sets.len() as u32,
        exercises: p.exercises.len() as u32,
        categories: p.categories.len() as u32,
        duplicates: p.duplicates,
        skipped: p.skipped,
        first: p.first.clone(),
        last: p.last.clone(),
    }
}

#[uniffi::export]
impl IronCore {
    /// All done sets as a FitNotes-style CSV in the user's units (the file Settings → Export CSV saves).
    pub fn export_csv(&self) -> R<String> {
        self.with(|s| Ok(csv::to_csv(&s.sets_between("0000-00-00", "9999-99-99")?, &s.exercises()?, &s.categories()?, &s.settings()?)))
    }

    /// What a FitNotes CSV would add, for the confirm dialog; nothing is written. A file that isn't a
    /// FitNotes export is `InvalidBackup`.
    pub fn preview_fitnotes_csv(&self, text: String) -> R<ImportReport> {
        Ok(report(&self.plan_fitnotes(&text)?))
    }

    /// Imports a FitNotes CSV: new categories, exercises and sets in ONE transaction. Sets already
    /// stored are skipped. Returns what was added.
    pub fn import_fitnotes_csv(&self, text: String) -> R<ImportReport> {
        let plan = self.plan_fitnotes(&text)?;
        if !plan.sets.is_empty() {
            self.with(|s| s.import_rows(&plan.categories, &plan.exercises, &plan.sets, &[], None))?;
            self.forget_all();
        }
        Ok(report(&plan))
    }

    /// What an Iron Log backup holds, for the confirm dialog; nothing is written. A file that isn't an
    /// Iron Log backup is `InvalidBackup`.
    pub fn preview_iron_log(&self, json: String) -> R<IronLogReport> {
        let data = parse_iron_log(&json)?;
        let mut dates: Vec<&String> = data.body.iter().map(|r| &r.date).collect();
        dates.sort();
        Ok(IronLogReport {
            days: data.body.len() as u32,
            first: dates.first().map(|d| (*d).clone()),
            last: dates.last().map(|d| (*d).clone()),
            kcal: data.kcal,
            maintenance: data.maintenance,
            phase: ironlog::phase_of(data.kcal, data.maintenance),
            added: 0,
            skipped: 0,
            missing: Vec::new(),
        })
    }

    /// Imports an Iron Log backup: body weight, body fat and waist into the matching measures (days
    /// already there are skipped) and the diet phase its energy target suggests, in ONE transaction.
    pub fn import_iron_log(&self, json: String) -> R<IronLogReport> {
        let data = parse_iron_log(&json)?;
        let mut report = self.preview_iron_log(json)?;
        let phase = report.phase;
        let plan = self.with(|s| {
            let metrics = s.metrics()?;
            let mut dates = std::collections::HashMap::new();
            for m in &metrics {
                dates.insert(m.id.clone(), s.body_of(&m.id)?.into_iter().map(|e| e.date).collect::<HashSet<String>>());
            }
            let plan = ironlog::plan_body_import(&data, &metrics, &|id| dates.get(id).cloned().unwrap_or_default(), &mut seed::uid, &mut next_order);
            s.import_rows(&[], &[], &[], &plan.entries, phase)?;
            Ok(plan)
        })?;
        self.forget_all(); // body weights feed the records of body-weight exercises
        report.added = plan.entries.len() as u32;
        report.skipped = plan.skipped;
        report.missing = plan.missing;
        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CSV: &str = "\u{FEFF}Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment\r\n\
2026-11-02,Zercher Squat,Legs,100,kgs,5,,,,\"felt, heavy\"\r\n\
2026-11-02,Zercher Squat,Legs,100,kgs,5,,,,\r\n\
2026-11-03,Running,Cardio,,,,5,km,0:25:00,\r\n\
2026-11-03,=cmd,Odd,,,10,,,,\r\n\
not a date,Squat,Legs,1,kgs,1,,,,\r\n";

    #[test]
    fn imports_once_and_skips_what_is_there() {
        let core = IronCore::in_memory().unwrap();
        let p = core.preview_fitnotes_csv(CSV.into()).unwrap();
        assert_eq!((p.sets, p.exercises, p.categories, p.skipped), (4, 2, 1, 1));
        assert_eq!(core.sets_between("2026-11-01".into(), "2026-11-30".into()).unwrap().len(), 0, "preview writes nothing");
        let r = core.import_fitnotes_csv(CSV.into()).unwrap();
        assert_eq!(r, p);
        assert_eq!((r.first.as_deref(), r.last.as_deref()), (Some("2026-11-02"), Some("2026-11-03")));
        let lib = core.library().unwrap();
        let zs = lib.exercises.iter().find(|e| e.name == "Zercher Squat").unwrap();
        assert_eq!(lib.categories.iter().find(|c| c.id == zs.category_id).unwrap().name, "Legs");
        let run = lib.exercises.iter().find(|e| e.name == "Running").unwrap();
        assert_eq!(run.kind, crate::model::ExerciseType::DistanceTime);
        let days = core.sets_between("2026-11-02".into(), "2026-11-02".into()).unwrap();
        assert_eq!(days.len(), 2);
        assert_eq!(days[0].comment.as_deref(), Some("felt, heavy"));
        assert!(days[0].order < days[1].order);
        // Again: everything is a duplicate, nothing is added.
        let again = core.import_fitnotes_csv(CSV.into()).unwrap();
        assert_eq!((again.sets, again.duplicates, again.exercises), (0, 4, 0));
        assert_eq!(core.sets_between("2026-11-01".into(), "2026-11-30".into()).unwrap().len(), 4);
    }

    #[test]
    fn not_a_fitnotes_file_is_invalid_and_changes_nothing() {
        let core = IronCore::in_memory().unwrap();
        let before = core.library().unwrap();
        assert!(matches!(core.import_fitnotes_csv("a,b\n1,2".into()), Err(CoreError::InvalidBackup { .. })));
        assert!(matches!(core.import_fitnotes_csv("".into()), Err(CoreError::InvalidBackup { .. })));
        assert_eq!(core.library().unwrap().exercises.len(), before.exercises.len());
    }

    #[test]
    fn export_then_import_round_trips_in_the_users_units() {
        let a = IronCore::in_memory().unwrap();
        a.import_fitnotes_csv(CSV.into()).unwrap();
        let mut st = a.settings().unwrap();
        st.unit = crate::units::WeightUnit::Lb;
        a.put_settings(st).unwrap();
        let out = a.export_csv().unwrap();
        assert!(out.starts_with("Date,Exercise,Category,Weight,Weight Unit,Reps"));
        assert!(out.contains("220.462,lbs,5"), "{out}");
        assert!(out.contains("'=cmd,Odd"), "{out}");
        // A fresh core reads it back to the same kg (lbs → kg, rounded to grams).
        let b = IronCore::in_memory().unwrap();
        let r = b.import_fitnotes_csv(out).unwrap();
        assert_eq!(r.sets, 4);
        let sets = b.sets_between("2026-11-02".into(), "2026-11-02".into()).unwrap();
        assert_eq!(sets[0].weight, Some(100.0));
        assert!(b.library().unwrap().exercises.iter().any(|e| e.name == "=cmd"));
    }

    fn iron_log(extra: &str) -> String {
        format!(
            r#"{{"format":"iron-log-backup","version":1,"body":[{{"date":"2026-11-01","weightKg":82.4,"bodyFatPct":15,"waistCm":84}},{{"date":"2026-11-02","weightKg":82.1}},{{"date":"bad","weightKg":80}}],
"settings":{{"profile":{{"sex":"male","age":30,"weightKg":80,"heightCm":180,"kcal":2000,{extra}"pal":1.375}}}}}}"#
        )
    }

    #[test]
    fn iron_log_adds_measurements_once_and_sets_the_phase() {
        let core = IronCore::in_memory().unwrap();
        let p = core.preview_iron_log(iron_log("")).unwrap();
        assert_eq!((p.days, p.first.as_deref(), p.last.as_deref()), (2, Some("2026-11-01"), Some("2026-11-02")));
        assert_eq!(p.maintenance, Some(2448.0)); // (800 + 1125 - 150 + 5) × 1.375 = 2447.5, rounded up
        assert_eq!(p.phase, Some(Diet::Cut));
        assert_eq!(core.settings().unwrap().diet, None, "preview writes nothing");
        let r = core.import_iron_log(iron_log("")).unwrap();
        assert_eq!((r.added, r.skipped, r.missing.len()), (4, 0, 0));
        assert_eq!(core.settings().unwrap().diet, Some(Diet::Cut));
        let again = core.import_iron_log(iron_log("")).unwrap();
        assert_eq!((again.added, again.skipped), (0, 4));
        let weight = core.metrics().unwrap().into_iter().find(|m| m.name.to_lowercase() == "body weight").unwrap();
        assert_eq!(core.body_of(weight.id).unwrap().len(), 2);
    }

    #[test]
    fn garbage_is_not_an_iron_log_backup() {
        let core = IronCore::in_memory().unwrap();
        for bad in ["nope", "{}", r#"{"format":"iron-log-backup"}"#, "[]"] {
            assert!(matches!(core.import_iron_log(bad.into()), Err(CoreError::InvalidBackup { .. })), "{bad}");
        }
    }
}
