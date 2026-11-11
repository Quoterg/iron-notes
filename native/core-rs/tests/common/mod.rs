//! Shared helpers for the golden tests (tests/golden*.rs): read tests/golden/<name>.json, written by
//! the web app's src/lib/golden*.test.ts.
#![allow(dead_code)]

use serde::de::DeserializeOwned;
use serde_json::Value;

pub fn cases(name: &str) -> Vec<Value> {
    let path = format!("{}/tests/golden/{name}.json", env!("CARGO_MANIFEST_DIR"));
    let v: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap();
    let list = v.as_array().unwrap().clone();
    assert!(!list.is_empty(), "{path} is empty");
    list
}

/// A fixture number: JSON numbers as they are, "NaN" / "Infinity" / "-Infinity" as those values.
pub fn to_num(v: &Value) -> f64 {
    match v {
        Value::String(s) if s == "NaN" => f64::NAN,
        Value::String(s) if s == "Infinity" => f64::INFINITY,
        Value::String(s) if s == "-Infinity" => f64::NEG_INFINITY,
        v => v.as_f64().unwrap_or_else(|| panic!("not a number: {v}")),
    }
}

pub fn num(c: &Value, k: &str) -> f64 {
    to_num(&c[k])
}

/// A field of a case parsed into a model type (e.g. a `WorkoutSet` or `Vec<WorkoutSet>`).
pub fn parse<T: DeserializeOwned>(c: &Value, k: &str) -> T {
    serde_json::from_value(c[k].clone()).unwrap_or_else(|e| panic!("{k} in {c}: {e}"))
}

/// Equal within floating-point noise; NaN equals NaN, ∞ equals ∞.
pub fn close(got: f64, want: f64, c: &Value) {
    if want.is_nan() || want.is_infinite() {
        assert!(got.is_nan() == want.is_nan() && (want.is_nan() || got == want), "{c}: got {got}");
        return;
    }
    assert!((got - want).abs() <= 1e-9 * want.abs().max(1.0), "{c}: got {got}");
}
