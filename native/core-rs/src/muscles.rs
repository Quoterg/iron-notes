//! The muscle list — as the part of src/lib/muscles.ts the training logic needs (the per-exercise
//! starter tables and the editor helpers are UI data and stay out of the core for now).

use crate::model::MuscleId;

/// Every muscle group in canonical order (as `MUSCLES` in muscles.ts).
pub const MUSCLES: [MuscleId; 15] = [
    MuscleId::Chest,
    MuscleId::FrontDelts,
    MuscleId::SideDelts,
    MuscleId::RearDelts,
    MuscleId::Lats,
    MuscleId::Traps,
    MuscleId::LowerBack,
    MuscleId::Biceps,
    MuscleId::Triceps,
    MuscleId::Forearms,
    MuscleId::Quads,
    MuscleId::Hamstrings,
    MuscleId::Glutes,
    MuscleId::Calves,
    MuscleId::Abs,
];

use crate::model::Muscles;

type M = MuscleId;

/// The starter library's muscles, by exercise name (lower case): primary, secondary. The lists are
/// sorted into canonical order on lookup (as `m()` in muscles.ts does).
const BY_NAME: [(&str, &[MuscleId], &[MuscleId]); 47] = [
    ("overhead press", &[M::FrontDelts], &[M::SideDelts, M::Triceps]),
    ("seated dumbbell press", &[M::FrontDelts], &[M::SideDelts, M::Triceps]),
    ("arnold press", &[M::FrontDelts], &[M::SideDelts, M::Triceps]),
    ("lateral dumbbell raise", &[M::SideDelts], &[]),
    ("front dumbbell raise", &[M::FrontDelts], &[]),
    ("rear delt fly", &[M::RearDelts], &[M::Traps]),
    ("face pull", &[M::RearDelts], &[M::Traps]),
    ("barbell shrug", &[M::Traps], &[]),
    ("close grip bench press", &[M::Triceps], &[M::Chest, M::FrontDelts]),
    ("cable pushdown", &[M::Triceps], &[]),
    ("overhead triceps extension", &[M::Triceps], &[]),
    ("skullcrusher", &[M::Triceps], &[]),
    ("dips", &[M::Triceps], &[M::Chest, M::FrontDelts]),
    ("barbell curl", &[M::Biceps], &[M::Forearms]),
    ("dumbbell curl", &[M::Biceps], &[M::Forearms]),
    ("hammer curl", &[M::Biceps], &[M::Forearms]),
    ("preacher curl", &[M::Biceps], &[]),
    ("cable curl", &[M::Biceps], &[]),
    ("flat barbell bench press", &[M::Chest], &[M::Triceps, M::FrontDelts]),
    ("incline barbell bench press", &[M::Chest], &[M::FrontDelts, M::Triceps]),
    ("flat dumbbell bench press", &[M::Chest], &[M::Triceps, M::FrontDelts]),
    ("incline dumbbell bench press", &[M::Chest], &[M::FrontDelts, M::Triceps]),
    ("dumbbell fly", &[M::Chest], &[]),
    ("cable crossover", &[M::Chest], &[]),
    ("push up", &[M::Chest], &[M::Triceps, M::FrontDelts]),
    ("deadlift", &[M::LowerBack, M::Glutes, M::Hamstrings], &[M::Quads, M::Traps, M::Lats, M::Forearms]),
    ("barbell row", &[M::Lats], &[M::RearDelts, M::Biceps, M::LowerBack]),
    ("pull up", &[M::Lats], &[M::Biceps]),
    ("chin up", &[M::Lats], &[M::Biceps]),
    ("lat pulldown", &[M::Lats], &[M::Biceps]),
    ("seated cable row", &[M::Lats], &[M::RearDelts, M::Biceps]),
    ("one arm dumbbell row", &[M::Lats], &[M::RearDelts, M::Biceps]),
    ("back extension", &[M::LowerBack], &[M::Glutes, M::Hamstrings]),
    ("barbell squat", &[M::Quads, M::Glutes], &[M::LowerBack]),
    ("front squat", &[M::Quads], &[M::Glutes]),
    ("romanian deadlift", &[M::Hamstrings, M::Glutes], &[M::LowerBack]),
    ("leg press", &[M::Quads, M::Glutes], &[]),
    ("leg extension", &[M::Quads], &[]),
    ("lying leg curl", &[M::Hamstrings], &[]),
    ("walking lunge", &[M::Quads, M::Glutes], &[M::Hamstrings]),
    ("hip thrust", &[M::Glutes], &[M::Hamstrings]),
    ("standing calf raise", &[M::Calves], &[]),
    ("crunch", &[M::Abs], &[]),
    ("hanging leg raise", &[M::Abs], &[]),
    ("plank", &[M::Abs], &[]),
    ("cable crunch", &[M::Abs], &[]),
    ("ab wheel rollout", &[M::Abs], &[]),
];

fn sorted(list: &[MuscleId]) -> Vec<MuscleId> {
    let mut v = list.to_vec();
    v.sort();
    v
}

/// JS `String.prototype.trim`: Unicode white space plus the BOM, but not U+0085.
fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| (c.is_whitespace() && c != '\u{85}') || c == '\u{FEFF}')
}

/// `defaultMuscles(name)`: the starter muscles of a known exercise name (trimmed, case-insensitive;
/// `to_lowercase` may differ from JS `toLowerCase` for exotic Unicode, irrelevant to this table).
pub fn default_muscles(name: &str) -> Option<Muscles> {
    let key = js_trim(name).to_lowercase();
    BY_NAME.iter().find(|(n, _, _)| *n == key).map(|(_, p, s)| Muscles { primary: sorted(p), secondary: sorted(s) })
}

/// `normalizeMuscles`: primary wins over secondary, no repeats, canonical order.
pub fn normalize_muscles(ms: &Muscles) -> Muscles {
    let mut primary = ms.primary.clone();
    primary.sort();
    primary.dedup();
    let mut secondary: Vec<MuscleId> = ms.secondary.iter().copied().filter(|x| !primary.contains(x)).collect();
    secondary.sort();
    secondary.dedup();
    Muscles { primary, secondary }
}
