//! Gym calculators — as src/lib/tools.ts: 1RM percentages, plates per side, warm-up sets, snapping
//! targets to loadable weights. Values in the user's unit.

use crate::calc::js_max;
use crate::calc::{js_round, one_rm, round_to, Formula};
use crate::model::{Exercise, Field, LoadType};
use crate::units::{w_from_user, w_to_user, WeightUnit};
use serde::{Deserialize, Serialize};

/// Limits for the plate set (UI and backups) and the calculators' input.
pub const MIN_PLATE: f64 = 0.25;
pub const MAX_PLATE: f64 = 100.0;
pub const MAX_SIZES: usize = 12;
pub const MAX_PLATES: usize = 40;
pub const MAX_BAR: f64 = 100.0;
pub const MAX_TARGET: f64 = 2000.0;

/// A bar and plate sizes (`{ bar, sizes }`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlateSet {
    pub bar: f64,
    pub sizes: Vec<f64>,
}

/// `settings.plates`: the user's set, valid for one unit.
#[derive(Debug, Clone, PartialEq)]
pub struct PlatesSetting {
    pub unit: WeightUnit,
    pub bar: f64,
    pub sizes: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PercentRow {
    pub reps: f64,
    pub pct: f64,
    pub weight: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlatesPerSide {
    pub plates: Vec<f64>,
    pub rest: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WarmupSet {
    pub weight: f64,
    pub reps: f64,
}

/// Weight that should be liftable for `reps` given a 1RM (the formula inverted).
pub fn weight_for_reps(orm: f64, reps: f64, formula: Formula) -> f64 {
    if reps <= 1.0 {
        return orm;
    }
    if formula == Formula::Brzycki {
        return if reps >= 37.0 { 0.0 } else { (orm * (37.0 - reps)) / 36.0 };
    }
    orm / (1.0 + reps / 30.0)
}

/// Reps 1..12 with the % of 1RM and the weight.
pub fn percent_table(orm: f64, formula: Formula) -> Vec<PercentRow> {
    (0..12)
        .map(|i| {
            let reps = (i + 1) as f64;
            let w = weight_for_reps(orm, reps, formula);
            PercentRow { reps, pct: if orm > 0.0 { js_round((w / orm) * 100.0) } else { 0.0 }, weight: w }
        })
        .collect()
}

pub fn estimate(weight: f64, reps: f64, formula: Formula) -> f64 {
    one_rm(weight, reps, formula)
}

/// Plates for one side of the bar to reach `target`, largest first, using as many of each size as fit.
/// `rest` is what can't be loaded with these plates (total, both sides; 0 when exact).
pub fn plates_per_side(target: f64, bar: f64, sizes: &[f64]) -> PlatesPerSide {
    let mut side = round_to((target - bar) / 2.0, 4);
    if side <= 0.0 {
        return PlatesPerSide { plates: vec![], rest: round_to(js_max(0.0, target - bar), 3) };
    }
    let mut out: Vec<f64> = Vec::new();
    let mut sorted: Vec<f64> = sizes.iter().copied().filter(|&x| x >= MIN_PLATE).collect();
    sorted.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    // At most MAX_PLATES per side: no bar holds more, and a huge target can't freeze the screen.
    for p in sorted {
        while side >= p - 1e-9 && out.len() < MAX_PLATES {
            out.push(p);
            side = round_to(side - p, 4);
        }
    }
    PlatesPerSide { plates: out, rest: round_to(side * 2.0, 3) }
}

/// A valid plate set: sizes deduped and sorted, within limits; None if unusable.
pub fn clean_plates(bar: f64, sizes: &[f64]) -> Option<PlateSet> {
    let mut ok: Vec<f64> = Vec::new();
    for &x in sizes {
        if x.is_finite() && x >= MIN_PLATE && x <= MAX_PLATE && !ok.contains(&x) {
            ok.push(x);
        }
    }
    ok.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    if !bar.is_finite() || bar < 0.0 || bar > MAX_BAR || ok.is_empty() || ok.len() > MAX_SIZES {
        return None;
    }
    Some(PlateSet { bar, sizes: ok })
}

/// The smallest weight step the plates allow (two of the smallest plate); ∞ with no usable plate.
pub fn load_step(sizes: &[f64]) -> f64 {
    2.0 * sizes.iter().copied().filter(|&x| x > 0.0).fold(f64::INFINITY, f64::min)
}

/// Warm-up sets for a working weight: the empty bar, then ~40 / 60 / 80 % with falling reps, each
/// rounded down to what the plates can load (and never below the bar). Light targets get fewer steps.
pub fn warmup(target: f64, bar: f64, sizes: &[f64]) -> Vec<WarmupSet> {
    let step = load_step(sizes);
    let at = |f: f64| {
        js_max(bar, if step.is_finite() { bar + ((target * f - bar) / step).floor() * step } else { target * f })
    };
    let mut sets = vec![WarmupSet { weight: bar, reps: 10.0 }];
    for (f, reps) in [(0.4, 5.0), (0.6, 3.0), (0.8, 2.0)] {
        let w = round_to(at(f), 3);
        if w > sets[sets.len() - 1].weight && w < target {
            sets.push(WarmupSet { weight: w, reps });
        }
    }
    if target > bar {
        sets
    } else {
        vec![]
    }
}

/// Default bar and plates per unit (an Olympic bar and a full plate set).
pub fn default_plates(unit: WeightUnit) -> PlateSet {
    match unit {
        WeightUnit::Kg => PlateSet { bar: 20.0, sizes: vec![25.0, 20.0, 15.0, 10.0, 5.0, 2.5, 1.25] },
        WeightUnit::Lb => PlateSet { bar: 45.0, sizes: vec![45.0, 35.0, 25.0, 10.0, 5.0, 2.5] },
    }
}

/// Whether `w` can be loaded exactly with the bar and plates.
fn loadable(w: f64, bar: f64, sizes: &[f64]) -> bool {
    w >= bar - 1e-9 && plates_per_side(w, bar, sizes).rest < 1e-6
}

/// The loadable weight closest to `target` (ties go to the lighter one); the bar for anything lighter.
/// `up`: the lightest loadable weight at or above it (a weight increase must not round back down).
/// Looks at most 50 smallest steps above for the next loadable weight.
pub fn snap_to_plates(target: f64, bar: f64, sizes: &[f64], up: bool) -> f64 {
    if !(target > bar) {
        return bar;
    }
    let rest = plates_per_side(target, bar, sizes).rest;
    let below = round_to(target - rest, 4);
    if rest < 1e-6 {
        return below;
    }
    let step = load_step(sizes);
    let mut above: Option<f64> = None;
    if step.is_finite() && step > 0.0 {
        let mut i = 1;
        while i <= 50 && above.is_none() {
            let w = round_to(below + (i as f64) * (step / 2.0), 4);
            if w > target && loadable(w, bar, sizes) {
                above = Some(w);
            }
            i += 1;
        }
    }
    if up {
        return above.unwrap_or(below);
    }
    match above {
        Some(a) if a - target < target - below => a,
        _ => below,
    }
}

/// Starter exercises done with a bar and plates (by name): /barbell|squat|deadlift|hip thrust|close grip bench/i.
pub fn uses_plates_by_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    ["barbell", "squat", "deadlift", "hip thrust", "close grip bench"].iter().any(|w| n.contains(w))
}

/// The user's bar and plates in their unit (the defaults for it otherwise).
pub fn plate_config(unit: WeightUnit, plates: Option<&PlatesSetting>) -> PlateSet {
    match plates {
        Some(p) if p.unit == unit => PlateSet { bar: p.bar, sizes: p.sizes.clone() },
        _ => default_plates(unit),
    }
}

/// Whether an exercise's targets round to the bar and plates (setting on, total load, uses plates).
pub fn rounds_to_plates(ex: Option<&Exercise>, round_plates: bool) -> bool {
    round_plates
        && ex.map_or(false, |e| {
            e.kind.fields().contains(&Field::Weight)
                && e.load.unwrap_or(LoadType::Total) == LoadType::Total
                && e.plates.unwrap_or_else(|| uses_plates_by_name(&e.name))
        })
}

/// `snapperFor`: kg → the closest loadable kg for an exercise; unchanged when it doesn't round.
#[derive(Debug, Clone)]
pub struct Snapper {
    cfg: Option<(PlateSet, WeightUnit)>,
}

pub fn snapper_for(ex: Option<&Exercise>, unit: WeightUnit, plates: Option<&PlatesSetting>, round_plates: bool) -> Snapper {
    if !rounds_to_plates(ex, round_plates) {
        return Snapper { cfg: None };
    }
    Snapper { cfg: Some((plate_config(unit, plates), unit)) }
}

impl Snapper {
    /// `up`: at or above (a weight increase must not round back down).
    pub fn snap(&self, kg: f64, up: bool) -> f64 {
        match &self.cfg {
            None => kg,
            Some((cfg, unit)) => {
                let u = w_to_user(kg, *unit);
                // Only above the bar: a lighter target (an empty-bar or fixed-bar lift) is left as it is.
                if u > cfg.bar {
                    round_to(w_from_user(snap_to_plates(u, cfg.bar, &cfg.sizes, up), *unit), 3)
                } else {
                    kg
                }
            }
        }
    }
}

/// The "bar and plates" value to store: only an explicit choice (`None` = untouched) that differs from
/// the default for the name.
pub fn plates_to_store(choice: Option<bool>, name: &str) -> Option<bool> {
    match choice {
        None => None,
        Some(c) if c == uses_plates_by_name(name) => None,
        c => c,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plates_and_snapping() {
        let kg = default_plates(WeightUnit::Kg);
        assert_eq!(plates_per_side(140.0, kg.bar, &kg.sizes), PlatesPerSide { plates: vec![25.0, 25.0, 10.0], rest: 0.0 });
        assert_eq!(snap_to_plates(101.25, kg.bar, &kg.sizes, false), 100.0);
        assert_eq!(snap_to_plates(102.5, 20.0, &[20.0, 10.0, 5.0], true), 110.0);
        assert_eq!(warmup(30.0, 20.0, &kg.sizes).len(), 2);
        assert!(uses_plates_by_name("Romanian Deadlift"));
    }
}
