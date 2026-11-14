//! Training statistics over a period — as src/lib/analysis.ts: totals, per-category breakdown, workouts
//! per week, most frequent exercises and their progress. Pure, one pass over the period's sets.

use crate::calc::{add_days, one_rm, Formula};
use crate::load::{load_of, real_load, volume_weight};
use crate::model::{Exercise, ExerciseType, WorkoutSet};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, uniffi::Enum)]
pub enum StatsPeriod {
    #[serde(rename = "week")]
    Week,
    #[serde(rename = "month")]
    Month,
    #[serde(rename = "3m")]
    Months3,
    #[serde(rename = "year")]
    Year,
    #[serde(rename = "all")]
    All,
    /// The caller's own `from`..`to` (the web's "custom"); not part of `period_start`.
    #[serde(rename = "custom")]
    Custom,
}

/// First day of a period ending today ("" = from the beginning).
pub fn period_start(p: StatsPeriod, today: &str) -> String {
    let days = match p {
        StatsPeriod::Week => 7,
        StatsPeriod::Month => 30,
        StatsPeriod::Months3 => 91,
        StatsPeriod::Year => 365,
        StatsPeriod::All | StatsPeriod::Custom => 0,
    };
    if days > 0 {
        add_days(today.to_string(), -(days - 1))
    } else {
        String::new()
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Totals {
    pub workouts: f64,
    pub sets: f64,
    pub reps: f64,
    /// kg (weight × reps).
    pub volume: f64,
    /// seconds
    pub time: f64,
    /// km
    pub distance: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryShare {
    pub category_id: String,
    pub sets: f64,
    pub volume: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseStat {
    pub exercise_id: String,
    pub sets: f64,
    pub workouts: f64,
    /// Best estimated 1RM on the first and the last workout day of the period (weight and reps only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_orm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_orm: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeekCount {
    pub start: String,
    pub workouts: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Summary {
    pub totals: Totals,
    pub categories: Vec<CategoryShare>,
    pub exercises: Vec<ExerciseStat>,
    /// Workout days per week, oldest first; weeks start on `week_start` (0 Sunday, 1 Monday).
    pub weeks: Vec<WeekCount>,
}

/// Monday (or Sunday) of the week holding `date`.
pub fn week_of(date: &str, week_start: u8) -> String {
    crate::volume::week_of(date, week_start)
}

struct Acc {
    stat: ExerciseStat,
    days: HashSet<String>,
    orm_first: Option<String>,
    orm_last: Option<String>,
}

/// Statistics of `sets` (any order; planned sets and sets of unknown exercises are skipped) for the
/// period `from`..`to`. Weeks cover the period (for "all": from the first workout).
pub fn summarize(
    sets: &[WorkoutSet],
    exercise: &impl Fn(&str) -> Option<Exercise>,
    from: &str,
    to: &str,
    week_start: u8,
    formula: Formula,
    bw_at: &impl Fn(&str) -> Option<f64>,
) -> Summary {
    let mut totals = Totals::default();
    let mut days: HashSet<&str> = HashSet::new();
    let mut cats: Vec<CategoryShare> = Vec::new();
    let mut cat_index: HashMap<String, usize> = HashMap::new();
    let mut exs: Vec<Acc> = Vec::new();
    let mut ex_index: HashMap<String, usize> = HashMap::new();
    for s in sets {
        if s.is_planned() || s.date.as_str() < from || s.date.as_str() > to {
            continue;
        }
        let Some(ex) = exercise(&s.exercise_id) else { continue };
        days.insert(&s.date);
        totals.sets += 1.0;
        let reps = s.reps.unwrap_or(0.0);
        totals.reps += reps;
        let load = load_of(Some(&ex));
        let vol = volume_weight(s.weight, load) * reps;
        totals.volume += vol;
        totals.time += s.time.unwrap_or(0.0);
        totals.distance += s.distance.unwrap_or(0.0);
        let ci = *cat_index.entry(ex.category_id.clone()).or_insert_with(|| {
            cats.push(CategoryShare { category_id: ex.category_id.clone(), sets: 0.0, volume: 0.0 });
            cats.len() - 1
        });
        cats[ci].sets += 1.0;
        cats[ci].volume += vol;
        let ei = *ex_index.entry(ex.id.clone()).or_insert_with(|| {
            exs.push(Acc {
                stat: ExerciseStat { exercise_id: ex.id.clone(), sets: 0.0, workouts: 0.0, first_orm: None, last_orm: None },
                days: HashSet::new(),
                orm_first: None,
                orm_last: None,
            });
            exs.len() - 1
        });
        let e = &mut exs[ei];
        e.stat.sets += 1.0;
        e.days.insert(s.date.clone());
        if ex.kind == ExerciseType::WeightReps {
            // Best estimated 1RM on the earliest and on the latest day with a weighted set (sets come in any order).
            let orm = one_rm(real_load(s.weight, load, bw_at(&s.date)).unwrap_or(0.0), reps, formula);
            if orm > 0.0 {
                let d = &s.date;
                if e.orm_first.as_ref().map_or(true, |f| d < f) {
                    e.orm_first = Some(d.clone());
                    e.stat.first_orm = Some(orm);
                } else if e.orm_first.as_ref() == Some(d) {
                    e.stat.first_orm = Some(e.stat.first_orm.unwrap().max(orm));
                }
                if e.orm_last.as_ref().map_or(true, |l| d > l) {
                    e.orm_last = Some(d.clone());
                    e.stat.last_orm = Some(orm);
                } else if e.orm_last.as_ref() == Some(d) {
                    e.stat.last_orm = Some(e.stat.last_orm.unwrap().max(orm));
                }
            }
        }
    }
    totals.workouts = days.len() as f64;

    let mut exercises: Vec<ExerciseStat> = exs
        .into_iter()
        .map(|mut a| {
            a.stat.workouts = a.days.len() as f64;
            a.stat
        })
        .collect();
    exercises.sort_by(|a, b| b.workouts.partial_cmp(&a.workouts).unwrap().then(b.sets.partial_cmp(&a.sets).unwrap()));

    let mut weeks: Vec<WeekCount> = Vec::new();
    let first: Option<String> = if !from.is_empty() { Some(from.to_string()) } else { days.iter().min().map(|d| d.to_string()) };
    if let Some(first) = first {
        let mut per_week: HashMap<String, f64> = HashMap::new();
        for d in &days {
            *per_week.entry(week_of(d, week_start)).or_insert(0.0) += 1.0;
        }
        let mut w = week_of(&first, week_start);
        // A date the calendar can't read gives no weeks (a string compare would loop on "NaN-NaN-NaN").
        while crate::calc::day_number(&w).is_some() && w.as_str() <= to {
            weeks.push(WeekCount { start: w.clone(), workouts: per_week.get(&w).copied().unwrap_or(0.0) });
            w = add_days(w, 7);
        }
    }

    cats.sort_by(|a, b| b.sets.partial_cmp(&a.sets).unwrap());
    Summary { totals, categories: cats, exercises, weeks }
}
