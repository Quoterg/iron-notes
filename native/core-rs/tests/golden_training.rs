//! The Rust training logic against the web app's answers (tests/golden/{effective,targets,lyle,cycle,
//! volume}.json, written by src/lib/golden-training.test.ts).

mod common;

use common::{cases, close, num, parse, to_num};
use iron_core::calc::Formula;
use iron_core::cycle::*;
use iron_core::effective::*;
use iron_core::lyle::*;
use iron_core::model::{Muscles, WorkoutSet};
use iron_core::targets::*;
use iron_core::volume::*;
use serde_json::{json, Value};
use std::collections::HashMap;

/// Structures: strings, bools and keys exactly; numbers within floating-point noise. A non-finite
/// number is a string in the fixture and `null` in serde_json's output.
fn same(got: &Value, want: &Value, c: &Value) {
    match (got, want) {
        (Value::Number(g), Value::Number(w)) => close(g.as_f64().unwrap(), w.as_f64().unwrap(), c),
        (Value::Null, Value::String(s)) if s == "NaN" || s == "Infinity" || s == "-Infinity" => {}
        (Value::Array(g), Value::Array(w)) => {
            assert_eq!(g.len(), w.len(), "{c}: got {got}");
            g.iter().zip(w).for_each(|(g, w)| same(g, w, c));
        }
        (Value::Object(g), Value::Object(w)) => {
            assert_eq!(g.keys().collect::<Vec<_>>().len(), w.keys().count(), "{c}: got {got}");
            for (k, w) in w {
                same(g.get(k).unwrap_or_else(|| panic!("{c}: missing {k} in {got}")), w, c);
            }
        }
        (g, w) => assert_eq!(g, w, "{c}: got {got}"),
    }
}

fn check(got: impl serde::Serialize, c: &Value) {
    same(&serde_json::to_value(got).unwrap(), &c["out"], c);
}

fn datasets(all: &[Value]) -> HashMap<String, Vec<WorkoutSet>> {
    all.iter()
        .filter(|c| c["fn"] == "dataset")
        .map(|c| (c["name"].as_str().unwrap().to_string(), parse(c, "sets")))
        .collect()
}

fn opt_num(c: &Value, k: &str) -> Option<f64> {
    c.get(k).map(to_num)
}

fn opt_set(c: &Value, k: &str) -> Option<WorkoutSet> {
    c.get(k).map(|_| parse(c, k))
}

fn formula(c: &Value) -> Formula {
    if c["formula"] == "brzycki" {
        Formula::Brzycki
    } else {
        Formula::Epley
    }
}

/// The case's `muscles` lookup table and `eff` callback (as golden-training.test.ts builds them).
fn callbacks(c: &Value) -> (impl Fn(&str) -> Option<Muscles>, impl Fn(&WorkoutSet) -> f64) {
    let table: HashMap<String, Muscles> = parse(c, "muscles");
    let reps_mode = c["eff"] == "reps";
    let e1rm = num(c, "e1rm");
    (
        move |id: &str| table.get(id).cloned(),
        move |s: &WorkoutSet| {
            if reps_mode {
                if s.is_warmup() {
                    0.0
                } else {
                    s.reps.unwrap_or(0.0)
                }
            } else {
                set_effective(s, e1rm, Formula::Epley).n
            }
        },
    )
}

#[test]
fn effective() {
    for c in cases("effective") {
        match c["fn"].as_str().unwrap() {
            "window" => close(window(num(&c, "rm")), num(&c, "out"), &c),
            "effectiveReps" => close(effective_reps(num(&c, "reps"), num(&c, "rir"), opt_num(&c, "after").unwrap_or(0.0)), num(&c, "out"), &c),
            "estimateRir" => close(estimate_rir(num(&c, "weight"), num(&c, "reps"), num(&c, "e1rm"), formula(&c)), num(&c, "out"), &c),
            "setEffective" => check(set_effective(&parse::<WorkoutSet>(&c, "set"), num(&c, "e1rm"), formula(&c)), &c),
            "muscleTotals" => {
                let sets: Vec<(Option<Muscles>, f64)> = c["sets"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|s| (s.get("muscles").map(|_| parse(s, "muscles")), num(s, "effective")))
                    .collect();
                check(muscle_totals(sets), &c);
            }
            "isMainSession" => assert_eq!(is_main_session(num(&c, "direct"), num(&c, "goalMin")), c["out"].as_bool().unwrap(), "{c}"),
            other => panic!("unknown case {other}"),
        }
    }
}

#[test]
fn targets() {
    let all = cases("targets");
    let data = datasets(&all);
    for c in &all {
        match c["fn"].as_str().unwrap() {
            "dataset" => {}
            "dorianTarget" => check(dorian_target(&parse::<WorkoutSet>(c, "prev"), num(c, "step"), num(c, "top")), c),
            "dorianTargets" => check(dorian_targets(&parse::<Vec<WorkoutSet>>(c, "last"), num(c, "step"), num(c, "top")), c),
            "progressedSets" => check(progressed_sets(&parse::<Vec<WorkoutSet>>(c, "last"), num(c, "step"), num(c, "top")), c),
            "warmups" => check(warmups(num(c, "work"), num(c, "step")), c),
            "tooSoon" => {
                let (muscles_of, eff) = callbacks(c);
                let target: Option<Muscles> = c.get("target").map(|_| parse(c, "target"));
                let earlier = &data[c["data"].as_str().unwrap()];
                let got = match (opt_num(c, "restDays"), opt_num(c, "goal")) {
                    (Some(r), Some(g)) => too_soon(c["date"].as_str().unwrap(), target.as_ref(), earlier, muscles_of, eff, r, g),
                    _ => too_soon(c["date"].as_str().unwrap(), target.as_ref(), earlier, muscles_of, eff, DORIAN_REST_DAYS, DORIAN_GOAL),
                };
                check(got, c);
            }
            other => panic!("unknown case {other}"),
        }
    }
}

#[test]
fn lyle() {
    let all = cases("lyle");
    let data = datasets(&all);
    for c in &all {
        match c["fn"].as_str().unwrap() {
            "dataset" => {}
            "cycleWeek" => check(cycle_week(c["start"].as_str().unwrap(), c["date"].as_str().unwrap()), c),
            "repRange" => check(rep_range(opt_num(c, "repTop"), opt_num(c, "repBottom")), c),
            "lyleTarget" => {
                let last = opt_set(c, "last");
                let range: RepRange = parse(c, "range");
                check(lyle_target(num(c, "week"), num(c, "best"), last.as_ref(), num(c, "step"), range), c);
            }
            "bestForRange" => check(best_for_range(&data[c["data"].as_str().unwrap()], num(c, "bottom"), c["before"].as_str().unwrap()), c),
            "lastFirstSet" => check(last_first_set(&data[c["data"].as_str().unwrap()], c["date"].as_str().unwrap()), c),
            other => panic!("unknown case {other}"),
        }
    }
}

#[test]
fn cycle() {
    for c in cases("cycle") {
        let light: Option<Light> = c.get("light").map(|_| parse(&c, "light"));
        match c["fn"].as_str().unwrap() {
            "inLight" => assert_eq!(in_light(light.as_ref(), c["date"].as_str().unwrap()), c["out"].as_bool().unwrap(), "{c}"),
            "lightEnd" => assert_eq!(light_end(light.as_ref().unwrap()), c["out"].as_str().unwrap(), "{c}"),
            "phaseOn" => check(phase_on(&parse::<PhaseSettings>(&c, "st"), c["date"].as_str().unwrap()), &c),
            "lightSet" => check(light_set(&parse::<WorkoutSet>(&c, "set"), num(&c, "step")), &c),
            "lightTargets" => check(light_targets(&parse::<Vec<WorkoutSet>>(&c, "last"), num(&c, "step")), &c),
            "redated" => check(redated(&parse::<WorkoutSet>(&c, "set"), c["to"].as_str().unwrap(), light.as_ref()), &c),
            "progressing" => assert_eq!(progressing(&parse::<WorkoutSet>(&c, "set")), c["out"].as_bool().unwrap(), "{c}"),
            "nextProgramDay" => {
                let routine: Option<Routine> = c.get("routine").map(|_| parse(&c, "routine"));
                let got = next_program_day(routine.as_ref(), c.get("lastId").and_then(Value::as_str)).map(|d| d.id.as_str());
                check(got, &c);
            }
            other => panic!("unknown case {other}"),
        }
    }
}

#[test]
fn volume() {
    let all = cases("volume");
    let data = datasets(&all);
    for c in &all {
        let goal: Option<Goal> = c.get("goal").and_then(|g| serde_json::from_value(g.clone()).ok());
        match c["fn"].as_str().unwrap() {
            "dataset" => {}
            "statusOf" => check(status_of(num(c, "n"), &goal.unwrap()), c),
            "dayMuscles" => {
                let (muscles_of, eff) = callbacks(c);
                check(day_muscles(&parse::<Vec<WorkoutSet>>(c, "sets"), &muscles_of, &eff, goal.as_ref()), c);
            }
            "weekOf" => check(week_of(c["date"].as_str().unwrap(), c["weekStart"].as_u64().unwrap() as u8), c),
            "lastWeeks" => check(last_weeks(c["today"].as_str().unwrap(), c["n"].as_u64().unwrap() as usize, c["weekStart"].as_u64().unwrap() as u8), c),
            "weeks" => {
                let (muscles_of, eff) = callbacks(c);
                check(weeks(&data[c["data"].as_str().unwrap()], &muscles_of, &eff, goal.as_ref(), c["weekStart"].as_u64().unwrap() as u8), c);
            }
            "periodMuscles" => {
                let (muscles_of, eff) = callbacks(c);
                let sets = &data[c["data"].as_str().unwrap()];
                check(period_muscles(sets, &muscles_of, &eff, goal.as_ref(), c["from"].as_str().unwrap(), c["to"].as_str().unwrap()), c);
            }
            "weekStatus" => {
                let w: Option<WeekMuscle> = c.get("w").map(|w| WeekMuscle { total: num(w, "total"), sessions: vec![] });
                let mode = parse(c, "mode");
                check(week_status(w.as_ref(), goal.as_ref(), mode), c);
            }
            "contributions" => {
                let (muscles_of, eff) = callbacks(c);
                check(contributions(&data[c["data"].as_str().unwrap()], &muscles_of, &eff, parse(c, "muscle")), c);
            }
            other => panic!("unknown case {other}"),
        }
    }
    // The goals table matches GOALS in volume.ts.
    assert_eq!(goal_of(iron_core::model::TrainingMode::Lyle).unwrap().label, "20–40");
    assert!(goal_of(iron_core::model::TrainingMode::Standard).is_none());
    let _ = json!(null);
}
