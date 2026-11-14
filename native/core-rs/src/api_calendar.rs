//! IronCore method for the calendar's cycle phases (Calendar.tsx `CycleLegend` and the per-day
//! `ph-<phase>` class): the phase of every grid day plus the legend's data.

use crate::api::{IronCore, R};
use crate::calendar::month_grid;
use crate::cycle::{phase_on, Cycle, Light, Phase, PhaseSettings};
use crate::model::TrainingMode;

/// One grid day inside a cycle or lighter week; `phase` is "runup", "push" or "light".
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct DayPhase {
    pub date: String,
    pub phase: String,
}

/// The calendar's phases. `legend` is false when the web shows no legend (not Lyle with a cycle, not
/// Dorian with a lighter week); `now_week`/`now_weeks` are today's place in a Lyle cycle (0 outside).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct CalendarPhases {
    pub legend: bool,
    pub mode_lyle: bool,
    pub now_week: u32,
    pub now_weeks: u32,
    /// "runup" or "push" while `now_week` > 0, else "".
    pub now_phase: String,
    pub days: Vec<DayPhase>,
}

fn name(p: Phase) -> &'static str {
    match p {
        Phase::Runup => "runup",
        Phase::Push => "push",
        Phase::Light => "light",
    }
}

#[uniffi::export]
impl IronCore {
    /// The phase of each day of the month's grid (`month` "YYYY-MM") and the legend line's data, for `today`.
    pub fn month_phases(&self, month: String, week_start: u8, today: String) -> R<CalendarPhases> {
        let st = self.settings()?;
        let ps = PhaseSettings {
            mode: st.mode,
            cycle: st.cycle.map(|c| Cycle { start: c.start, weeks: c.weeks }),
            light: st.light.map(|l| Light { start: l.start }),
        };
        let legend = (ps.mode == TrainingMode::Lyle && ps.cycle.is_some()) || (ps.mode == TrainingMode::Dorian && ps.light.is_some());
        let days = month_grid(&month, week_start)
            .into_iter()
            .filter_map(|d| phase_on(&ps, &d).map(|i| DayPhase { date: d, phase: name(i.phase).into() }))
            .collect();
        let now = phase_on(&ps, &today).filter(|i| i.week.is_some());
        Ok(CalendarPhases {
            legend,
            mode_lyle: ps.mode == TrainingMode::Lyle,
            now_week: now.and_then(|i| i.week).map_or(0, |w| w as u32),
            now_weeks: now.and_then(|i| i.weeks).map_or(0, |w| w as u32),
            now_phase: now.map_or(String::new(), |i| name(i.phase).into()),
            days,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CycleSettings, LightSettings};

    #[test]
    fn phases_follow_the_mode() {
        let core = IronCore::in_memory().unwrap();
        let p = core.month_phases("2026-11".into(), 1, "2026-11-09".into()).unwrap();
        assert!(!p.legend && p.days.is_empty());
        let mut st = core.settings().unwrap();
        st.mode = TrainingMode::Lyle;
        st.cycle = Some(CycleSettings { start: "2026-10-26".into(), weeks: 6.0 });
        core.put_settings(st.clone()).unwrap();
        let p = core.month_phases("2026-11".into(), 1, "2026-11-09".into()).unwrap();
        assert!(p.legend && p.mode_lyle);
        assert_eq!((p.now_week, p.now_weeks, p.now_phase.as_str()), (3, 6, "push"));
        let at = |d: &str| p.days.iter().find(|x| x.date == d).map(|x| x.phase.clone());
        assert_eq!(at("2026-10-26").as_deref(), Some("runup"));
        assert_eq!(at("2026-11-09").as_deref(), Some("push"));
        assert_eq!(at("2026-12-07"), None);
        st.mode = TrainingMode::Dorian;
        st.light = Some(LightSettings { start: "2026-11-02".into() });
        core.put_settings(st).unwrap();
        let p = core.month_phases("2026-11".into(), 1, "2026-11-09".into()).unwrap();
        assert!(p.legend && !p.mode_lyle && p.now_week == 0);
        assert_eq!(p.days.iter().filter(|d| d.phase == "light").count(), 7);
    }
}
