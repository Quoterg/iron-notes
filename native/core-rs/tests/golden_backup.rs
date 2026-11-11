//! Backup validation, muscle tables and starter data against the web app's answers
//! (tests/golden/{backup,muscles,seed}.json, written by src/lib/golden-backup.test.ts).

mod common;

use common::*;
use iron_core::backup::{clean_settings, validate_backup};
use iron_core::model::Muscles;
use iron_core::muscles::{default_muscles, normalize_muscles};
use iron_core::seed::{default_metrics, starter_library, COLORS, DEFAULT_LOADS};
use serde_json::{json, Value};

/// JSON equality with numbers compared as f64 (1 == 1.0) and objects needing exactly the same keys.
fn same(got: &Value, want: &Value) -> bool {
    match (got, want) {
        (Value::Number(g), Value::Number(w)) => {
            // serde_json without `float_roundtrip` can be 1 ulp off when parsing.
            let (g, w) = (g.as_f64().unwrap(), w.as_f64().unwrap());
            (g - w).abs() <= 4e-16 * w.abs()
        }
        (Value::Array(g), Value::Array(w)) => g.len() == w.len() && g.iter().zip(w).all(|(g, w)| same(g, w)),
        (Value::Object(g), Value::Object(w)) => g.len() == w.len() && w.iter().all(|(k, w)| g.get(k).is_some_and(|g| same(g, w))),
        (g, w) => g == w,
    }
}

fn check(got: &Value, c: &Value) {
    let short = |v: &Value| v.to_string().chars().take(600).collect::<String>();
    assert!(same(got, &c["out"]), "case {}\n got  {}\n want {}", short(c), short(got), short(&c["out"]));
}

#[test]
fn backup_and_settings() {
    let list = cases("backup");
    let (mut valid, mut invalid, mut settings) = (0, 0, 0);
    for c in &list {
        match c["fn"].as_str().unwrap() {
            "validateBackup" => {
                let got = match validate_backup(&c["in"]) {
                    Ok(b) => {
                        valid += 1;
                        serde_json::to_value(b).unwrap()
                    }
                    Err(e) => {
                        invalid += 1;
                        json!({ "error": e })
                    }
                };
                check(&got, c);
            }
            "cleanSettings" => {
                settings += 1;
                check(&serde_json::to_value(clean_settings(c.get("in"))).unwrap(), c);
            }
            f => panic!("unknown fn {f}"),
        }
    }
    assert!(valid > 50 && invalid > 200 && settings > 150, "{valid} {invalid} {settings}");
}

#[test]
fn muscles_and_tables() {
    for c in cases("muscles") {
        match c["fn"].as_str().unwrap() {
            "defaultMuscles" => check(&serde_json::to_value(default_muscles(c["name"].as_str().unwrap())).unwrap(), &c),
            "normalizeMuscles" => {
                let ms: Muscles = parse(&c, "in");
                check(&serde_json::to_value(normalize_muscles(&ms)).unwrap(), &c);
            }
            "defaultLoads" => {
                let want = c["out"].as_object().unwrap();
                assert_eq!(want.len(), DEFAULT_LOADS.len());
                for (name, load) in DEFAULT_LOADS {
                    assert_eq!(want[name], serde_json::to_value(load).unwrap(), "{name}");
                }
            }
            "colors" => assert_eq!(serde_json::to_value(COLORS).unwrap(), c["out"]),
            f => panic!("unknown fn {f}"),
        }
    }
}

#[test]
fn starter_data() {
    for c in cases("seed") {
        let mut n = 0;
        let mut next = || {
            n += 1;
            format!("id{}", n - 1)
        };
        let got = match c["fn"].as_str().unwrap() {
            "starterLibrary" => {
                let (categories, exercises) = starter_library(&mut next);
                json!({ "categories": categories, "exercises": exercises })
            }
            "defaultMetrics" => serde_json::to_value(default_metrics(&mut next)).unwrap(),
            f => panic!("unknown fn {f}"),
        };
        check(&got, &c);
    }
}
