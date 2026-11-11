//! The Rust core against the web app's answers (tests/golden/*.json, written by src/lib/golden.test.ts).

mod common;

use common::{cases, close, num};
use iron_core::calc::{add_days, fmt_time, one_rm, Formula};
use iron_core::units::{d_from_user, d_to_user, w_from_user, w_to_user, DistUnit, WeightUnit};

#[test]
fn calc() {
    for c in cases("calc") {
        match c["fn"].as_str().unwrap() {
            "oneRM" => {
                let f = if c["formula"] == "brzycki" { Formula::Brzycki } else { Formula::Epley };
                close(one_rm(num(&c, "weight"), num(&c, "reps"), f), num(&c, "out"), &c);
            }
            "fmtTime" => assert_eq!(fmt_time(num(&c, "sec")), c["out"].as_str().unwrap(), "{c}"),
            "addDays" => assert_eq!(
                add_days(c["date"].as_str().unwrap().into(), num(&c, "n") as i32),
                c["out"].as_str().unwrap(),
                "{c}"
            ),
            other => panic!("unknown case {other}"),
        }
    }
}

#[test]
fn units() {
    for c in cases("units") {
        let v = num(&c, "v");
        let u = c["u"].as_str().unwrap();
        let w = || if u == "lb" { WeightUnit::Lb } else { WeightUnit::Kg };
        let d = || match u {
            "mi" => DistUnit::Mi,
            "m" => DistUnit::M,
            _ => DistUnit::Km,
        };
        let got = match c["fn"].as_str().unwrap() {
            "wToUser" => w_to_user(v, w()),
            "wFromUser" => w_from_user(v, w()),
            "dToUser" => d_to_user(v, d()),
            "dFromUser" => d_from_user(v, d()),
            other => panic!("unknown case {other}"),
        };
        close(got, num(&c, "out"), &c);
    }
}
