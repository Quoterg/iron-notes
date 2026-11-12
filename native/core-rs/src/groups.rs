//! Supersets — as src/lib/groups.ts: exercises of a day done in rotation. Every set of a grouped
//! exercise on that day carries the same `group` id. Pure helpers; the IronCore methods write the sets.

use crate::model::WorkoutSet;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Colours for groups (by their position in the day), readable in both themes.
pub const GROUP_COLORS: [&str; 5] = ["#7b5cff", "#f29a38", "#2bd4e0", "#e05fb8", "#e0c43a"];

/// One exercise of a day with its (live) group.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayEntry {
    pub exercise_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
}

/// `dayOrder`: the day's exercises in order with their group id: from any of the exercise's sets (a set
/// added later, e.g. from a routine, may lack it), and only for groups that still have 2+ exercises —
/// a partner left alone after a delete counts as ungrouped.
pub fn day_order(sets: &[WorkoutSet]) -> Vec<DayEntry> {
    let mut seen: Vec<(String, Option<String>)> = Vec::new();
    let mut at: HashMap<&str, usize> = HashMap::new();
    for s in sets {
        let g = s.group.clone().filter(|g| !g.is_empty()); // '' is falsy
        match at.get(s.exercise_id.as_str()) {
            None => {
                at.insert(&s.exercise_id, seen.len());
                seen.push((s.exercise_id.clone(), g));
            }
            Some(&i) if seen[i].1.is_none() && g.is_some() => seen[i].1 = g,
            _ => {}
        }
    }
    let mut size: HashMap<&str, usize> = HashMap::new();
    for (_, g) in &seen {
        if let Some(g) = g {
            *size.entry(g).or_insert(0) += 1;
        }
    }
    seen.iter()
        .map(|(id, g)| DayEntry { exercise_id: id.clone(), group: g.clone().filter(|g| size.get(g.as_str()).copied().unwrap_or(0) > 1) })
        .collect()
}

/// `groupOf`: the group a new set of `exercise_id` on that day joins (its exercise's current group, if any).
pub fn group_of(sets: &[WorkoutSet], exercise_id: &str) -> Option<String> {
    day_order(sets).into_iter().find(|o| o.exercise_id == exercise_id).and_then(|o| o.group)
}

/// `pullTogether`: exercise order with `members` pulled together at the first member's place (others
/// keep their order).
pub fn pull_together(order: &[String], members: &HashSet<String>) -> Vec<String> {
    let Some(first) = order.iter().position(|id| members.contains(id)) else { return order.to_vec() };
    let in_group: Vec<String> = order.iter().filter(|id| members.contains(*id)).cloned().collect();
    let rest: Vec<String> = order.iter().filter(|id| !members.contains(*id)).cloned().collect();
    let before = order[..first].iter().filter(|id| !members.contains(*id)).count();
    let mut out = rest[..before].to_vec();
    out.extend(in_group);
    out.extend_from_slice(&rest[before..]);
    out
}

/// `groupMembers`: the exercises of `exercise_id`'s group, in day order (empty if it isn't grouped).
pub fn group_members(sets: &[WorkoutSet], exercise_id: &str) -> Vec<String> {
    let order = day_order(sets);
    match order.iter().find(|o| o.exercise_id == exercise_id).and_then(|o| o.group.clone()) {
        Some(g) => order.into_iter().filter(|o| o.group.as_deref() == Some(g.as_str())).map(|o| o.exercise_id).collect(),
        None => Vec::new(),
    }
}

/// `nextInGroup`: where to go after saving a set in a superset: the next member, or back to the first
/// (end of a round). Returns (next, end_of_round).
pub fn next_in_group(members: &[String], current: &str) -> Option<(String, bool)> {
    let i = members.iter().position(|m| m == current)?;
    if members.len() < 2 {
        return None;
    }
    Some(if i == members.len() - 1 { (members[0].clone(), true) } else { (members[i + 1].clone(), false) })
}

/// `groupColors`: colour of each group of the day, by order of appearance (group id, colour).
pub fn group_colors(sets: &[WorkoutSet]) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for o in day_order(sets) {
        if let Some(g) = o.group {
            if !out.iter().any(|(k, _)| *k == g) {
                let color = GROUP_COLORS[out.len() % GROUP_COLORS.len()].to_string();
                out.push((g, color));
            }
        }
    }
    out
}

/// `moveUnit`: moves the unit holding `exercise_id` (its whole superset, or the exercise alone) one unit
/// up (-1) or down (+1) past the neighbouring unit. Returns the new exercise order.
pub fn move_unit(order: &[DayEntry], exercise_id: &str, dir: i32) -> Vec<String> {
    let mut units: Vec<Vec<String>> = Vec::new();
    let mut prev: Option<&str> = None;
    for o in order {
        let g = o.group.as_deref().filter(|g| !g.is_empty());
        if !units.is_empty() && g.is_some() && g == prev {
            units.last_mut().unwrap().push(o.exercise_id.clone());
        } else {
            units.push(vec![o.exercise_id.clone()]);
        }
        prev = g;
    }
    if let Some(i) = units.iter().position(|u| u.iter().any(|x| x == exercise_id)) {
        let j = i as i64 + dir as i64;
        if j >= 0 && (j as usize) < units.len() {
            units.swap(i, j as usize);
        }
    }
    units.into_iter().flatten().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(ex: &str, g: Option<&str>) -> WorkoutSet {
        WorkoutSet { exercise_id: ex.into(), group: g.map(Into::into), ..Default::default() }
    }

    #[test]
    fn lone_partner_is_ungrouped_and_units_move_together() {
        let sets = [set("a", Some("g")), set("b", Some("g")), set("c", None), set("a", Some("g"))];
        let o = day_order(&sets);
        assert_eq!(o.iter().map(|x| x.group.is_some()).collect::<Vec<_>>(), [true, true, false]);
        assert_eq!(move_unit(&o, "a", 1), ["c", "a", "b"]);
        assert!(day_order(&[set("a", Some("g")), set("c", None)]).iter().all(|x| x.group.is_none()));
    }
}
