//! IronCore methods for the Body tab and a measure's screen (Body.tsx, MetricSheet.tsx, body-state.ts):
//! values are handed over in the user's units; the stored kg / cm stay inside the core.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::api::{new_id, IronCore, R};
use crate::body;
use crate::calc::round_to;
use crate::model::{BodyKind, BodyMetric, BodyMetricEntry};

/// One row of the Body list.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MetricSummary {
    pub metric: BodyMetric,
    /// The unit shown after values: "kg", "lb", "%", "cm", "in" or "".
    pub unit: String,
    /// The latest entry's date (None: no entries yet).
    pub date: Option<String>,
    /// The latest value in the user's unit.
    pub value: Option<f64>,
    /// The change since the entry before, in the user's unit, rounded as shown (one decimal); None when
    /// there is no earlier entry.
    pub change: Option<f64>,
}

/// A measure's screen: its entries (one per date, oldest first) and the graph's numbers.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MetricDetail {
    pub metric: BodyMetric,
    pub unit: String,
    /// Stored units (kg / cm / % / number), for undo and the entry list.
    pub entries: Vec<BodyMetricEntry>,
    /// The entries' values in the user's unit (same order).
    pub values: Vec<f64>,
    /// 7-entry trailing mean for body weight with at least three entries; otherwise empty.
    pub trend: Vec<f64>,
}

/// Entry time (ms), strictly increasing: two entries in one millisecond still have an order.
fn next_at() -> f64 {
    static LAST: AtomicU64 = AtomicU64::new(0);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    let mut prev = LAST.load(Ordering::Relaxed);
    loop {
        let next = now.max(prev + 1);
        match LAST.compare_exchange(prev, next, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => return next as f64,
            Err(p) => prev = p,
        }
    }
}

#[uniffi::export]
impl IronCore {
    /// Body.tsx: every measure (by order, then name) with its latest value and change.
    pub fn body_overview(&self) -> R<Vec<MetricSummary>> {
        self.with(|s| {
            let unit = s.settings()?.unit;
            let mut list = s.metrics()?;
            list.sort_by(|a, b| a.order.partial_cmp(&b.order).unwrap_or(std::cmp::Ordering::Equal).then_with(|| a.name.cmp(&b.name)));
            let mut out = Vec::with_capacity(list.len());
            for m in list {
                let sorted = body::by_date(&s.body_of(&m.id)?);
                let (date, value, change) = match body::latest_change(&sorted) {
                    Some((l, ch)) => {
                        let now = body::to_user(l.value, m.kind, unit);
                        let change = ch.map(|c| round_to(now - body::to_user(l.value - c, m.kind, unit), 1));
                        (Some(l.date), Some(now), change)
                    }
                    None => (None, None, None),
                };
                out.push(MetricSummary { unit: body::unit_of(m.kind, unit).to_string(), metric: m, date, value, change });
            }
            Ok(out)
        })
    }

    /// MetricSheet.tsx: one measure's entries and graph series (None if the measure is gone).
    pub fn metric_detail(&self, metric_id: String) -> R<Option<MetricDetail>> {
        self.with(|s| {
            let unit = s.settings()?.unit;
            let Some(metric) = s.metrics()?.into_iter().find(|m| m.id == metric_id) else { return Ok(None) };
            let entries = body::by_date(&s.body_of(&metric_id)?);
            let values: Vec<f64> = entries.iter().map(|e| body::to_user(e.value, metric.kind, unit)).collect();
            let trend = if metric.kind == BodyKind::Weight && values.len() >= 3 { body::trend(&values, 7) } else { Vec::new() };
            Ok(Some(MetricDetail { unit: body::unit_of(metric.kind, unit).to_string(), metric, entries, values, trend }))
        })
    }

    /// Adds an entry for `date`; `value` in the user's unit (a date that has one: the newer shows).
    pub fn add_body_entry(&self, metric_id: String, date: String, value: f64) -> R<BodyMetricEntry> {
        let (unit, kind) = self.with(|s| {
            let kind = s.metrics()?.into_iter().find(|m| m.id == metric_id).map(|m| m.kind).unwrap_or_default();
            Ok((s.settings()?.unit, kind))
        })?;
        let e = BodyMetricEntry { id: new_id(), metric_id, date, value: body::from_user(value, kind, unit), at: next_at() };
        self.put_entry(e.clone())?;
        Ok(e)
    }

    /// A new measure, last in the list.
    pub fn add_metric(&self, name: String, kind: BodyKind) -> R<BodyMetric> {
        let order = self.with(|s| Ok(s.metrics()?.iter().map(|m| m.order).fold(-1.0, f64::max)))? + 1.0;
        let m = BodyMetric { id: new_id(), name, kind, order };
        self.put_metrics(vec![m.clone()])?;
        Ok(m)
    }

    pub fn rename_metric(&self, id: String, name: String) -> R<()> {
        let Some(mut m) = self.metrics()?.into_iter().find(|m| m.id == id) else { return Ok(()) };
        m.name = name;
        self.put_metrics(vec![m])
    }

    /// Moves a measure one place up (-1) or down (+1) in the list by swapping orders with its neighbour.
    pub fn move_metric(&self, id: String, delta: i32) -> R<()> {
        let mut list = self.metrics()?;
        list.sort_by(|a, b| a.order.partial_cmp(&b.order).unwrap_or(std::cmp::Ordering::Equal).then_with(|| a.name.cmp(&b.name)));
        let Some(i) = list.iter().position(|m| m.id == id) else { return Ok(()) };
        let j = i as i64 + delta as i64;
        if j < 0 || j as usize >= list.len() {
            return Ok(());
        }
        let j = j as usize;
        // Re-number so equal orders can't make the swap a no-op.
        for (k, m) in list.iter_mut().enumerate() {
            m.order = k as f64;
        }
        let (a, b) = (list[i].order, list[j].order);
        list[i].order = b;
        list[j].order = a;
        self.put_metrics(list)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::units::WeightUnit;

    fn weight(core: &IronCore) -> BodyMetric {
        core.metrics().unwrap().into_iter().find(|m| m.kind == BodyKind::Weight).unwrap()
    }

    #[test]
    fn overview_and_detail() {
        let core = IronCore::in_memory().unwrap();
        let w = weight(&core);
        let o = core.body_overview().unwrap();
        assert_eq!(o.len(), 7);
        assert_eq!(o[0].metric.id, w.id);
        assert_eq!((o[0].value, o[0].change), (None, None));
        for (d, v) in [("2026-11-01", 80.0), ("2026-11-02", 80.5), ("2026-11-03", 81.04)] {
            core.add_body_entry(w.id.clone(), d.into(), v).unwrap();
        }
        let o = core.body_overview().unwrap();
        assert_eq!((o[0].date.as_deref(), o[0].value, o[0].change, o[0].unit.as_str()), (Some("2026-11-03"), Some(81.04), Some(0.5), "kg"));
        let d = core.metric_detail(w.id.clone()).unwrap().unwrap();
        assert_eq!(d.entries.len(), 3);
        assert_eq!(d.trend.len(), 3);
        assert!((d.trend[2] - (80.0 + 80.5 + 81.04) / 3.0).abs() < 1e-9);
        // A second entry on one date replaces the first on screen.
        core.add_body_entry(w.id.clone(), "2026-11-03".into(), 79.0).unwrap();
        let d = core.metric_detail(w.id).unwrap().unwrap();
        assert_eq!(d.values, [80.0, 80.5, 79.0]);
    }

    #[test]
    fn user_units_in_and_out() {
        let core = IronCore::in_memory().unwrap();
        let mut s = core.settings().unwrap();
        s.unit = WeightUnit::Lb;
        core.put_settings(s).unwrap();
        let waist = core.metrics().unwrap().into_iter().find(|m| m.name == "Waist").unwrap();
        let e = core.add_body_entry(waist.id.clone(), "2026-11-01".into(), 30.0).unwrap();
        assert!((e.value - 76.2).abs() < 1e-9); // stored in cm
        let o = core.body_overview().unwrap();
        let row = o.iter().find(|r| r.metric.id == waist.id).unwrap();
        assert_eq!((row.unit.as_str(), row.value), ("in", Some(30.0)));
    }

    #[test]
    fn measures_add_rename_move_delete() {
        let core = IronCore::in_memory().unwrap();
        let m = core.add_metric("Calf".into(), BodyKind::Length).unwrap();
        assert_eq!(core.body_overview().unwrap().last().unwrap().metric.id, m.id);
        core.rename_metric(m.id.clone(), "Calves".into()).unwrap();
        core.move_metric(m.id.clone(), -1).unwrap();
        let o = core.body_overview().unwrap();
        assert_eq!(o[o.len() - 2].metric.name, "Calves");
        core.move_metric(m.id.clone(), -100).unwrap();
        core.add_body_entry(m.id.clone(), "2026-11-01".into(), 38.0).unwrap();
        core.delete_metric(m.id.clone()).unwrap();
        assert_eq!(core.body_overview().unwrap().len(), 7);
        assert!(core.metric_detail(m.id).unwrap().is_none());
    }

    #[test]
    fn body_weight_edits_move_records() {
        // Entries go through put_entry, which clears the caches (api.rs); a smoke check that it doesn't fail.
        let core = IronCore::in_memory().unwrap();
        let w = weight(&core);
        let e = core.add_body_entry(w.id, "2026-11-01".into(), 80.0).unwrap();
        core.delete_entry(e.id).unwrap();
    }
}
