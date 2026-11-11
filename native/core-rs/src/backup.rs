//! Port of src/lib/backup.ts: the backup file's validation and settings cleaning.
//!
//! Validation works on the raw `serde_json::Value` exactly like the TypeScript (typeof checks,
//! `Number.isFinite`, `Number.isInteger`, the DATE regex, error messages identical), and then builds
//! the typed rows of `model.rs`. Differences that follow from typed rows (all harmless):
//! - Unknown extra fields of a row (categories, exercises, sets, ...) are dropped; the TS keeps them.
//! - A planned set that is a JSON array (valid in the TS: `typeof [] === 'object'`) becomes an empty
//!   planned set `{}` here.
//! - Numbers in JSON are all `f64`; `-0` and `0` are equal.
//!
//! JS details replicated: `isStr` needs a non-empty string; `optNum` is absent or finite and >= 0;
//! `null` is present (so invalid for optional fields); arrays count as objects for `typeof`;
//! `String(x.exported ?? '')` for primitives and arrays (objects give "[object Object]").

use crate::model::{
    Backup, BodyMetric, BodyMetricEntry, Category, CycleSettings, DayComment, Diet, Exercise, ExerciseType, Lang, LightSettings, MuscleId, PlannedSet,
    PlatesSettings, ProgramSettings, Routine, RoutineDay, RoutineItem, Settings, TrainingMode, WorkoutSet,
};
use crate::muscles::{normalize_muscles, MUSCLES};
use crate::tools::clean_plates;
use crate::units::{DistUnit, WeightUnit};
use crate::calc::Formula;
use serde_json::Value;

// ---- JS-like primitives ----

/// `v?.k`: the property of an object (or array: never has these keys), else undefined (None).
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    v.as_object().and_then(|o| o.get(k))
}
fn prop<'a>(v: Option<&'a Value>, k: &str) -> Option<&'a Value> {
    v.and_then(|v| get(v, k))
}
/// A JS number (not a numeric string).
fn number(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Number(n)) => n.as_f64(),
        _ => None,
    }
}
fn is_str(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::String(s)) if !s.is_empty())
}
fn is_num(v: Option<&Value>) -> bool {
    number(v).is_some_and(f64::is_finite)
}
fn opt_num(v: Option<&Value>) -> bool {
    v.is_none() || (is_num(v) && number(v).unwrap() >= 0.0)
}
fn opt_str(v: Option<&Value>) -> bool {
    v.is_none() || matches!(v, Some(Value::String(_)))
}
fn opt_bool(v: Option<&Value>) -> bool {
    v.is_none() || matches!(v, Some(Value::Bool(_)))
}
fn opt_true(v: Option<&Value>) -> bool {
    v.is_none() || matches!(v, Some(Value::Bool(true)))
}
fn is_integer(v: Option<&Value>) -> bool {
    number(v).is_some_and(|f| f.is_finite() && f.fract() == 0.0)
}
fn opt_rep(v: Option<&Value>) -> bool {
    v.is_none() || (is_integer(v) && number(v).unwrap() >= 1.0)
}
fn str_of(v: Option<&Value>) -> Option<&str> {
    match v {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn is_array(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Array(_)))
}
fn items(v: Option<&Value>) -> &[Value] {
    match v {
        Some(Value::Array(a)) => a,
        _ => &[],
    }
}
/// JS truthiness of an object-ish value that is only used for property reads.
fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        _ => true,
    }
}

/// `/^\d{4}-\d{2}-\d{2}$/` (ASCII digits).
fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10 && b.iter().enumerate().all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() })
}
fn is_date_val(v: Option<&Value>) -> bool {
    str_of(v).is_some_and(is_date)
}
/// `/^#[0-9a-f]{6}$/i`
fn is_color(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7 && b[0] == b'#' && b[1..].iter().all(u8::is_ascii_hexdigit)
}

/// JS `Number.prototype.toString` for a finite number.
fn js_num(f: f64) -> String {
    if f == 0.0 {
        return "0".into();
    }
    let sign = if f < 0.0 { "-" } else { "" };
    let s = format!("{:e}", f.abs());
    let (m, e) = s.split_once('e').unwrap();
    let digits = m.replace('.', "");
    let k = digits.len() as i32;
    let n = e.parse::<i32>().unwrap() + 1;
    let body = if k <= n && n <= 21 {
        format!("{digits}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat((-n) as usize))
    } else {
        let ex = n - 1;
        let es = format!("{}{}", if ex < 0 { '-' } else { '+' }, ex.abs());
        if k == 1 { format!("{digits}e{es}") } else { format!("{}.{}e{es}", &digits[..1], &digits[1..]) }
    };
    format!("{sign}{body}")
}

/// JS `String(v)` (undefined for None): primitives and arrays exactly; objects "[object Object]".
fn js_string(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => js_num(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(a)) => a.iter().map(|x| if x.is_null() { String::new() } else { js_string(Some(x)) }).collect::<Vec<_>>().join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

// ---- Row validators (the TS `valid*`) ----

const BODY_KINDS: [&str; 4] = ["weight", "percent", "length", "number"];

fn parse_type(v: Option<&Value>) -> Option<ExerciseType> {
    v.and_then(|v| serde_json::from_value(v.clone()).ok())
}
fn parse_muscle(v: &Value) -> Option<MuscleId> {
    serde_json::from_value::<MuscleId>(v.clone()).ok().filter(|m| MUSCLES.contains(m))
}

fn valid_category(c: &Value) -> bool {
    is_str(get(c, "id")) && is_str(get(c, "name")) && str_of(get(c, "color")).is_some_and(is_color) && is_num(get(c, "order")) && opt_num(get(c, "rest"))
}

fn valid_muscles(m: Option<&Value>) -> bool {
    let Some(m) = m else { return true };
    if !truthy(Some(m)) {
        return false;
    }
    let (p, s) = (get(m, "primary"), get(m, "secondary"));
    is_array(p) && is_array(s) && items(p).iter().chain(items(s)).all(|x| parse_muscle(x).is_some())
}

fn valid_exercise(e: &Value) -> bool {
    let load = get(e, "load");
    is_str(get(e, "id"))
        && is_str(get(e, "name"))
        && is_str(get(e, "categoryId"))
        && parse_type(get(e, "type")).is_some()
        && opt_str(get(e, "notes"))
        && opt_num(get(e, "increment"))
        && opt_num(get(e, "rest"))
        && opt_rep(get(e, "repTop"))
        && opt_rep(get(e, "repBottom"))
        && opt_bool(get(e, "favorite"))
        && opt_bool(get(e, "joint"))
        && opt_bool(get(e, "plates"))
        && (load.is_none() || str_of(load).is_some_and(|s| matches!(s, "total" | "perHand" | "bodyweight" | "assisted")))
        && valid_muscles(get(e, "muscles"))
}

fn valid_set(s: &Value) -> bool {
    let sore = get(s, "sore");
    is_str(get(s, "id"))
        && is_date_val(get(s, "date"))
        && is_str(get(s, "exerciseId"))
        && is_num(get(s, "order"))
        && ["weight", "reps", "distance", "time"].iter().all(|k| opt_num(get(s, k)))
        && opt_str(get(s, "comment"))
        && opt_str(get(s, "group"))
        && opt_bool(get(s, "done"))
        && opt_true(get(s, "planned"))
        && opt_num(get(s, "rir"))
        && opt_num(get(s, "after"))
        && opt_num(get(s, "at"))
        && opt_true(get(s, "warmup"))
        && opt_true(get(s, "deload"))
        && (sore.is_none() || matches!(number(sore), Some(f) if f == 0.0 || f == 1.0 || f == 2.0))
}

fn valid_planned(p: &Value) -> bool {
    // `!!p && typeof p === 'object'`: an array passes too.
    matches!(p, Value::Object(_) | Value::Array(_)) && ["weight", "reps", "distance", "time"].iter().all(|k| opt_num(get(p, k)))
}

fn valid_routine(r: &Value) -> bool {
    is_str(get(r, "id"))
        && is_str(get(r, "name"))
        && is_num(get(r, "order"))
        && is_array(get(r, "days"))
        && items(get(r, "days")).iter().all(|d| {
            is_str(get(d, "id"))
                && matches!(get(d, "name"), Some(Value::String(_)))
                && is_array(get(d, "items"))
                && items(get(d, "items")).iter().all(|i| is_str(get(i, "exerciseId")) && is_array(get(i, "sets")) && items(get(i, "sets")).iter().all(valid_planned) && opt_str(get(i, "group")))
        })
}

fn valid_metric(m: &Value) -> bool {
    is_str(get(m, "id")) && is_str(get(m, "name")) && str_of(get(m, "kind")).is_some_and(|k| BODY_KINDS.contains(&k)) && is_num(get(m, "order"))
}

fn valid_entry(e: &Value) -> bool {
    is_str(get(e, "id")) && is_str(get(e, "metricId")) && is_date_val(get(e, "date")) && is_num(get(e, "value")) && is_num(get(e, "at"))
}

fn valid_comment(c: &Value) -> bool {
    is_date_val(get(c, "date")) && matches!(get(c, "text"), Some(Value::String(_)))
}

// ---- Typed rows from validated values ----

fn typed<T: serde::de::DeserializeOwned>(v: &Value) -> T {
    serde_json::from_value(v.clone()).expect("validated row")
}

fn build_exercise(v: &Value) -> Exercise {
    let mut e: Exercise = typed(v);
    // Muscles normalised (primary wins, no repeats, canonical order): effective reps must not double count.
    e.muscles = e.muscles.as_ref().map(normalize_muscles);
    e
}

fn build_planned(p: &Value) -> PlannedSet {
    // An array (valid in the TS) has none of the fields.
    if p.is_array() { PlannedSet::default() } else { typed(p) }
}

fn build_routine(r: &Value) -> Routine {
    let s = |v: &Value, k: &str| str_of(get(v, k)).unwrap().to_string();
    Routine {
        id: s(r, "id"),
        name: s(r, "name"),
        order: number(get(r, "order")).unwrap(),
        days: items(get(r, "days"))
            .iter()
            .map(|d| RoutineDay {
                id: s(d, "id"),
                name: s(d, "name"),
                items: items(get(d, "items"))
                    .iter()
                    .map(|i| RoutineItem { exercise_id: s(i, "exerciseId"), sets: items(get(i, "sets")).iter().map(build_planned).collect(), group: str_of(get(i, "group")).map(String::from) })
                    .collect(),
            })
            .collect(),
    }
}

// ---- Per-store validators (SYNC_VALIDATORS): the record as it may be stored, or Err("invalid") ----

fn ok<T>(valid: bool, build: impl FnOnce() -> T) -> Result<T, String> {
    if valid { Ok(build()) } else { Err("invalid".into()) }
}
pub fn validate_category(v: &Value) -> Result<Category, String> {
    ok(valid_category(v), || typed(v))
}
pub fn validate_exercise(v: &Value) -> Result<Exercise, String> {
    ok(valid_exercise(v), || build_exercise(v))
}
pub fn validate_set(v: &Value) -> Result<WorkoutSet, String> {
    ok(valid_set(v), || typed(v))
}
pub fn validate_comment(v: &Value) -> Result<DayComment, String> {
    ok(valid_comment(v), || typed(v))
}
pub fn validate_routine(v: &Value) -> Result<Routine, String> {
    ok(valid_routine(v), || build_routine(v))
}
pub fn validate_metric(v: &Value) -> Result<BodyMetric, String> {
    ok(valid_metric(v), || typed(v))
}
pub fn validate_entry(v: &Value) -> Result<BodyMetricEntry, String> {
    ok(valid_entry(v), || typed(v))
}
/// The `kv` store: only `{ key: 'settings', value: <object> }`, with the value cleaned.
pub fn validate_kv(v: &Value) -> Result<Settings, String> {
    let value = get(v, "value");
    if str_of(get(v, "key")) != Some("settings") || !matches!(value, Some(Value::Object(_) | Value::Array(_))) {
        return Err("invalid".into());
    }
    Ok(clean_settings(value))
}

// ---- Settings ----

/// `cleanSettings`: known keys with valid values only, the rest defaults.
pub fn clean_settings(st: Option<&Value>) -> Settings {
    let mut settings = Settings::default();
    if !truthy(st) {
        return settings;
    }
    let g = |k: &str| prop(st, k);
    let text = |k: &str| str_of(g(k));
    match text("mode") {
        Some("standard") => settings.mode = TrainingMode::Standard,
        Some("dorian") => settings.mode = TrainingMode::Dorian,
        Some("lyle") => settings.mode = TrainingMode::Lyle,
        _ => {}
    }
    match text("unit") {
        Some("kg") => settings.unit = WeightUnit::Kg,
        Some("lb") => settings.unit = WeightUnit::Lb,
        _ => {}
    }
    match text("dist") {
        Some("km") => settings.dist = DistUnit::Km,
        Some("mi") => settings.dist = DistUnit::Mi,
        Some("m") => settings.dist = DistUnit::M,
        _ => {}
    }
    if let Some(r) = number(g("rest")).filter(|r| r.is_finite() && *r > 0.0) {
        settings.rest = r;
    }
    match text("formula") {
        Some("epley") => settings.formula = Formula::Epley,
        Some("brzycki") => settings.formula = Formula::Brzycki,
        _ => {}
    }
    match number(g("weekStart")) {
        Some(w) if w == 0.0 => settings.week_start = 0,
        Some(w) if w == 1.0 => settings.week_start = 1,
        _ => {}
    }
    let flag = |k: &str| match g(k) {
        Some(Value::Bool(b)) => Some(*b),
        _ => None,
    };
    if let Some(b) = flag("autoTimer") {
        settings.auto_timer = b;
    }
    if let Some(b) = flag("timerSound") {
        settings.timer_sound = b;
    }
    if let Some(b) = flag("markDone") {
        settings.mark_done = b;
    }
    if let Some(b) = flag("keepScreenOn") {
        settings.keep_screen_on = b;
    }
    let c = g("cycle");
    if truthy(c) && is_date_val(prop(c, "start")) {
        if let Some(w) = number(prop(c, "weeks")).filter(|w| *w == 6.0 || *w == 8.0) {
            settings.cycle = Some(CycleSettings { start: str_of(prop(c, "start")).unwrap().into(), weeks: w });
        }
    }
    let l = g("light");
    if truthy(l) && is_date_val(prop(l, "start")) {
        settings.light = Some(LightSettings { start: str_of(prop(l, "start")).unwrap().into() });
    }
    match text("diet") {
        Some("build") => settings.diet = Some(Diet::Build),
        Some("maintain") => settings.diet = Some(Diet::Maintain),
        Some("cut") => settings.diet = Some(Diet::Cut),
        _ => {}
    }
    match text("lang") {
        Some("en") => settings.lang = Some(Lang::En),
        Some("sv") => settings.lang = Some(Lang::Sv),
        _ => {}
    }
    if let Some(b) = flag("roundPlates") {
        settings.round_plates = Some(b);
    }
    if let Some(b) = flag("restNotify") {
        settings.rest_notify = Some(b);
    }
    if let Some(b) = flag("gymEnglish") {
        settings.gym_english = Some(b);
    }
    let pr = g("program");
    if truthy(pr) && is_str(prop(pr, "routineId")) {
        let wd: Option<Vec<u8>> = is_array(prop(pr, "weekdays")).then(|| {
            items(prop(pr, "weekdays")).iter().filter(|d| is_integer(Some(d)) && (0.0..=6.0).contains(&number(Some(d)).unwrap())).map(|d| number(Some(d)).unwrap() as u8).collect()
        });
        let weekdays = wd.filter(|w| !w.is_empty()).map(|mut w| {
            // JS default sort compares as strings; 0-6 are single digits, so numeric order is the same.
            w.sort_unstable();
            w.dedup();
            w
        });
        settings.program = Some(ProgramSettings {
            routine_id: str_of(prop(pr, "routineId")).unwrap().into(),
            last_day_id: str_of(prop(pr, "lastDayId")).filter(|s| !s.is_empty()).map(String::from),
            weekdays,
        });
    }
    let p = g("plates");
    if truthy(p) {
        let unit = match str_of(prop(p, "unit")) {
            Some("kg") => Some(WeightUnit::Kg),
            Some("lb") => Some(WeightUnit::Lb),
            _ => None,
        };
        let sizes = prop(p, "sizes");
        if let Some(unit) = unit {
            if is_array(sizes) && items(sizes).iter().all(|x| is_num(Some(x))) {
                // Same limits as the calculator's own editor (an absurd plate set could freeze it).
                let sizes: Vec<f64> = items(sizes).iter().map(|x| number(Some(x)).unwrap()).collect();
                if let Some(bar) = number(prop(p, "bar")) {
                    if let Some(clean) = clean_plates(bar, &sizes) {
                        settings.plates = Some(PlatesSettings { unit, bar: clean.bar, sizes: clean.sizes });
                    }
                }
            }
        }
    }
    settings
}

// ---- The backup ----

/// `validateBackup`: a parsed backup file checked row by row, cleaned (settings, muscles, orphan body
/// entries). Err with the web app's message on anything malformed: nothing is imported then.
pub fn validate_backup(b: &Value) -> Result<Backup, String> {
    if str_of(get(b, "app")) != Some("iron-notes") {
        return Err("Not an Iron Notes backup".into());
    }
    if number(get(b, "version")) != Some(1.0) {
        return Err(format!("Unsupported backup version {}", js_string(get(b, "version"))));
    }
    let all = |k: &str, f: fn(&Value) -> bool| is_array(get(b, k)) && items(get(b, k)).iter().all(f);
    // Optional arrays: absent is fine; present (even null) must be a valid array.
    let opt_all = |k: &str, f: fn(&Value) -> bool| get(b, k).is_none() || all(k, f);
    if !all("categories", valid_category) {
        return Err("Invalid categories".into());
    }
    if !all("exercises", valid_exercise) {
        return Err("Invalid exercises".into());
    }
    if !all("sets", valid_set) {
        return Err("Invalid sets".into());
    }
    if !opt_all("comments", valid_comment) {
        return Err("Invalid comments".into());
    }
    if !opt_all("routines", valid_routine) {
        return Err("Invalid routines".into());
    }
    if !opt_all("metrics", valid_metric) {
        return Err("Invalid body measures".into());
    }
    if !opt_all("body", valid_entry) {
        return Err("Invalid body entries".into());
    }
    let st = get(b, "settings");
    if st.is_some() && !matches!(st, Some(Value::Object(_) | Value::Array(_))) {
        return Err("Invalid settings".into());
    }
    let list = |k: &str| items(get(b, k));
    let metrics: Vec<BodyMetric> = list("metrics").iter().map(typed).collect();
    Ok(Backup {
        app: "iron-notes".into(),
        version: 1,
        exported: match get(b, "exported") {
            None | Some(Value::Null) => String::new(),
            v => js_string(v),
        },
        categories: list("categories").iter().map(typed).collect(),
        exercises: list("exercises").iter().map(build_exercise).collect(),
        sets: list("sets").iter().map(typed).collect(),
        comments: list("comments").iter().map(typed).collect(),
        settings: clean_settings(st),
        routines: list("routines").iter().map(build_routine).collect(),
        // Entries of a measure that isn't in the file would be invisible orphans: left out.
        body: list("body").iter().map(typed::<BodyMetricEntry>).filter(|e| metrics.iter().any(|m| m.id == e.metric_id)).collect(),
        metrics,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn js_number_strings() {
        for (f, s) in [(1.0, "1"), (1.5, "1.5"), (-2.0, "-2"), (1e21, "1e+21"), (1e-7, "1e-7"), (123456789012345680000.0, "123456789012345680000"), (0.000001, "0.000001"), (1.25e-7, "1.25e-7")] {
            assert_eq!(js_num(f), s);
        }
    }

    #[test]
    fn minimal_backup() {
        let b = validate_backup(&json!({"app":"iron-notes","version":1,"categories":[],"exercises":[],"sets":[]})).unwrap();
        assert_eq!(b.settings, Settings::default());
        assert_eq!(validate_backup(&json!({"app":"iron-notes","version":"2"})).unwrap_err(), "Unsupported backup version 2");
    }

}
