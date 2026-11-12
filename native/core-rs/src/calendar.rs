//! Month grid maths for the calendar — as src/lib/calendar.ts. Dates are local YYYY-MM-DD strings,
//! months "YYYY-MM".

use crate::calc::{add_days, date_of, day_number, js_number};

/// `monthOf`: "YYYY-MM" of a date (its first 7 characters).
pub fn month_of(date: &str) -> String {
    date.chars().take(7).collect()
}

/// `addMonths`: the month `n` months after `month` (before, when negative).
pub fn add_months(month: &str, n: i32) -> String {
    let mut parts = month.split('-');
    let (y, m) = (js_number(parts.next()), js_number(parts.next()));
    if !(y.is_finite() && m.is_finite()) {
        return "NaN-NaN".into();
    }
    let mut y = y.trunc() as i64;
    if (0..=99).contains(&y) {
        y += 1900; // `new Date(y, …)` reads years 0–99 as 1900–1999
    }
    let total = y * 12 + (m.trunc() as i64 - 1 + n as i64);
    format!("{}-{:02}", total.div_euclid(12), total.rem_euclid(12) + 1)
}

/// `monthBounds`: first and last day of a month.
pub fn month_bounds(month: &str) -> (String, String) {
    (format!("{month}-01"), add_days(format!("{}-01", add_months(month, 1)), -1))
}

/// Weekday of a day number, 0 = Sunday (1970-01-01 was a Thursday).
fn weekday(day: i64) -> i64 {
    (day + 4).rem_euclid(7)
}

/// `monthGrid`: the days shown for a month — whole weeks starting on `week_start` (0 Sunday, 1 Monday),
/// from the week holding the 1st to the week holding the last day (4–6 rows).
pub fn month_grid(month: &str, week_start: u8) -> Vec<String> {
    let (first, last) = month_bounds(month);
    let (Some(f), Some(l)) = (day_number(&first), day_number(&last)) else { return Vec::new() };
    let ws = week_start as i64;
    let lead = (weekday(f) - ws + 7) % 7;
    let trail = (ws + 6 - weekday(l) + 7) % 7;
    ((f - lead)..=(l + trail)).map(date_of).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grids() {
        assert_eq!(add_months("2026-12", 1), "2027-01");
        assert_eq!(add_months("2026-01", -1), "2025-12");
        assert_eq!(month_bounds("2024-02"), ("2024-02-01".into(), "2024-02-29".into()));
        let g = month_grid("2026-11", 1);
        assert_eq!((g.len(), g[0].as_str(), g[41].as_str()), (42, "2026-10-26", "2026-12-06"), "{g:?}");
        assert_eq!(month_grid("2026-11", 0).len(), 35);
        assert_eq!(month_grid("2027-02", 1).len(), 28);
    }
}
