//! The Rust core's workout summary against the web app's answers (tests/golden/summary.json, written by
//! src/lib/golden-summary.test.ts).

mod common;

use common::{cases, close, num, parse};
use iron_core::model::*;
use iron_core::summary::*;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

fn opt(v: &Value) -> Option<f64> {
    v.as_f64()
}

#[test]
fn summary() {
    let mut count = 0;
    for c in cases("summary") {
        let out = &c["out"];
        match c["fn"].as_str().unwrap() {
            "durationOf" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                assert_eq!(duration_of(&sets, num(&c, "offsetMin") as i32), opt(out), "{c}");
            }
            "stampAt" => {
                let got = stamp_at(opt(&c["prev"]), c["was"].as_bool().unwrap(), c["now"].as_bool().unwrap(), num(&c, "nowMs"));
                assert_eq!(got, opt(out), "{c}");
            }
            "fmtDuration" => assert_eq!(fmt_duration(num(&c, "sec")), out.as_str().unwrap(), "{c}"),
            "summaryOf" => {
                let sets: Vec<WorkoutSet> = parse(&c, "sets");
                let eff: HashMap<String, f64> = parse(&c, "effective");
                let ids: HashSet<String> = parse::<Vec<String>>(&c, "records").into_iter().collect();
                let muscles: Vec<DayMuscleMet> = c["muscles"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|m| DayMuscleMet { muscle: serde_json::from_value(m["muscle"].clone()).unwrap(), n: num(m, "n"), met: m["met"].as_bool().unwrap() })
                    .collect();
                let got = summary_of(&sets, num(&c, "volume"), |s| eff.get(&s.id).copied().unwrap_or(0.0), &ids, &muscles, num(&c, "offsetMin") as i32);
                assert_eq!(got.duration, opt(&out["duration"]), "{c}");
                assert_eq!(f64::from(got.exercises), num(out, "exercises"), "{c}");
                assert_eq!(f64::from(got.sets), num(out, "sets"), "{c}");
                close(got.volume, num(out, "volume"), &c);
                close(got.effective, num(out, "effective"), &c);
                assert_eq!(f64::from(got.records), num(out, "records"), "{c}");
                let want = out["goalsMet"].as_array().unwrap();
                assert_eq!(got.goals_met.len(), want.len(), "{c}");
                for (g, w) in got.goals_met.iter().zip(want) {
                    let name: MuscleId = serde_json::from_value(w["muscle"].clone()).unwrap();
                    assert_eq!(g.muscle, name, "{c}");
                    close(g.n, num(w, "n"), &c);
                }
            }
            other => panic!("unknown case {other}"),
        }
        count += 1;
    }
    assert!(count > 30);
}
