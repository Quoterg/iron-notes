//! The Rust core's exercise progress against the web app's answers (tests/golden/progress.json, written
//! by src/lib/golden-progress.test.ts).

mod common;

use common::{cases, close, parse, to_num};
use iron_core::calc::Formula;
use iron_core::load::LoadedSet;
use iron_core::model::*;
use iron_core::progress::*;
use serde_json::Value;

/// Structural equality; numbers within float noise; a fixture's "NaN" / "±Infinity" matches a serialized
/// non-finite number (null in JSON).
fn same(got: &Value, want: &Value, c: &Value) {
    match (got, want) {
        (Value::Number(g), Value::Number(w)) => close(g.as_f64().unwrap(), w.as_f64().unwrap(), c),
        (Value::Null, Value::String(s)) if s == "NaN" || s.ends_with("Infinity") => {}
        (Value::Array(g), Value::Array(w)) => {
            assert_eq!(g.len(), w.len(), "{c}: got {got}");
            for (a, b) in g.iter().zip(w) {
                same(a, b, c);
            }
        }
        (Value::Object(g), Value::Object(w)) => {
            assert_eq!(g.len(), w.len(), "{c}: got {got}");
            for (k, b) in w {
                same(g.get(k).unwrap_or_else(|| panic!("{c}: missing {k} in {got}")), b, c);
            }
        }
        _ => assert_eq!(got, want, "{c}"),
    }
}

fn v<T: serde::Serialize>(x: &T) -> Value {
    serde_json::to_value(x).unwrap()
}

fn formula(x: &Value) -> Formula {
    serde_json::from_value(x.clone()).unwrap()
}

#[test]
fn progress() {
    let mut count = 0;
    for c in cases("progress") {
        let want = &c["out"];
        match c["fn"].as_str().unwrap() {
            "metricsFor" => {
                same(&v(&metrics_for(parse(&c, "type"))), want, &c);
                count += 1;
            }
            "metricKind" => {
                same(&v(&metric_kind(parse(&c, "metric"))), want, &c);
                count += 1;
            }
            "dailySeries" => {
                let sets: Vec<LoadedSet> = parse(&c, "sets");
                for run in c["runs"].as_array().unwrap() {
                    let metric: Metric = parse(run, "metric");
                    let got = daily_series(&sets, metric, formula(&run["formula"]), run["since"].as_str().unwrap());
                    same(&v(&got), &run["out"], run);
                    count += 1;
                }
            }
            "rangeStart" => {
                assert_eq!(range_start(parse(&c, "range"), c["today"].as_str().unwrap()), want.as_str().unwrap(), "{c}");
                count += 1;
            }
            "repMaxTable" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                same(&v(&rep_max_table(&sets, c["maxReps"].as_u64().unwrap() as u32)), want, &c);
                count += 1;
            }
            "bestOrm" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                same(&v(&best_orm(&sets, formula(&c["formula"]))), want, &c);
                count += 1;
            }
            "bests" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                same(&v(&bests(&sets, parse(&c, "type"))), want, &c);
                count += 1;
            }
            "workouts" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                same(&v(&workouts(&sets)), want, &c);
                count += 1;
            }
            "niceScale" => {
                let got = nice_scale(to_num(&c["min"]), to_num(&c["max"]), c["timeSteps"].as_bool().unwrap());
                same(&v(&got), want, &c);
                count += 1;
            }
            other => panic!("unknown case {other}"),
        }
    }
    eprintln!("{count} progress cases");
}
