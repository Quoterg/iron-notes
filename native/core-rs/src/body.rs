//! Body measures — as src/lib/body.ts: units per kind, the trailing-mean trend, one value per date.
//! (The starter measures are in seed.rs.)

use crate::calc::round_to;
use crate::model::{BodyKind, BodyMetricEntry};
use crate::units::{w_from_user, w_to_user, WeightUnit};

pub const CM_PER_IN: f64 = 2.54;

/// The unit a kind shows in: kg/lb, %, cm/in (follows the weight unit), or none.
pub fn unit_of(kind: BodyKind, unit: WeightUnit) -> &'static str {
    match kind {
        BodyKind::Weight => match unit {
            WeightUnit::Kg => "kg",
            WeightUnit::Lb => "lb",
        },
        BodyKind::Percent => "%",
        BodyKind::Length => {
            if unit == WeightUnit::Lb {
                "in"
            } else {
                "cm"
            }
        }
        BodyKind::Number => "",
    }
}

pub fn to_user(v: f64, kind: BodyKind, unit: WeightUnit) -> f64 {
    match kind {
        BodyKind::Weight => w_to_user(v, unit),
        BodyKind::Length if unit == WeightUnit::Lb => v / CM_PER_IN,
        _ => v,
    }
}

pub fn from_user(v: f64, kind: BodyKind, unit: WeightUnit) -> f64 {
    match kind {
        BodyKind::Weight => w_from_user(v, unit),
        BodyKind::Length if unit == WeightUnit::Lb => v * CM_PER_IN,
        _ => v,
    }
}

/// units.ts `num(x, 1)`: no trailing zeros.
fn num1(x: f64) -> String {
    let r = round_to(x, 1);
    if r == 0.0 {
        "0".into()
    } else {
        format!("{r}")
    }
}

/// "82.4 kg", "15.2 %", "81 cm", "3" (a point as the decimal separator; the apps swap it for a comma).
pub fn fmt_body(v: f64, kind: BodyKind, unit: WeightUnit) -> String {
    let u = unit_of(kind, unit);
    let n = num1(to_user(v, kind, unit));
    if u.is_empty() {
        n
    } else {
        format!("{n} {u}")
    }
}

/// Entries of one measure sorted by date (then entry order), one value per date: the last one entered.
pub fn by_date(entries: &[BodyMetricEntry]) -> Vec<BodyMetricEntry> {
    let mut sorted: Vec<&BodyMetricEntry> = entries.iter().collect();
    sorted.sort_by(|a, b| a.date.cmp(&b.date).then(a.at.partial_cmp(&b.at).unwrap_or(std::cmp::Ordering::Equal)));
    let mut out: Vec<BodyMetricEntry> = Vec::new();
    for e in sorted {
        match out.last_mut() {
            Some(last) if last.date == e.date => *last = e.clone(),
            _ => out.push(e.clone()),
        }
    }
    out
}

/// Trailing mean over the last `window` values: a trend that smooths day-to-day noise.
pub fn trend(values: &[f64], window: usize) -> Vec<f64> {
    let mut out = Vec::with_capacity(values.len());
    let mut sum = 0.0;
    for i in 0..values.len() {
        sum += values[i];
        if i >= window {
            sum -= values[i - window];
        }
        out.push(sum / (i + 1).min(window) as f64);
    }
    out
}

/// Latest entry and the change since the entry before it (None if there is only one).
pub fn latest_change(sorted: &[BodyMetricEntry]) -> Option<(BodyMetricEntry, Option<f64>)> {
    let n = sorted.len();
    let last = sorted.last()?;
    Some((last.clone(), if n > 1 { Some(last.value - sorted[n - 2].value) } else { None }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(date: &str, value: f64, at: f64) -> BodyMetricEntry {
        BodyMetricEntry { id: format!("{date}{at}"), metric_id: "m".into(), date: date.into(), value, at }
    }

    #[test]
    fn one_per_date_last_entered() {
        let l = by_date(&[e("2026-02-02", 3.0, 5.0), e("2026-02-01", 1.0, 1.0), e("2026-02-02", 2.0, 9.0)]);
        assert_eq!(l.iter().map(|x| x.value).collect::<Vec<_>>(), [1.0, 2.0]);
    }

    #[test]
    fn trend_window() {
        let t = trend(&[1.0, 2.0, 3.0, 4.0], 2);
        assert_eq!(t, [1.0, 1.5, 2.5, 3.5]);
    }

    #[test]
    fn formats() {
        assert_eq!(fmt_body(82.44, BodyKind::Weight, WeightUnit::Kg), "82.4 kg");
        assert_eq!(fmt_body(2.54, BodyKind::Length, WeightUnit::Lb), "1 in");
        assert_eq!(fmt_body(3.0, BodyKind::Number, WeightUnit::Kg), "3");
    }
}
