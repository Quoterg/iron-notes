//! Port of src/lib/seed.ts (+ load-defaults.ts, body.ts `defaultMetrics`): starter data.
//! The TypeScript makes ids with `uid()`; here the caller passes an id generator (`uid` below for real
//! use, a counter in tests).

use crate::model::{BodyKind, BodyMetric, Category, Exercise, ExerciseType, LoadType};
use crate::muscles::default_muscles;
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";

fn base36(mut n: u64) -> String {
    if n == 0 {
        return "0".into();
    }
    let mut d = Vec::new();
    while n > 0 {
        d.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    d.reverse();
    String::from_utf8(d).unwrap()
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// `uid()` of calc.ts: base-36 millisecond timestamp + 8 random base-36 characters. Randomness is
/// std only: `RandomState` (seeded by the OS per process) mixed with the clock and a counter.
pub fn uid() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let mut h = RandomState::new().build_hasher();
    h.write_u128(now.as_nanos());
    h.write_u64(COUNTER.fetch_add(1, Ordering::Relaxed));
    let mut r = h.finish();
    let mut tail = String::new();
    for _ in 0..8 {
        tail.push(DIGITS[(r % 36) as usize] as char);
        r /= 36;
    }
    format!("{}{}", base36(now.as_millis() as u64), tail)
}

/// Starter exercises' load types by name (lower case) — `DEFAULT_LOADS` in load-defaults.ts.
pub const DEFAULT_LOADS: [(&str, LoadType); 14] = [
    ("seated dumbbell press", LoadType::PerHand),
    ("arnold press", LoadType::PerHand),
    ("lateral dumbbell raise", LoadType::PerHand),
    ("front dumbbell raise", LoadType::PerHand),
    ("dumbbell curl", LoadType::PerHand),
    ("hammer curl", LoadType::PerHand),
    ("flat dumbbell bench press", LoadType::PerHand),
    ("incline dumbbell bench press", LoadType::PerHand),
    ("dumbbell fly", LoadType::PerHand),
    ("one arm dumbbell row", LoadType::PerHand),
    ("dips", LoadType::Bodyweight),
    ("pull up", LoadType::Bodyweight),
    ("chin up", LoadType::Bodyweight),
    ("push up", LoadType::Bodyweight),
];

/// `DEFAULT_LOADS[name.toLowerCase()]`.
pub fn default_load(name: &str) -> Option<LoadType> {
    let key = name.to_lowercase();
    DEFAULT_LOADS.iter().find(|(n, _)| *n == key).map(|(_, l)| *l)
}

/// Swatches offered for categories.
pub const COLORS: [&str; 9] = ["#3b8df5", "#8c5aff", "#e05fb8", "#f0566a", "#f29a38", "#e0c43a", "#2bd4e0", "#2bcf9a", "#9aa4b2"];

type Item = (&'static str, ExerciseType);

fn plain(names: &[&'static str]) -> Vec<Item> {
    names.iter().map(|n| (*n, ExerciseType::WeightReps)).collect()
}

/// `LIBRARY` of seed.ts: category name, colour, exercises with their type.
fn library() -> Vec<(&'static str, &'static str, Vec<Item>)> {
    use ExerciseType::{DistanceTime, Reps, Time, WeightReps};
    vec![
        ("Shoulders", "#3b8df5", plain(&["Overhead Press", "Seated Dumbbell Press", "Arnold Press", "Lateral Dumbbell Raise", "Front Dumbbell Raise", "Rear Delt Fly", "Face Pull", "Barbell Shrug"])),
        ("Triceps", "#8c5aff", plain(&["Close Grip Bench Press", "Cable Pushdown", "Overhead Triceps Extension", "Skullcrusher", "Dips"])),
        ("Biceps", "#e05fb8", plain(&["Barbell Curl", "Dumbbell Curl", "Hammer Curl", "Preacher Curl", "Cable Curl"])),
        ("Chest", "#f0566a", plain(&["Flat Barbell Bench Press", "Incline Barbell Bench Press", "Flat Dumbbell Bench Press", "Incline Dumbbell Bench Press", "Dumbbell Fly", "Cable Crossover", "Push Up"])),
        ("Back", "#f29a38", plain(&["Deadlift", "Barbell Row", "Pull Up", "Chin Up", "Lat Pulldown", "Seated Cable Row", "One Arm Dumbbell Row", "Back Extension"])),
        ("Legs", "#e0c43a", plain(&["Barbell Squat", "Front Squat", "Romanian Deadlift", "Leg Press", "Leg Extension", "Lying Leg Curl", "Walking Lunge", "Hip Thrust", "Standing Calf Raise"])),
        ("Abs", "#2bd4e0", vec![("Crunch", Reps), ("Hanging Leg Raise", Reps), ("Plank", Time), ("Cable Crunch", WeightReps), ("Ab Wheel Rollout", Reps)]),
        (
            "Cardio",
            "#2bcf9a",
            vec![("Running", DistanceTime), ("Cycling", DistanceTime), ("Rowing Machine", DistanceTime), ("Elliptical Trainer", DistanceTime), ("Walking", DistanceTime), ("Swimming", DistanceTime), ("Jump Rope", Time)],
        ),
    ]
}

/// `starterLibrary()`: the starter categories and exercises. `new_id` is called for a category and
/// then for each of its exercises, in order. To seed a store, pass `&mut uid`.
pub fn starter_library(new_id: &mut dyn FnMut() -> String) -> (Vec<Category>, Vec<Exercise>) {
    let mut categories = Vec::new();
    let mut exercises = Vec::new();
    for (order, (name, color, items)) in library().into_iter().enumerate() {
        let c = Category { id: new_id(), name: name.into(), color: color.into(), order: order as f64, rest: None };
        for (n, kind) in items {
            exercises.push(Exercise { id: new_id(), name: n.into(), category_id: c.id.clone(), kind, muscles: default_muscles(n), load: default_load(n), ..Default::default() });
        }
        categories.push(c);
    }
    (categories, exercises)
}

/// `defaultMetrics()` (body.ts): the starter body measures.
pub fn default_metrics(new_id: &mut dyn FnMut() -> String) -> Vec<BodyMetric> {
    let list = [
        ("Body weight", BodyKind::Weight),
        ("Body fat", BodyKind::Percent),
        ("Waist", BodyKind::Length),
        ("Chest", BodyKind::Length),
        ("Arms", BodyKind::Length),
        ("Thighs", BodyKind::Length),
        ("Neck", BodyKind::Length),
    ];
    list.iter().enumerate().map(|(order, (name, kind))| BodyMetric { id: new_id(), name: (*name).into(), kind: *kind, order: order as f64 }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uid_shape_and_uniqueness() {
        let a = uid();
        let b = uid();
        assert_ne!(a, b);
        assert!(a.len() >= 13 && a.bytes().all(|c| c.is_ascii_digit() || c.is_ascii_lowercase()));
    }
}
