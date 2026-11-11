//! Feedback and autoregulation — as src/lib/feedback.ts: performance per session, its trend, the cause
//! of getting weaker, the body-weight trend and the long-gap rule.

use crate::calc::js_max;
use crate::calc::{day_number, js_round, one_rm, Formula};
use crate::load::BodyEntry;
use crate::model::{Diet, WorkoutSet};
use serde::{Deserialize, Serialize};

/// Changes smaller than this share count as "the same".
pub const TOLERANCE: f64 = 0.005;
/// More days than this since a muscle's last session is a long gap.
pub const GAP_DAYS: f64 = 10.0;
/// Body weight falling at least this share per week counts as cutting.
pub const CUT_RATE: f64 = -0.005;

/// `Date.parse(d + 'T00:00:00Z') / 86_400_000`: the day number, NaN for an unreadable date.
fn day(d: &str) -> f64 {
    day_number(d).map_or(f64::NAN, |n| n as f64)
}

pub fn days_between(a: &str, b: &str) -> f64 {
    js_round(day(b) - day(a))
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Session {
    pub date: String,
    /// Best e1RM of the session's working sets.
    pub score: f64,
    /// Readiness given before the session's first set, if any (0 fresh, 1 a bit sore, 2 still sore).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sore: Option<f64>,
}

/// One entry per session date (oldest first): working sets only (no warm-ups, lighter week or plans).
/// `since`: only dates from it (`""` = all).
pub fn sessions(sets: &[WorkoutSet], formula: Formula, since: &str) -> Vec<Session> {
    let mut by: Vec<Session> = Vec::new(); // insertion order, as the Map
    for s in sets {
        if s.is_planned() || s.is_warmup() || s.is_deload() || s.date.as_str() < since || !s.reps.map_or(false, |r| r > 0.0) {
            continue;
        }
        let reps = s.reps.unwrap();
        let score = match s.weight {
            Some(w) if w > 0.0 => one_rm(w, reps, formula),
            _ => reps,
        };
        let i = match by.iter().position(|x| x.date == s.date) {
            Some(i) => i,
            None => {
                by.push(Session { date: s.date.clone(), score: 0.0, sore: None });
                by.len() - 1
            }
        };
        by[i].score = js_max(by[i].score, score);
        if let Some(sore) = s.sore {
            by[i].sore = Some(js_max(by[i].sore.unwrap_or(0.0), sore));
        }
    }
    by.sort_by(|a, b| if a.date < b.date { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater });
    by
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Trend {
    None,
    Up,
    Stalled,
    Weaker,
}

/// The last sessions' direction: 'weaker' when each of the last two fell below the one before,
/// 'stalled' when neither of the last two beat the best before them, 'up' otherwise; 'none' with fewer
/// than three.
pub fn trend_of(list: &[Session]) -> Trend {
    if list.len() < 3 {
        return Trend::None;
    }
    let l = &list[list.len() - 3..];
    let (a, b, c) = (l[0].score, l[1].score, l[2].score);
    if b < a * (1.0 - TOLERANCE) && c < b * (1.0 - TOLERANCE) {
        return Trend::Weaker;
    }
    let before = list[..list.len() - 2].iter().fold(f64::NEG_INFINITY, |m, s| js_max(m, s.score));
    if b <= before * (1.0 + TOLERANCE) && c <= before * (1.0 + TOLERANCE) {
        return Trend::Stalled;
    }
    Trend::Up
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Cause {
    Inconsistent,
    Cutting,
    Exercise,
    Fatigue,
}

/// Why an exercise got weaker, in the order the design checks: a long gap before the latest sessions,
/// a cut (setting or body-weight trend), only this exercise down, else real fatigue.
pub fn cause_of(gap_days: f64, cutting: bool, others_weaker: f64) -> Cause {
    if gap_days > GAP_DAYS {
        return Cause::Inconsistent;
    }
    if cutting {
        return Cause::Cutting;
    }
    if others_weaker > 0.0 {
        Cause::Fatigue
    } else {
        Cause::Exercise
    }
}

/// Longest gap in days between consecutive sessions among the last `n` (`n` = 0 gives the whole list,
/// as `slice(-0)` does).
pub fn longest_gap(list: &[Session], n: usize) -> f64 {
    let last = if n == 0 || n >= list.len() { list } else { &list[list.len() - n..] };
    let mut gap = 0.0;
    for i in 1..last.len() {
        gap = js_max(gap, days_between(&last[i - 1].date, &last[i].date));
    }
    gap
}

/// Body-weight change per week as a share (least squares over the entries of the last `days` days, at
/// least 3 entries spanning a week); None when there isn't enough.
pub fn weekly_rate(entries: &[BodyEntry], today: &str, days: f64) -> Option<f64> {
    let from = day(today) - days;
    let pts: Vec<(f64, f64)> = entries.iter().filter(|e| day(&e.date) >= from && e.value > 0.0).map(|e| (day(&e.date), e.value)).collect();
    if pts.len() < 3 {
        return None;
    }
    let mx_max = pts.iter().fold(f64::NEG_INFINITY, |m, p| js_max(m, p.0));
    let mx_min = pts.iter().fold(f64::INFINITY, |m, p| if m.is_nan() || p.0.is_nan() { f64::NAN } else { m.min(p.0) });
    if mx_max - mx_min < 7.0 {
        return None;
    }
    let n = pts.len() as f64;
    let mx = pts.iter().fold(0.0, |s, p| s + p.0) / n;
    let my = pts.iter().fold(0.0, |s, p| s + p.1) / n;
    let (mut num, mut den) = (0.0, 0.0);
    for &(x, y) in &pts {
        num += (x - mx) * (y - my);
        den += (x - mx).powi(2);
    }
    if den != 0.0 && !den.is_nan() {
        Some(((num / den) * 7.0) / my)
    } else {
        None
    }
}

/// The suggestion (string key) for a stalled exercise, by the design's rules.
pub fn stalled_advice(lyle: bool, cutting: bool, last_sore: Option<f64>, spacing: f64) -> &'static str {
    if cutting {
        return "fbStalledCut";
    }
    if lyle {
        return if last_sore == Some(2.0) { "fbStalledLyleSore" } else { "fbStalledLyle" };
    }
    if spacing < 7.0 {
        "fbStalledDorianSpacing"
    } else {
        "fbStalledDorian"
    }
}

/// The suggestion (string key) for an exercise that got weaker, by cause and mode.
pub fn weaker_advice(cause: Cause, lyle: bool) -> &'static str {
    match (cause, lyle) {
        (Cause::Inconsistent, _) => "fbInconsistent",
        (Cause::Cutting, true) => "fbCuttingLyle",
        (Cause::Cutting, false) => "fbCuttingDorian",
        (Cause::Exercise, true) => "fbExerciseLyle",
        (Cause::Exercise, false) => "fbExerciseDorian",
        (Cause::Fatigue, true) => "fbFatigueLyle",
        (Cause::Fatigue, false) => "fbFatigueDorian",
    }
}

/// Cutting: set as the diet phase, or body weight falling ≥ 0.5 % a week.
pub fn is_cutting(diet: Option<Diet>, rate: Option<f64>) -> bool {
    diet == Some(Diet::Cut) || rate.map_or(false, |r| r <= CUT_RATE)
}
