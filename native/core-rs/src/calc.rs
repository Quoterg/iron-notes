//! Pure training maths — as src/lib/calc.ts: dates, time, 1RM.
//!
//! The golden fixtures are the contract, so these follow JavaScript's number semantics exactly, edge
//! cases included (NaN, negative or huge seconds, unreadable dates): see tests/golden/calc.json.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, uniffi::Enum)]
pub enum Formula {
    #[default]
    Epley,
    Brzycki,
}

/// JavaScript's `Math.round`: the nearest integer, halves toward +∞ (−0.5 → −0); NaN and ±∞ unchanged.
/// `x − floor(x)` is exact in binary floating point, so this is right where `floor(x + 0.5)` isn't
/// (0.49999999999999994, odd integers above 2^52).
pub fn js_round(x: f64) -> f64 {
    let f = x.floor();
    let r = if x - f >= 0.5 { f + 1.0 } else { f };
    if r == 0.0 && x.is_sign_negative() {
        -0.0
    } else {
        r
    }
}

/// JavaScript's `Math.max(a, b)`: NaN if either is NaN (`f64::max` would ignore it); +0 beats −0.
pub fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == b {
        if a.is_sign_positive() { a } else { b } // ±0: +0 if either is +0
    } else if a > b {
        a
    } else {
        b
    }
}

/// JavaScript's `Math.min(a, b)`: NaN if either is NaN; −0 beats +0.
pub fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == b {
        if a.is_sign_negative() { a } else { b }
    } else if a < b {
        a
    } else {
        b
    }
}

/// `round(x, d)` from calc.ts.
pub fn round_to(x: f64, d: i32) -> f64 {
    let f = 10f64.powi(d);
    js_round(x * f) / f
}

/// `String(n)` for the integral (or NaN/∞) values these functions print.
pub fn js_int_str(x: f64) -> String {
    if x.is_nan() {
        "NaN".into()
    } else if x.is_infinite() {
        (if x > 0.0 { "Infinity" } else { "-Infinity" }).into()
    } else if x == 0.0 {
        "0".into() // String(-0) is "0"
    } else {
        format!("{x:.0}")
    }
}

/// `String(n).padStart(2, '0')`.
fn pad2(x: f64) -> String {
    let s = js_int_str(x);
    if s.len() < 2 {
        format!("0{s}")
    } else {
        s
    }
}

/// JavaScript's `Number(s)` (StringToNumber): surrounding whitespace ignored, empty → 0, unsigned
/// `0x`/`0o`/`0b` integers, decimals with sign, fraction and exponent, `±Infinity`; else NaN.
/// Undefined (a missing part) → NaN.
pub fn js_number(s: Option<&str>) -> f64 {
    let Some(s) = s else { return f64::NAN };
    let t = s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    if t.is_empty() {
        return 0.0;
    }
    for (prefix, radix) in [("0x", 16), ("0o", 8), ("0b", 2)] {
        if t.len() > 2 && t[..2].eq_ignore_ascii_case(prefix) {
            let digits = &t[2..];
            return if digits.chars().all(|c| c.is_digit(radix)) {
                digits.chars().fold(0.0, |n, c| n * radix as f64 + c.to_digit(radix).unwrap() as f64)
            } else {
                f64::NAN
            };
        }
    }
    let body = t.strip_prefix(['+', '-']).unwrap_or(t);
    if body == "Infinity" {
        return if t.starts_with('-') { f64::NEG_INFINITY } else { f64::INFINITY };
    }
    // digits [. digits] [e|E [+|-] digits], with digits on at least one side of the point.
    let b = body.as_bytes();
    let mut i = 0;
    let int_digits = b.iter().take_while(|c| c.is_ascii_digit()).count();
    i += int_digits;
    let mut frac_digits = 0;
    if i < b.len() && b[i] == b'.' {
        i += 1;
        frac_digits = b[i..].iter().take_while(|c| c.is_ascii_digit()).count();
        i += frac_digits;
    }
    if int_digits + frac_digits == 0 {
        return f64::NAN;
    }
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        i += 1;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
            i += 1;
        }
        let exp_digits = b[i..].iter().take_while(|c| c.is_ascii_digit()).count();
        if exp_digits == 0 {
            return f64::NAN;
        }
        i += exp_digits;
    }
    if i != b.len() {
        return f64::NAN;
    }
    t.parse().unwrap_or(f64::NAN)
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

/// Seconds as `m:ss` or `h:mm:ss` (as calc.ts, also for negative or NaN input).
#[uniffi::export]
pub fn fmt_time(sec: f64) -> String {
    let sec = js_round(sec);
    let h = (sec / 3600.0).floor();
    let m = ((sec % 3600.0) / 60.0).floor(); // `%` on f64 keeps the dividend's sign, as in JS
    let s = sec % 60.0;
    if h != 0.0 && !h.is_nan() {
        format!("{}:{}:{}", js_int_str(h), pad2(m), pad2(s))
    } else {
        format!("{}:{}", js_int_str(m), pad2(s))
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

/// Day number of a date string, read as calc.ts's `parseIso` + `new Date(y, m − 1, d)` does: split on
/// every `-`, `Number()` each of the first three parts, fractions truncated, months and days rolling
/// over, and years 0–99 meaning 1900–1999. None where JavaScript makes an invalid date.
pub fn day_number(s: &str) -> Option<i64> {
    let mut parts = s.split('-');
    let (y, m, d) = (js_number(parts.next()), js_number(parts.next()), js_number(parts.next()));
    if !(y.is_finite() && m.is_finite() && d.is_finite()) {
        return None;
    }
    let (y, m, d) = (y.trunc(), m.trunc(), d.trunc());
    if y.abs() > 1e6 || m.abs() > 1e8 || d.abs() > 1e9 {
        return None; // far outside what a Date holds (±275,760 years)
    }
    let (mut y, m, d) = (y as i64, m as i64, d as i64);
    if (0..=99).contains(&y) {
        y += 1900;
    }
    let (y, m) = (y + (m - 1).div_euclid(12), (m - 1).rem_euclid(12) + 1);
    Some(days_from_civil(y, m, 1) + d - 1)
}

/// `isoDate` of a day number: the year unpadded (as `getFullYear()` prints it), month and day 2 digits.
pub fn date_of(day: i64) -> String {
    let (y, m, d) = civil_from_days(day);
    format!("{y}-{m:02}-{d:02}")
}

/// The date `n` days after `s` (before, when negative). An unreadable date gives "NaN-NaN-NaN", as on the web.
#[uniffi::export]
pub fn add_days(s: String, n: i32) -> String {
    match day_number(&s) {
        Some(day) => date_of(day + n as i64),
        None => "NaN-NaN-NaN".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_round_trip_from_year_100_on() {
        // Years 0–99 read as 1900s (the JS quirk), so the round trip starts at year 100.
        let start = day_number("100-01-01").unwrap();
        for day in start..start + 146_097 * 5 {
            assert_eq!(day_number(&date_of(day)), Some(day));
        }
    }

    #[test]
    fn js_rounding() {
        assert_eq!(js_round(0.5), 1.0);
        assert_eq!(js_round(-0.5), 0.0);
        assert!(js_round(-0.5).is_sign_negative());
        assert_eq!(js_round(-1.5), -1.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
        assert_eq!(js_round(4503599627370497.0), 4503599627370497.0);
        assert!(js_round(f64::NAN).is_nan());
        assert_eq!(js_round(f64::INFINITY), f64::INFINITY);
        assert_eq!(round_to(82.555, 2), 82.56);
    }

    #[test]
    fn js_numbers() {
        // Each checked against node: Number(...)
        assert_eq!(js_number(Some(" 05 ")), 5.0);
        assert_eq!(js_number(Some("")), 0.0);
        assert_eq!(js_number(Some("0x10")), 16.0);
        assert_eq!(js_number(Some("0B101")), 5.0);
        assert!(js_number(Some("-0x10")).is_nan());
        assert_eq!(js_number(Some("1e1")), 10.0);
        assert_eq!(js_number(Some(".5")), 0.5);
        assert_eq!(js_number(Some("5.")), 5.0);
        assert!(js_number(Some(".")).is_nan());
        assert!(js_number(Some("1e")).is_nan());
        assert!(js_number(Some("inf")).is_nan());
        assert!(js_number(Some("nan")).is_nan());
        assert_eq!(js_number(Some("-Infinity")), f64::NEG_INFINITY);
        assert!(js_number(None).is_nan());
    }
}
