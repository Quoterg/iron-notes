//! Calendar, supersets, routines and programs against the web app's answers (tests/golden/{calendar,
//! groups,routines,programs}.json, written by src/lib/golden-plan.test.ts). Ids the TypeScript makes with
//! `uid()` are counters there ("L…" for the library, "u…" for what a case creates) and here.

mod common;

use common::*;
use iron_core::calendar::*;
use iron_core::groups::*;
use iron_core::model::{Exercise, RoutineDay, WorkoutSet};
use iron_core::programs::*;
use iron_core::routines::*;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

fn same(got: &Value, want: &Value, c: &Value) {
    match (got, want) {
        (Value::Number(g), Value::Number(w)) => close(g.as_f64().unwrap(), w.as_f64().unwrap(), c),
        (Value::Array(g), Value::Array(w)) => {
            assert_eq!(g.len(), w.len(), "{c}: got {got}");
            g.iter().zip(w).for_each(|(g, w)| same(g, w, c));
        }
        (Value::Object(g), Value::Object(w)) => {
            assert_eq!(g.len(), w.len(), "{c}: got {got}");
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

fn s(c: &Value, k: &str) -> String {
    c[k].as_str().unwrap().to_string()
}

fn counter(prefix: &'static str) -> impl FnMut() -> String {
    let mut n = 0;
    move || {
        n += 1;
        format!("{prefix}{}", n - 1)
    }
}

#[test]
fn calendar() {
    let (mut grids, mut bounds, mut adds) = (0, 0, 0);
    for c in cases("calendar") {
        match c["fn"].as_str().unwrap() {
            "monthOf" => check(month_of(&s(&c, "date")), &c),
            "addMonths" => {
                adds += 1;
                check(add_months(&s(&c, "month"), c["n"].as_i64().unwrap() as i32), &c)
            }
            "monthBounds" => {
                bounds += 1;
                let (first, last) = month_bounds(&s(&c, "month"));
                check(json!({ "first": first, "last": last }), &c)
            }
            "monthGrid" => {
                grids += 1;
                let g = month_grid(&s(&c, "month"), c["weekStart"].as_u64().unwrap() as u8);
                assert!(g.len() % 7 == 0 && (28..=42).contains(&g.len()), "{c}");
                check(g, &c)
            }
            f => panic!("unknown fn {f}"),
        }
    }
    assert!(grids > 150 && bounds > 130 && adds > 50, "{grids} {bounds} {adds}");
}

#[test]
fn groups() {
    let all = cases("groups");
    let data: HashMap<String, Vec<WorkoutSet>> = all.iter().filter(|c| c["fn"] == "dataset").map(|c| (s(c, "name"), parse(c, "sets"))).collect();
    let mut n = 0;
    for c in all.iter().filter(|c| c["fn"] != "dataset") {
        n += 1;
        let sets = || &data[c["data"].as_str().unwrap()];
        let ex = || s(c, "exerciseId");
        match c["fn"].as_str().unwrap() {
            "groupColorsList" => check(GROUP_COLORS, c),
            "dayOrder" => check(day_order(sets()), c),
            "groupColors" => check(group_colors(sets()), c),
            "groupOf" => check(group_of(sets(), &ex()), c), // None is null on both sides
            "groupMembers" => check(group_members(sets(), &ex()), c),
            "nextInGroup" => {
                let members: Vec<String> = parse(c, "members");
                check(next_in_group(&members, &s(c, "current")).map(|(next, end)| json!({ "next": next, "endOfRound": end })), c)
            }
            "moveUnit" => check(move_unit(&day_order(sets()), &ex(), c["dir"].as_i64().unwrap() as i32), c),
            "pullTogether" => {
                let order: Vec<String> = parse(c, "order");
                let members: HashSet<String> = parse::<Vec<String>>(c, "members").into_iter().collect();
                check(pull_together(&order, &members), c)
            }
            f => panic!("unknown fn {f}"),
        }
    }
    assert!(n > 150, "{n}");
}

#[test]
fn routines() {
    let (mut plans, mut planned, mut workouts) = (0, 0, 0);
    for c in cases("routines") {
        match c["fn"].as_str().unwrap() {
            "defaultPlan" => {
                plans += 1;
                let ex: Exercise = parse(&c, "ex");
                check(default_plan(&ex), &c)
            }
            "isDone" => assert_eq!(is_done(&parse::<WorkoutSet>(&c, "set")), c["out"].as_bool().unwrap(), "{c}"),
            "plannedSets" => {
                planned += 1;
                let day: RoutineDay = parse(&c, "day");
                let last: HashMap<String, Vec<WorkoutSet>> = parse(&c, "last");
                let mut order = 1000.0;
                let got = planned_sets(
                    &day,
                    &s(&c, "date"),
                    &mut |id| last.get(id).cloned().unwrap_or_default(),
                    &mut || {
                        order += 1.0;
                        order - 1.0
                    },
                    &mut counter("u"),
                    c["warmups"].as_bool().unwrap(),
                );
                check(got, &c)
            }
            "workoutFromDay" => {
                workouts += 1;
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                let exercises: Vec<Exercise> = parse(&c, "exercises");
                let got = workout_from_day(&s(&c, "name"), &sets, &|id| exercises.iter().find(|e| e.id == id).cloned(), &mut counter("u"));
                check(got, &c)
            }
            f => panic!("unknown fn {f}"),
        }
    }
    assert!(plans > 50 && planned >= 24 && workouts >= 7, "{plans} {planned} {workouts}");
}

#[test]
fn programs() {
    let all = cases("programs");
    let libs: HashMap<String, Vec<Exercise>> = all.iter().filter(|c| c["fn"] == "library").map(|c| (s(c, "name"), parse(c, "exercises"))).collect();
    let (mut built, mut days) = (0, 0);
    for c in all.iter().filter(|c| c["fn"] != "library") {
        match c["fn"].as_str().unwrap() {
            "templates" => {
                let got: Vec<Value> = TEMPLATES
                    .iter()
                    .map(|t| {
                        let days: Vec<Value> = t
                            .days
                            .iter()
                            .map(|(name, items)| {
                                let items: Vec<Value> = items
                                    .iter()
                                    .map(|(n, sets, range)| match range {
                                        Some((a, b)) => json!([n, sets, [a, b]]),
                                        None => json!([n, sets]),
                                    })
                                    .collect();
                                json!([name, items])
                            })
                            .collect();
                        json!({ "id": t.id, "mode": t.mode, "weekdays": t.weekdays, "days": days })
                    })
                    .collect();
                check(got, c)
            }
            "buildProgram" => {
                built += 1;
                let tpl = template(c["template"].as_str().unwrap()).unwrap();
                let b = build_program(tpl, &s(c, "name"), &libs[c["library"].as_str().unwrap()], num(c, "order"), &mut counter("u"));
                check(json!({ "routine": b.routine, "ranges": b.ranges, "missing": b.missing }), c)
            }
            "isTrainingDay" => {
                days += 1;
                let wd: Option<Vec<u8>> = if c["weekdays"].is_null() { None } else { Some(parse(c, "weekdays")) };
                assert_eq!(is_training_day(wd.as_deref(), c["date"].as_str().unwrap()), c["out"].as_bool().unwrap(), "{c}");
            }
            f => panic!("unknown fn {f}"),
        }
    }
    assert!(built == 16 && days == 60, "{built} {days}");
}
