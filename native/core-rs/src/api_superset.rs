//! Supersets on the exercise screen (ExerciseScreen.tsx): the exercise's group on a day, its members in
//! rotation order and colour, and where to go after saving a set. Computed as groups.rs (= groups.ts).

use crate::api::{IronCore, R};
use crate::groups;

/// `groupOf` / `groupMembers` / `groupColors` for one exercise on one day.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct SupersetInfo {
    /// The group id new sets of the exercise join (None when it isn't in a superset).
    pub group: Option<String>,
    /// The group's exercises in rotation order (empty when not grouped).
    pub members: Vec<String>,
    /// The group's colour (`#rrggbb`).
    pub color: Option<String>,
}

/// `nextInGroup`: the exercise to open after saving, and whether the round is over (rest then).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct NextInGroup {
    pub next: String,
    pub end_of_round: bool,
}

#[uniffi::export]
impl IronCore {
    pub fn superset_of(&self, exercise_id: String, date: String) -> R<SupersetInfo> {
        self.with(|s| {
            let sets = s.sets_on(&date)?;
            let group = groups::group_of(&sets, &exercise_id);
            let members = groups::group_members(&sets, &exercise_id);
            let color = group.as_ref().and_then(|g| groups::group_colors(&sets).into_iter().find(|(k, _)| k == g).map(|(_, c)| c));
            Ok(SupersetInfo { group, members, color })
        })
    }

    /// None when the exercise isn't in a superset. (Tests below.)
    pub fn next_in_superset(&self, exercise_id: String, date: String) -> R<Option<NextInGroup>> {
        self.with(|s| {
            let members = groups::group_members(&s.sets_on(&date)?, &exercise_id);
            Ok(groups::next_in_group(&members, &exercise_id).map(|(next, end_of_round)| NextInGroup { next, end_of_round }))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::WorkoutSet;

    fn set(ex: &str, g: Option<&str>, order: f64) -> WorkoutSet {
        WorkoutSet { id: format!("s{order}"), date: "2026-01-05".into(), exercise_id: ex.into(), order, group: g.map(Into::into), reps: Some(5.0), ..Default::default() }
    }

    #[test]
    fn rotation_colour_and_end_of_round() {
        let core = IronCore::in_memory().unwrap();
        for s in [set("a", Some("g"), 1.0), set("b", Some("g"), 2.0), set("c", None, 3.0)] {
            core.put_set(s).unwrap();
        }
        let d = "2026-01-05".to_string();
        let a = core.superset_of("a".into(), d.clone()).unwrap();
        assert_eq!((a.group.as_deref(), a.members.clone(), a.color.as_deref()), (Some("g"), vec!["a".to_string(), "b".to_string()], Some("#7b5cff")));
        let c = core.superset_of("c".into(), d.clone()).unwrap();
        assert_eq!((c.group, c.members, c.color), (None, vec![], None));
        assert_eq!(core.next_in_superset("a".into(), d.clone()).unwrap(), Some(NextInGroup { next: "b".into(), end_of_round: false }));
        assert_eq!(core.next_in_superset("b".into(), d.clone()).unwrap(), Some(NextInGroup { next: "a".into(), end_of_round: true }));
        assert_eq!(core.next_in_superset("c".into(), d).unwrap(), None);
    }
}
