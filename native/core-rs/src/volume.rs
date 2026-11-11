//! Effective reps per muscle group per session and per week, against the training mode's goal — as
//! src/lib/volume.ts (docs/TRAINING-MODES.md, "Per muscle group"). Pure: callers pass each set's
//! effective reps. Maps keep a JS Map's insertion order, which is observable (ties, summing order).

use crate::calc::js_max;
use crate::calc::{add_days, date_of, day_number, js_round};
use crate::effective::{is_main_session, muscle_totals, total_of, SECONDARY};
use crate::model::{MuscleId, Muscles, TrainingMode, WorkoutSet};
use crate::muscles::MUSCLES;
use crate::targets::days_between;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Goal {
    pub min: f64,
    pub max: f64,
    /// As shown: Dorian's ~20, Lyle's range.
    pub label: String,
}

/// Effective reps per muscle per main session. Standard mode has no goal (numbers only).
pub fn goal_of(mode: TrainingMode) -> Option<Goal> {
    match mode {
        TrainingMode::Standard => None,
        TrainingMode::Dorian => Some(Goal { min: 20.0, max: 30.0, label: "20".into() }),
        TrainingMode::Lyle => Some(Goal { min: 20.0, max: 40.0, label: "20–40".into() }),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Under,
    In,
    Over,
}

pub fn status_of(n: f64, g: &Goal) -> Status {
    if n < g.min {
        Status::Under
    } else if n > g.max {
        Status::Over
    } else {
        Status::In
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct DayMuscle {
    pub muscle: MuscleId,
    pub direct: f64,
    pub indirect: f64,
    /// A main session for this muscle (direct work ≥ half the goal; any direct work without a goal).
    pub main: bool,
}

/// Per muscle for one session, in the canonical muscle order; muscles with nothing are left out.
pub fn day_muscles<'a>(
    sets: impl IntoIterator<Item = &'a WorkoutSet>,
    muscles_of: &impl Fn(&str) -> Option<Muscles>,
    effective: &impl Fn(&WorkoutSet) -> f64,
    goal: Option<&Goal>,
) -> Vec<DayMuscle> {
    let totals = muscle_totals(sets.into_iter().filter(|s| !s.is_planned()).map(|s| (muscles_of(&s.exercise_id), effective(s))));
    MUSCLES
        .iter()
        .filter_map(|&m| {
            let t = total_of(&totals, m)?;
            if t.direct + t.indirect <= 0.0 {
                return None;
            }
            let main = match goal {
                Some(g) => is_main_session(t.direct, g.min),
                None => t.direct > 0.0,
            };
            Some(DayMuscle { muscle: m, direct: t.direct, indirect: t.indirect, main })
        })
        .collect()
}

/// First day (YYYY-MM-DD) of the week containing `date`; `week_start` 0 = Sunday, 1 = Monday.
pub fn week_of(date: &str, week_start: u8) -> String {
    let Some(day) = day_number(date) else { return "NaN-NaN-NaN".into() };
    let dow = (day + 4).rem_euclid(7); // 1970-01-01 was a Thursday; 0 = Sunday
    let back = (dow - week_start as i64 + 7) % 7;
    date_of(day - back)
}

/// The `n` week starts ending with the week of `today`, oldest first.
pub fn last_weeks(today: &str, n: usize, week_start: u8) -> Vec<String> {
    let end = week_of(today, week_start);
    (0..n).map(|i| add_days(end.clone(), -7 * (n - 1 - i) as i32)).collect()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeekSession {
    pub date: String,
    pub n: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeekMuscle {
    /// Direct + indirect effective reps of the week.
    pub total: f64,
    /// The week's main sessions: date and that session's direct + indirect reps.
    pub sessions: Vec<WeekSession>,
}

/// Per week start, per muscle: the week's total and its main sessions (both maps in insertion order).
pub fn weeks(
    sets: &[WorkoutSet],
    muscles_of: &impl Fn(&str) -> Option<Muscles>,
    effective: &impl Fn(&WorkoutSet) -> f64,
    goal: Option<&Goal>,
    week_start: u8,
) -> Vec<(String, Vec<(MuscleId, WeekMuscle)>)> {
    // The dates sorted, each with its sets in input order.
    let mut by_date: std::collections::BTreeMap<&str, Vec<&WorkoutSet>> = std::collections::BTreeMap::new();
    for s in sets.iter().filter(|s| !s.is_planned()) {
        by_date.entry(s.date.as_str()).or_default().push(s);
    }
    let mut out: Vec<(String, Vec<(MuscleId, WeekMuscle)>)> = Vec::new();
    for (date, day) in &by_date {
        let wk = week_of(date, week_start);
        let wi = match out.iter().rposition(|(k, _)| *k == wk) {
            Some(i) => i,
            None => {
                out.push((wk, Vec::new()));
                out.len() - 1
            }
        };
        let week = &mut out[wi].1;
        for d in day_muscles(day.iter().copied(), muscles_of, effective, goal) {
            let mi = match week.iter().position(|(k, _)| *k == d.muscle) {
                Some(i) => i,
                None => {
                    week.push((d.muscle, WeekMuscle { total: 0.0, sessions: Vec::new() }));
                    week.len() - 1
                }
            };
            let w = &mut week[mi].1;
            w.total += d.direct + d.indirect;
            if d.main {
                w.sessions.push(WeekSession { date: date.to_string(), n: d.direct + d.indirect });
            }
        }
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PeriodMuscle {
    pub muscle: MuscleId,
    /// Direct + indirect effective reps in the period.
    pub total: f64,
    /// Main sessions in the period.
    pub sessions: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Period {
    pub list: Vec<PeriodMuscle>,
    pub total: f64,
    pub weeks: f64,
}

/// Effective reps per muscle over a period (Statistics), by muscle total, most first; `weeks` is the
/// period's length in weeks (at least 1) for a per-week average.
pub fn period_muscles(
    sets: &[WorkoutSet],
    muscles_of: &impl Fn(&str) -> Option<Muscles>,
    effective: &impl Fn(&WorkoutSet) -> f64,
    goal: Option<&Goal>,
    from: &str,
    to: &str,
) -> Period {
    // Map<string, WorkoutSet[]> in insertion order (the order the days are summed in).
    let mut by_date: Vec<(&str, Vec<&WorkoutSet>)> = Vec::new();
    let mut index: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for s in sets {
        if s.is_planned() || s.date.as_str() < from || s.date.as_str() > to {
            continue;
        }
        let i = *index.entry(s.date.as_str()).or_insert_with(|| {
            by_date.push((s.date.as_str(), Vec::new()));
            by_date.len() - 1
        });
        by_date[i].1.push(s);
    }
    let mut out: Vec<PeriodMuscle> = Vec::new();
    let mut total = 0.0;
    for (_, day) in &by_date {
        for d in day_muscles(day.iter().copied(), muscles_of, effective, goal) {
            let i = match out.iter().position(|m| m.muscle == d.muscle) {
                Some(i) => i,
                None => {
                    out.push(PeriodMuscle { muscle: d.muscle, total: 0.0, sessions: 0.0 });
                    out.len() - 1
                }
            };
            out[i].total += d.direct + d.indirect;
            if d.main {
                out[i].sessions += 1.0;
            }
        }
        for s in day {
            total += effective(s);
        }
    }
    // `from || [...byDate.keys()].sort()[0] || to`
    let first: &str = if !from.is_empty() {
        from
    } else {
        by_date.iter().map(|(k, _)| *k).min().filter(|k| !k.is_empty()).unwrap_or(to)
    };
    let days = js_round(days_between(first, to)) + 1.0;
    out.sort_by(|a, b| b.total.partial_cmp(&a.total).unwrap_or(std::cmp::Ordering::Equal));
    Period { list: out, total, weeks: js_max(1.0, days / 7.0) }
}

/// Main sessions per muscle per week the mode aims for (Dorian about once, Lyle about twice).
pub fn sessions_per_week(mode: TrainingMode) -> f64 {
    match mode {
        TrainingMode::Standard | TrainingMode::Dorian => 1.0,
        TrainingMode::Lyle => 2.0,
    }
}

/// A muscle's week against the mode's goal: under, in or over, or none / trained.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WeekStatus {
    Under,
    In,
    Over,
    #[serde(rename = "none")]
    Nothing,
    Trained,
}

/// A muscle's week against the mode's goal (session goal × sessions a week); 'trained' without a goal.
pub fn week_status(w: Option<&WeekMuscle>, goal: Option<&Goal>, mode: TrainingMode) -> WeekStatus {
    let Some(w) = w.filter(|w| !(w.total <= 0.0)) else { return WeekStatus::Nothing };
    let Some(goal) = goal else { return WeekStatus::Trained };
    let k = sessions_per_week(mode);
    if w.total < goal.min * k {
        WeekStatus::Under
    } else if w.total > goal.max * k {
        WeekStatus::Over
    } else {
        WeekStatus::In
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contribution {
    pub exercise_id: String,
    pub n: f64,
    pub direct: bool,
}

/// What each exercise gave a muscle (direct, or half as a secondary muscle), most first.
pub fn contributions(
    sets: &[WorkoutSet],
    muscles_of: &impl Fn(&str) -> Option<Muscles>,
    effective: &impl Fn(&WorkoutSet) -> f64,
    muscle: MuscleId,
) -> Vec<Contribution> {
    let mut out: Vec<Contribution> = Vec::new();
    for s in sets {
        if s.is_planned() {
            continue;
        }
        let ms = muscles_of(&s.exercise_id);
        let direct = ms.as_ref().is_some_and(|m| m.primary.contains(&muscle));
        let share = if direct {
            1.0
        } else if ms.as_ref().is_some_and(|m| m.secondary.contains(&muscle)) {
            SECONDARY
        } else {
            0.0
        };
        let n = share * effective(s);
        if !(n > 0.0) {
            continue;
        }
        let i = match out.iter().position(|c| c.exercise_id == s.exercise_id) {
            Some(i) => i,
            None => {
                out.push(Contribution { exercise_id: s.exercise_id.clone(), n: 0.0, direct });
                out.len() - 1
            }
        };
        out[i].n += n;
    }
    out.sort_by(|a, b| b.n.partial_cmp(&a.n).unwrap_or(std::cmp::Ordering::Equal));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weeks_start_by_setting() {
        assert_eq!(week_of("2026-10-29", 1), "2026-10-26");
        assert_eq!(week_of("2026-10-29", 0), "2026-10-25");
        assert_eq!(last_weeks("2026-10-29", 3, 1), ["2026-10-12", "2026-10-19", "2026-10-26"]);
    }

    #[test]
    fn status_against_goal() {
        let g = goal_of(TrainingMode::Lyle).unwrap();
        assert_eq!(status_of(41.0, &g), Status::Over);
        let w = WeekMuscle { total: 39.5, sessions: vec![] };
        assert_eq!(week_status(Some(&w), Some(&g), TrainingMode::Lyle), WeekStatus::Under);
    }
}
