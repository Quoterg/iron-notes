//! The Rust core's body measures against the web app's answers (tests/golden/body.json, written by
//! src/lib/golden-body.test.ts).

mod common;

use common::{cases, close, num, parse};
use iron_core::body::*;
use iron_core::model::{BodyKind, BodyMetricEntry};
use iron_core::units::WeightUnit;
use serde_json::Value;

fn unit(c: &Value) -> WeightUnit {
    serde_json::from_value(c["unit"].clone()).unwrap()
}

fn entries(v: &Value) -> Vec<BodyMetricEntry> {
    serde_json::from_value(v.clone()).unwrap()
}

#[test]
fn body() {
    let mut n = 0;
    for c in cases("body") {
        let want = &c["out"];
        match c["fn"].as_str().unwrap() {
            "unitOf" => {
                assert_eq!(unit_of(parse::<BodyKind>(&c, "kind"), unit(&c)), want.as_str().unwrap(), "{c}");
            }
            "toUser" => close(to_user(num(&c, "v"), parse(&c, "kind"), unit(&c)), want.as_f64().unwrap(), &c),
            "fromUser" => close(from_user(num(&c, "v"), parse(&c, "kind"), unit(&c)), want.as_f64().unwrap(), &c),
            "fmtBody" => assert_eq!(fmt_body(num(&c, "v"), parse(&c, "kind"), unit(&c)), want.as_str().unwrap(), "{c}"),
            "byDate" => assert_eq!(by_date(&entries(&c["entries"])), entries(want), "{c}"),
            "latestChange" => match (latest_change(&entries(&c["sorted"])), want) {
                (None, Value::Null) => {}
                (Some((latest, change)), w) => {
                    assert_eq!(vec![latest], entries(&Value::Array(vec![w["latest"].clone()])), "{c}");
                    match (change, &w["change"]) {
                        (None, Value::Null) => {}
                        (Some(g), x) => close(g, x.as_f64().unwrap(), &c),
                        _ => panic!("{c}"),
                    }
                }
                _ => panic!("{c}"),
            },
            "trend" => {
                let values: Vec<f64> = parse(&c, "values");
                let got = trend(&values, c["window"].as_u64().unwrap() as usize);
                let w: Vec<f64> = serde_json::from_value(want.clone()).unwrap();
                assert_eq!(got.len(), w.len(), "{c}");
                for (g, x) in got.iter().zip(&w) {
                    close(*g, *x, &c);
                }
            }
            f => panic!("unknown fn {f}"),
        }
        n += 1;
    }
    assert!(n > 100);
}
