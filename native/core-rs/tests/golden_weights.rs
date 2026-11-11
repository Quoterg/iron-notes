//! The Rust core's records, load types, plates and feedback against the web app's answers
//! (tests/golden/{records,load,tools,feedback}.json, written by src/lib/golden-weights.test.ts).

mod common;

use common::{cases, close, num, parse, to_num};
use iron_core::calc::Formula;
use iron_core::feedback::*;
use iron_core::load::*;
use iron_core::model::*;
use iron_core::records::*;
use iron_core::tools::*;
use iron_core::units::WeightUnit;
use serde_json::{json, Value};

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

/// An optional fixture number (absent / null = None).
fn opt(c: &Value, k: &str) -> Option<f64> {
    match c.get(k) {
        None | Some(Value::Null) => None,
        Some(x) => Some(to_num(x)),
    }
}

fn nums(c: &Value, k: &str) -> Vec<f64> {
    c[k].as_array().unwrap().iter().map(to_num).collect()
}

fn formula(c: &Value) -> Formula {
    if c["formula"] == "brzycki" {
        Formula::Brzycki
    } else {
        Formula::Epley
    }
}

fn load_type(x: &Value) -> LoadType {
    serde_json::from_value(x.clone()).unwrap()
}

#[test]
fn records() {
    for c in cases("records") {
        let want = &c["out"];
        match c["fn"].as_str().unwrap() {
            "sortIds" => {
                let mut sets: Vec<WorkoutSet> = parse(&c, "sets");
                sets.sort_by(by_order);
                same(&v(&sets.iter().map(|s| s.id.clone()).collect::<Vec<_>>()), want, &c);
            }
            "recordIds" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                let kind: ExerciseType = parse(&c, "type");
                let sorted = c["sorted"].as_bool().unwrap();
                let got = if c.get("loadType").is_some() {
                    let bw: Vec<BodyEntry> = parse(&c, "bw");
                    let at = body_weight_at(&bw);
                    let real = with_real_load(&sets, load_type(&c["loadType"]), |d| at.at(d));
                    record_ids_loaded(&real, kind, sorted)
                } else {
                    record_ids(&sets, kind, sorted)
                };
                same(&v(&got), want, &c);
            }
            "previousWorkout" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                let got = previous_workout(&sets, c["date"].as_str().unwrap());
                same(&v(&got.iter().map(|s| s.id.clone()).collect::<Vec<_>>()), want, &c);
            }
            "isComplete" => {
                let s: WorkoutSet = parse(&c, "set");
                assert_eq!(is_complete(&s, parse(&c, "type")), want.as_bool().unwrap(), "{c}");
            }
            "dayTotals" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                let got = match c.get("loadType") {
                    None => day_totals_default(&sets),
                    Some(lt) => {
                        let t = load_type(lt);
                        day_totals(&sets, |s| volume_weight(s.weight, t))
                    }
                };
                same(&v(&got), want, &c);
            }
            other => panic!("unknown case {other}"),
        }
    }
}

#[test]
fn load() {
    for c in cases("load") {
        let want = &c["out"];
        match c["fn"].as_str().unwrap() {
            "bodyWeightAt" => {
                let entries: Vec<BodyEntry> = parse(&c, "entries");
                let at = body_weight_at(&entries);
                let got: Vec<Value> = c["dates"].as_array().unwrap().iter().map(|d| at.at(d.as_str().unwrap()).map_or(Value::Null, |x| json!(x))).collect();
                same(&Value::Array(got), want, &c);
            }
            "volumeWeight" => close(volume_weight(opt(&c, "weight"), load_type(&c["t"])), to_num(want), &c),
            "realLoad" => match real_load(opt(&c, "weight"), load_type(&c["t"]), opt(&c, "bw")) {
                None => assert!(want.is_null(), "{c}"),
                Some(x) => close(x, to_num(want), &c),
            },
            "usesBodyWeight" => assert_eq!(uses_body_weight(load_type(&c["t"])), want.as_bool().unwrap(), "{c}"),
            "loadOf" => {
                let ex = if c.get("noExercise").is_some() {
                    None
                } else {
                    Some(Exercise { load: c.get("load").map(load_type), ..Default::default() })
                };
                let t = load_of(ex.as_ref());
                // `undefined` load (key absent) means total
                same(&v(&t), &Value::String(want.as_str().unwrap().to_string()), &c);
            }
            "needsBodyWeight" => {
                let entries: Vec<BodyEntry> = parse(&c, "entries");
                let at = body_weight_at(&entries);
                assert_eq!(needs_body_weight(load_type(&c["t"]), |d| at.at(d), c["date"].as_str().unwrap()), want.as_bool().unwrap(), "{c}");
            }
            "withRealLoad" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                let entries: Vec<BodyEntry> = parse(&c, "bw");
                let at = body_weight_at(&entries);
                same(&v(&with_real_load(&sets, load_type(&c["t"]), |d| at.at(d))), want, &c);
            }
            other => panic!("unknown case {other}"),
        }
    }
}

fn unit(x: &Value) -> WeightUnit {
    if x == "lb" {
        WeightUnit::Lb
    } else {
        WeightUnit::Kg
    }
}

fn plates_setting(x: &Value) -> Option<PlatesSetting> {
    if x.is_null() {
        return None;
    }
    Some(PlatesSetting { unit: unit(&x["unit"]), bar: to_num(&x["bar"]), sizes: x["sizes"].as_array().unwrap().iter().map(to_num).collect() })
}

fn exercise(x: &Value) -> Exercise {
    Exercise {
        name: x["name"].as_str().unwrap().into(),
        kind: serde_json::from_value(x["type"].clone()).unwrap(),
        load: x.get("load").map(load_type),
        plates: x.get("plates").map(|p| p.as_bool().unwrap()),
        ..Default::default()
    }
}

#[test]
fn tools() {
    for c in cases("tools") {
        let want = &c["out"];
        match c["fn"].as_str().unwrap() {
            "weightForReps" => close(weight_for_reps(num(&c, "orm"), num(&c, "reps"), formula(&c)), to_num(want), &c),
            "percentTable" => same(&v(&percent_table(num(&c, "orm"), formula(&c))), want, &c),
            "estimate" => close(estimate(num(&c, "weight"), num(&c, "reps"), formula(&c)), to_num(want), &c),
            "platesPerSide" => same(&v(&plates_per_side(num(&c, "target"), num(&c, "bar"), &nums(&c, "sizes"))), want, &c),
            "snapToPlates" => close(snap_to_plates(num(&c, "target"), num(&c, "bar"), &nums(&c, "sizes"), c["up"].as_bool().unwrap()), to_num(want), &c),
            "warmup" => same(&v(&warmup(num(&c, "target"), num(&c, "bar"), &nums(&c, "sizes"))), want, &c),
            "loadStep" => close(load_step(&nums(&c, "sizes")), to_num(want), &c),
            "cleanPlates" => same(&v(&clean_plates(num(&c, "bar"), &nums(&c, "sizes"))), want, &c),
            "usesPlatesByName" => assert_eq!(uses_plates_by_name(c["name"].as_str().unwrap()), want.as_bool().unwrap(), "{c}"),
            "platesToStore" => {
                let choice = c.get("choice").map(|x| x.as_bool().unwrap());
                same(&v(&plates_to_store(choice, c["name"].as_str().unwrap())), want, &c);
            }
            "plateConfig" => {
                let p = plates_setting(c.get("plates").unwrap_or(&Value::Null));
                same(&v(&plate_config(unit(&c["unit"]), p.as_ref())), want, &c);
            }
            "roundsToPlates" => {
                let rp = c["st"].get("roundPlates").map_or(false, |x| x.as_bool().unwrap());
                let mut got: Vec<bool> = c["exs"].as_array().unwrap().iter().map(|e| rounds_to_plates(Some(&exercise(e)), rp)).collect();
                got.push(rounds_to_plates(None, rp));
                same(&v(&got), want, &c);
            }
            "snapperFor" => {
                let st = &c["st"];
                let ex = c.get("ex").map(exercise);
                let p = plates_setting(st.get("plates").unwrap_or(&Value::Null));
                let sn = snapper_for(ex.as_ref(), unit(&st["unit"]), p.as_ref(), st.get("roundPlates").map_or(false, |x| x.as_bool().unwrap()));
                let got: Vec<f64> = nums(&c, "kgs").iter().flat_map(|&k| [sn.snap(k, false), sn.snap(k, true)]).collect();
                same(&v(&got), want, &c);
            }
            other => panic!("unknown case {other}"),
        }
    }
}

#[test]
fn feedback() {
    for c in cases("feedback") {
        let want = &c["out"];
        match c["fn"].as_str().unwrap() {
            "daysBetween" => close(days_between(c["a"].as_str().unwrap(), c["b"].as_str().unwrap()), to_num(want), &c),
            "sessions" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                same(&v(&sessions(&sets, formula(&c), c["since"].as_str().unwrap())), want, &c);
            }
            "trendOf" => {
                let list: Vec<Session> = parse(&c, "list");
                same(&v(&trend_of(&list)), want, &c);
            }
            "causeOf" => same(&v(&cause_of(num(&c, "gapDays"), c["cutting"].as_bool().unwrap(), num(&c, "othersWeaker"))), want, &c),
            "longestGap" => {
                let list: Vec<Session> = parse(&c, "list");
                let n = c.get("n").map_or(3, |x| x.as_u64().unwrap() as usize);
                close(longest_gap(&list, n), to_num(want), &c);
            }
            "weeklyRate" => {
                let entries: Vec<BodyEntry> = parse(&c, "entries");
                let got = weekly_rate(&entries, c["today"].as_str().unwrap(), opt(&c, "days").unwrap_or(21.0));
                match (got, want) {
                    (None, Value::Null) => {}
                    (Some(g), w) if !w.is_null() => close(g, to_num(w), &c),
                    (g, w) => panic!("{c}: got {g:?}, want {w}"),
                }
            }
            "stalledAdvice" => {
                let got = stalled_advice(c["lyle"].as_bool().unwrap(), c["cutting"].as_bool().unwrap(), opt(&c, "lastSore"), num(&c, "spacing"));
                assert_eq!(got, want.as_str().unwrap(), "{c}");
            }
            "weakerAdvice" => {
                let cause: Cause = parse(&c, "cause");
                assert_eq!(weaker_advice(cause, c["lyle"].as_bool().unwrap()), want.as_str().unwrap(), "{c}");
            }
            "isCutting" => {
                let diet: Option<Diet> = c.get("diet").map(|d| serde_json::from_value(d.clone()).unwrap());
                assert_eq!(is_cutting(diet, opt(&c, "rate")), want.as_bool().unwrap(), "{c}");
            }
            other => panic!("unknown case {other}"),
        }
    }
}
