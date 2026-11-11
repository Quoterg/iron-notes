//! Web backup files through the SQLite store: every valid backup in the golden file (written by the web
//! app's src/lib/golden-backup.test.ts) is imported and exported again, and must come out exactly as the
//! web app's validation made it — numbers bit for bit (serde_json `float_roundtrip`).

mod common;

use common::cases;
use iron_core::api::IronCore;
use serde_json::Value;

#[test]
fn every_valid_web_backup_round_trips_through_the_store() {
    let mut n = 0;
    for c in cases("backup") {
        if c["fn"] != "validateBackup" || c["out"].get("error").is_some() {
            continue;
        }
        let core = IronCore::in_memory().unwrap();
        core.import_backup_json(c["in"].to_string()).unwrap_or_else(|e| panic!("{e}: {}", c["in"]));
        let mut out: Value = serde_json::from_str(&core.export_backup_json(c["out"]["exported"].as_str().unwrap().into()).unwrap()).unwrap();
        let want = &c["out"];
        // Same records in the same order, settings and all; numbers exact.
        out.as_object_mut().unwrap().retain(|k, _| want.get(k).is_some());
        assert_eq!(numbers_as_f64(out), numbers_as_f64(want.clone()), "round trip of {}", c["in"]);
        n += 1;
    }
    assert!(n >= 20, "only {n} valid backups in the fixtures");
}

/// Numbers by value (Rust writes 100 as `100.0`, JavaScript as `100`; both read back as the same f64).
fn numbers_as_f64(v: Value) -> Value {
    match v {
        Value::Number(n) => serde_json::json!(n.as_f64().unwrap()),
        Value::Array(a) => Value::Array(a.into_iter().map(numbers_as_f64).collect()),
        Value::Object(o) => Value::Object(o.into_iter().map(|(k, v)| (k, numbers_as_f64(v))).collect()),
        other => other,
    }
}

#[test]
fn awkward_floats_survive_exactly() {
    let weights: [f64; 7] = [82.4, 0.1 + 0.2, 1.0 / 3.0, 102.05, 1e-7, 123456.789012345, 2.5e-5];
    let sets: Vec<Value> = weights
        .iter()
        .enumerate()
        .map(|(i, w)| serde_json::json!({"id": format!("s{i}"), "date": "2026-11-12", "exerciseId": "e", "order": i as f64 + 0.1, "weight": w, "reps": 8}))
        .collect();
    let file = serde_json::json!({"app": "iron-notes", "version": 1, "exported": "", "categories": [], "exercises": [], "sets": sets});
    let core = IronCore::in_memory().unwrap();
    core.import_backup_json(file.to_string()).unwrap();
    let out: Value = serde_json::from_str(&core.export_backup_json(String::new()).unwrap()).unwrap();
    let got: Vec<f64> = out["sets"].as_array().unwrap().iter().map(|s| s["weight"].as_f64().unwrap()).collect();
    assert_eq!(got.iter().map(|x| x.to_bits()).collect::<Vec<_>>(), weights.iter().map(|x| x.to_bits()).collect::<Vec<_>>());
}
