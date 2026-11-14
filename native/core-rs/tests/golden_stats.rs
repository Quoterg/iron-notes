//! The Rust core's statistics and cycle review against the web app's answers (tests/golden/analysis.json
//! and review.json, written by src/lib/golden-stats.test.ts).

mod common;

use common::{cases, close, parse};
use iron_core::analysis::*;
use iron_core::calc::Formula;
use iron_core::load::{body_weight_at, BodyEntry};
use iron_core::model::*;
use iron_core::review::*;
use serde_json::Value;
use std::collections::HashSet;

fn same(got: &Value, want: &Value, c: &Value) {
    match (got, want) {
        (Value::Number(g), Value::Number(w)) => close(g.as_f64().unwrap(), w.as_f64().unwrap(), c),
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
fn analysis() {
    let mut count = 0;
    for c in cases("analysis") {
        let want = &c["out"];
        match c["fn"].as_str().unwrap() {
            "periodStart" => {
                let p: StatsPeriod = parse(&c, "period");
                assert_eq!(period_start(p, c["today"].as_str().unwrap()), want.as_str().unwrap(), "{c}");
            }
            "weekOf" => {
                let got = week_of(c["date"].as_str().unwrap(), c["weekStart"].as_u64().unwrap() as u8);
                assert_eq!(got, want.as_str().unwrap(), "{c}");
            }
            "summarize" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                let exs: Vec<Exercise> = parse(&c, "exercises");
                let bw: Option<Vec<BodyEntry>> = parse(&c, "bw");
                let bws = bw.map(|e| body_weight_at(&e));
                let got = summarize(
                    &sets,
                    &|id: &str| exs.iter().find(|e| e.id == id).cloned(),
                    c["from"].as_str().unwrap(),
                    c["to"].as_str().unwrap(),
                    c["weekStart"].as_u64().unwrap() as u8,
                    formula(&c["formula"]),
                    &|d: &str| bws.as_ref().and_then(|b| b.at(d)),
                );
                same(&v(&got), want, &c);
            }
            other => panic!("unknown case {other}"),
        }
        count += 1;
    }
    eprintln!("{count} analysis cases");
}

#[test]
fn review() {
    let mut count = 0;
    for c in cases("review") {
        let want = &c["out"];
        match c["fn"].as_str().unwrap() {
            "reviewRange" => {
                let span = match &c["span"] {
                    Value::String(_) => ReviewSpan::Cycle,
                    n => ReviewSpan::Weeks { n: n.as_u64().unwrap() as u32 },
                };
                let cycle: Option<CycleSettings> = parse(&c, "cycle");
                let got = review_range(span, cycle.as_ref().map(|x| (x.start.as_str(), x.weeks)), c["today"].as_str().unwrap());
                same(&v(&got), want, &c);
            }
            "exerciseChanges" => {
                let by: Vec<(String, Vec<WorkoutSet>)> = parse(&c, "byExercise");
                let got = exercise_changes(&by, c["from"].as_str().unwrap(), c["to"].as_str().unwrap(), formula(&c["formula"]));
                same(&v(&got), want, &c);
            }
            "soreness" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                let exs: Vec<Exercise> = parse(&c, "exercises");
                let got = soreness(&sets, &|id: &str| exs.iter().find(|e| e.id == id).and_then(|e| e.muscles.clone()), c["from"].as_str().unwrap(), c["to"].as_str().unwrap());
                same(&v(&got), want, &c);
            }
            "toSwap" => {
                let change: ExerciseChange = parse(&c, "change");
                let ex: Option<Exercise> = parse(&c, "exercise");
                assert_eq!(to_swap(&change, ex.as_ref()), want.as_bool().unwrap(), "{c}");
            }
            "alternatives" => {
                let ex: Exercise = parse(&c, "exercise");
                let lib: Vec<Exercise> = parse(&c, "library");
                let exclude: HashSet<String> = parse::<Vec<String>>(&c, "exclude").into_iter().collect();
                let got = alternatives(&ex, &lib, &exclude, c["n"].as_u64().unwrap() as usize, &|e: &Exercise| e.name.clone());
                let ids: Vec<&str> = got.iter().map(|e| e.id.as_str()).collect();
                same(&v(&ids), want, &c);
            }
            "swapInRoutine" => {
                let r: Routine = parse(&c, "routine");
                let got = swap_in_routine(&r, c["from"].as_str().unwrap(), c["to"].as_str().unwrap());
                same(&v(&got), want, &c);
            }
            other => panic!("unknown case {other}"),
        }
        count += 1;
    }
    eprintln!("{count} review cases");
}
