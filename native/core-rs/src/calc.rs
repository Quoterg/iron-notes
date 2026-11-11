//! Pure training maths — as src/lib/calc.ts: dates, time, 1RM.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, uniffi::Enum)]
pub enum Formula {
    #[default]
    Epley,
    Brzycki,
}

/// JavaScript's `Math.round` (halves round up, also for negatives), so results match the web app.
pub fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// `round(x, d)` from calc.ts.
pub fn round_to(x: f64, d: i32) -> f64 {
    let f = 10f64.powi(d);
    js_round(x * f) / f
}

/// Estimated one-rep max. 0 without weight or reps; a single is the weight itself.
#[uniffi::export]
pub fn one_rm(weight: f64, reps: f64, formula: Formula) -> f64 {
    if !(weight > 0.0) || !(reps > 0.0) {
        return 0.0;
    }
    if reps == 1.0 {
        return weight;
    }
    match formula {
        Formula::Brzycki => {
            if reps >= 37.0 {
                weight
            } else {
                weight * 36.0 / (37.0 - reps)
            }
        }
        Formula::Epley => weight * (1.0 + reps / 30.0),
    }
}

/// Seconds as `m:ss` or `h:mm:ss`.
#[uniffi::export]
pub fn fmt_time(sec: f64) -> String {
    let sec = js_round(sec) as i64;
    let (h, m, s) = (sec / 3600, (sec % 3600) / 60, sec % 60);
    if h != 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

// ---- Dates: local calendar days as YYYY-MM-DD (no time zones: a day is a day) ----

/// Days since 1970-01-01 of a civil date (H. Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { yoe + era * 400 + 1 } else { yoe + era * 400 }, m, d)
}

/// Day number of `YYYY-MM-DD` (out-of-range months/days roll over, as JavaScript's Date does).
pub fn day_number(s: &str) -> Option<i64> {
    let mut it = s.splitn(3, '-').map(|p| p.parse::<i64>().ok());
    let (y, m, d) = (it.next()??, it.next()??, it.next()??);
    let (y, m) = (y + (m - 1).div_euclid(12), (m - 1).rem_euclid(12) + 1);
    Some(days_from_civil(y, m, 1) + d - 1)
}

pub fn date_of(day: i64) -> String {
    let (y, m, d) = civil_from_days(day);
    format!("{y:04}-{m:02}-{d:02}")
}

/// The date `n` days after `s` (before, when negative). An unreadable date is returned as is.
#[uniffi::export]
pub fn add_days(s: String, n: i32) -> String {
    match day_number(&s) {
        Some(day) => date_of(day + n as i64),
        None => s,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_round_trip_over_four_centuries() {
        for day in -146_097..146_097 {
            assert_eq!(day_number(&date_of(day)), Some(day));
        }
    }

    #[test]
    fn js_rounding() {
        assert_eq!(js_round(0.5), 1.0);
        assert_eq!(js_round(-0.5), 0.0);
        assert_eq!(round_to(82.555, 2), 82.56);
    }
}
