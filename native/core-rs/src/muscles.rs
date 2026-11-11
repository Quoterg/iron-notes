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
