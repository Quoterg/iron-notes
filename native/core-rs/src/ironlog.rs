//! Port of src/lib/ironlog.ts: the Iron Log bridge — body measurements and the diet phase from an Iron
//! Log backup file. Pure; `api_import.rs` does the writing. Checked against tests/golden/ironlog.json.

use crate::calc::js_round;
use crate::model::{BodyKind, BodyMetric, BodyMetricEntry, Diet};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IronLogBody {
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight_kg: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_fat_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub waist_cm: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IronLogData {
    pub body: Vec<IronLogBody>,
    /// From the profile: the daily energy target and what maintenance is estimated at (kcal), if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kcal: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub maintenance: Option<f64>,
}

fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10 && b.iter().enumerate().all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() })
}

/// A JSON number within `lo..=hi`.
fn num(v: Option<&Value>, lo: f64, hi: f64) -> Option<f64> {
    v.and_then(Value::as_f64).filter(|x| x.is_finite() && *x >= lo && *x <= hi)
}

/// Mifflin–St Jeor × activity: the maintenance estimate Iron Log itself offers. `p` is the profile object.
pub fn maintenance_of(p: &Map<String, Value>) -> Option<f64> {
    let w = num(p.get("weightKg"), 20.0, 400.0)?;
    let h = num(p.get("heightCm"), 100.0, 250.0)?;
    let a = num(p.get("age"), 10.0, 110.0)?;
    let pal = num(p.get("pal"), 1.0, 2.5).unwrap_or(1.375);
    let sex = match p.get("sex").and_then(Value::as_str) {
        Some("male") => 5.0,
        Some("female") => -161.0,
        _ => return None,
    };
    Some(js_round((10.0 * w + 6.25 * h - 5.0 * a + sex) * pal))
}

/// Reads an Iron Log backup (format "iron-log-backup", version 1). Err when it isn't one.
pub fn parse_iron_log(x: &Value) -> Result<IronLogData, String> {
    let ok = x.get("format").and_then(Value::as_str) == Some("iron-log-backup") && x.get("version").is_some_and(Value::is_number);
    if !ok {
        return Err("Not an Iron Log backup".into());
    }
    let mut body = Vec::new();
    for r in x.get("body").and_then(Value::as_array).into_iter().flatten() {
        let Some(date) = r.get("date").and_then(Value::as_str).filter(|d| is_date(d)) else { continue };
        let out = IronLogBody {
            date: date.to_string(),
            weight_kg: num(r.get("weightKg"), 20.0, 400.0),
            body_fat_pct: num(r.get("bodyFatPct"), 2.0, 75.0),
            waist_cm: num(r.get("waistCm"), 30.0, 250.0),
        };
        if out.weight_kg.is_some() || out.body_fat_pct.is_some() || out.waist_cm.is_some() {
            body.push(out);
        }
    }
    let p = x.get("settings").and_then(|s| s.get("profile")).and_then(Value::as_object);
    Ok(IronLogData { body, kcal: p.and_then(|p| num(p.get("kcal"), 800.0, 10000.0)), maintenance: p.and_then(maintenance_of) })
}

/// The diet phase Iron Log's target suggests: under 90 % of maintenance a cut, over 105 % building.
pub fn phase_of(kcal: Option<f64>, maintenance: Option<f64>) -> Option<Diet> {
    let (k, m) = (kcal.filter(|k| *k != 0.0)?, maintenance.filter(|m| *m != 0.0)?);
    let r = k / m;
    Some(if r < 0.9 {
        Diet::Cut
    } else if r > 1.05 {
        Diet::Build
    } else {
        Diet::Maintain
    })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BodyPlan {
    pub entries: Vec<BodyMetricEntry>,
    pub skipped: u32,
    pub missing: Vec<String>,
}

/// The entries to write: per Iron Log field, into the measure of that kind (by the starter name, else
/// the first of the kind), skipping dates that measure already has. Lengths are stored in cm.
pub fn plan_body_import(
    data: &IronLogData,
    metrics: &[BodyMetric],
    existing: &dyn Fn(&str) -> HashSet<String>,
    id: &mut dyn FnMut() -> String,
    at: &mut dyn FnMut() -> f64,
) -> BodyPlan {
    type Pick = fn(&IronLogBody) -> Option<f64>;
    let fields: [(Pick, BodyKind, &str); 3] = [
        (|r| r.weight_kg, BodyKind::Weight, "body weight"),
        (|r| r.body_fat_pct, BodyKind::Percent, "body fat"),
        (|r| r.waist_cm, BodyKind::Length, "waist"),
    ];
    let (mut entries, mut missing, mut skipped) = (Vec::new(), Vec::new(), 0u32);
    for (get, kind, starter) in fields {
        let rows: Vec<(&IronLogBody, f64)> = data.body.iter().filter_map(|r| get(r).map(|v| (r, v))).collect();
        if rows.is_empty() {
            continue;
        }
        let m = metrics
            .iter()
            .find(|x| x.kind == kind && x.name.to_lowercase() == starter)
            .or_else(|| metrics.iter().find(|x| x.kind == kind && kind != BodyKind::Length));
        let Some(m) = m else {
            missing.push(starter.to_string());
            continue;
        };
        let have = existing(&m.id);
        for (r, v) in rows {
            if have.contains(&r.date) {
                skipped += 1;
            } else {
                entries.push(BodyMetricEntry { id: id(), metric_id: m.id.clone(), date: r.date.clone(), value: v, at: at() });
            }
        }
    }
    BodyPlan { entries, skipped, missing }
}
