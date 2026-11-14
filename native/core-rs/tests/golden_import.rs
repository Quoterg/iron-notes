//! CSV export/import and the Iron Log bridge against the web app's answers (tests/golden/{csv,ironlog}.json,
//! written by src/lib/golden-import.test.ts).

mod common;

use common::*;
use iron_core::csv::{csv_escape, infer_type, parse_csv, plan_import, safe_text, to_csv};
use iron_core::ironlog::{maintenance_of, parse_iron_log, phase_of, plan_body_import, IronLogData};
use iron_core::model::{BodyMetric, Category, Exercise, Field, Settings, WorkoutSet};
use iron_core::units::{DistUnit, WeightUnit};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

/// JSON equality with numbers compared as f64 and objects needing exactly the same keys.
fn same(got: &Value, want: &Value) -> bool {
    match (got, want) {
        (Value::Number(g), Value::Number(w)) => {
            let (g, w) = (g.as_f64().unwrap(), w.as_f64().unwrap());
            (g - w).abs() <= 4e-16 * w.abs()
        }
        (Value::Array(g), Value::Array(w)) => g.len() == w.len() && g.iter().zip(w).all(|(g, w)| same(g, w)),
        (Value::Object(g), Value::Object(w)) => g.len() == w.len() && w.iter().all(|(k, w)| g.get(k).is_some_and(|g| same(g, w))),
        (g, w) => g == w,
    }
}

fn check(got: &Value, c: &Value) {
    let short = |v: &Value| v.to_string().chars().take(900).collect::<String>();
    assert!(same(got, &c["out"]), "case {}\n got  {}\n want {}", short(c), short(got), short(&c["out"]));
}

/// The ids planImport made, renamed by position as the TypeScript fixture does (c0.., e0.., s0..).
fn named(mut p: Value) -> Value {
    let mut cat = HashMap::new();
    let mut ex = HashMap::new();
    for (i, c) in p["categories"].as_array_mut().unwrap().iter_mut().enumerate() {
        cat.insert(c["id"].as_str().unwrap().to_string(), format!("c{i}"));
        c["id"] = json!(format!("c{i}"));
    }
    for (i, e) in p["exercises"].as_array_mut().unwrap().iter_mut().enumerate() {
        ex.insert(e["id"].as_str().unwrap().to_string(), format!("e{i}"));
        e["id"] = json!(format!("e{i}"));
        if let Some(n) = cat.get(e["categoryId"].as_str().unwrap()) {
            e["categoryId"] = json!(n);
        }
    }
    for (i, s) in p["sets"].as_array_mut().unwrap().iter_mut().enumerate() {
        s["id"] = json!(format!("s{i}"));
        if let Some(n) = ex.get(s["exerciseId"].as_str().unwrap()) {
            s["exerciseId"] = json!(n);
        }
    }
    p
}

#[test]
fn csv_cases() {
    let list = cases("csv");
    let mut seen: HashMap<String, u32> = HashMap::new();
    for c in &list {
        let f = c["fn"].as_str().unwrap();
        *seen.entry(f.to_string()).or_default() += 1;
        match f {
            "csvEscape" => check(&json!(csv_escape(c["in"].as_str().unwrap())), c),
            "safeText" => check(&json!(safe_text(c["in"].as_str().unwrap())), c),
            "parseCsv" => check(&json!(parse_csv(c["in"].as_str().unwrap())), c),
            "inferType" => {
                let set: HashSet<Field> = serde_json::from_value::<Vec<Field>>(c["in"].clone()).unwrap().into_iter().collect();
                check(&serde_json::to_value(infer_type(&set)).unwrap(), c);
            }
            "toCsv" => {
                let st = Settings { unit: parse::<WeightUnit>(&c["settings"], "unit"), dist: parse::<DistUnit>(&c["settings"], "dist"), ..Settings::default() };
                let (sets, exs, cats): (Vec<WorkoutSet>, Vec<Exercise>, Vec<Category>) = (parse(c, "sets"), parse(c, "exercises"), parse(c, "categories"));
                check(&json!(to_csv(&sets, &exs, &cats, &st)), c);
            }
            "planImport" => {
                let cur = &c["current"];
                let (cats, exs, sets): (Vec<Category>, Vec<Exercise>, Vec<WorkoutSet>) = (parse(cur, "categories"), parse(cur, "exercises"), parse(cur, "sets"));
                let mut n = 0;
                let mut id = || {
                    n += 1;
                    format!("id{n}")
                };
                let got = match plan_import(c["text"].as_str().unwrap(), &cats, &exs, &sets, num(c, "startOrder"), &mut id) {
                    Ok(p) => named(serde_json::to_value(p).unwrap()),
                    Err(e) => json!({ "error": e }),
                };
                check(&got, c);
            }
            f => panic!("unknown fn {f}"),
        }
    }
    let count = |k: &str| seen.get(k).copied().unwrap_or(0);
    assert!(count("csvEscape") >= 10 && count("safeText") >= 10 && count("parseCsv") >= 20 && count("inferType") == 16, "{seen:?}");
    assert!(count("toCsv") >= 5 && count("planImport") >= 30, "{seen:?}");
}

#[test]
fn ironlog_cases() {
    let list = cases("ironlog");
    let mut seen: HashMap<String, u32> = HashMap::new();
    for c in &list {
        let f = c["fn"].as_str().unwrap();
        *seen.entry(f.to_string()).or_default() += 1;
        match f {
            "maintenanceOf" => {
                let empty = Map::new();
                let got = maintenance_of(c["in"].as_object().unwrap_or(&empty));
                check(&got.map_or(Value::Null, |v| json!(v)), c);
            }
            "phaseOf" => {
                let got = phase_of(c["in"].get("kcal").and_then(Value::as_f64), c["in"].get("maintenance").and_then(Value::as_f64));
                check(&got.map_or(Value::Null, |d| serde_json::to_value(d).unwrap()), c);
            }
            "parseIronLog" => {
                let got = match parse_iron_log(&c["in"]) {
                    Ok(d) => serde_json::to_value(d).unwrap(),
                    Err(e) => json!({ "error": e }),
                };
                check(&got, c);
            }
            "planBodyImport" => {
                let data: IronLogData = parse(c, "data");
                let metrics: Vec<BodyMetric> = parse(c, "metrics");
                let existing: HashMap<String, Vec<String>> = parse(c, "existing");
                let (mut k, mut at) = (0, 0.0);
                let got = plan_body_import(
                    &data,
                    &metrics,
                    &|id| existing.get(id).map(|d| d.iter().cloned().collect()).unwrap_or_default(),
                    &mut || {
                        k += 1;
                        format!("i{}", k - 1)
                    },
                    &mut || {
                        at += 1.0;
                        999.0 + at
                    },
                );
                check(&serde_json::to_value(got).unwrap(), c);
            }
            f => panic!("unknown fn {f}"),
        }
    }
    let count = |k: &str| seen.get(k).copied().unwrap_or(0);
    assert!(count("maintenanceOf") >= 20 && count("phaseOf") >= 10 && count("parseIronLog") >= 25 && count("planBodyImport") >= 8, "{seen:?}");
}
