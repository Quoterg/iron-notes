//! Port of src/lib/csv.ts: CSV export (FitNotes' column layout) and FitNotes CSV import planning.
//! Pure; `api_import.rs` does the writing. Checked against tests/golden/csv.json.

use crate::calc::{fmt_time, js_number, js_round};
use crate::model::{Category, Exercise, ExerciseType, Field, Settings, WorkoutSet};
use crate::records::by_order;
use crate::seed::COLORS;
use crate::units::{d_to_user, w_to_user, DistUnit, WeightUnit, KG_PER_LB, KM_PER_MI};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

/// JS `String.prototype.trim`: Unicode white space plus the BOM, but not U+0085.
fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| (c.is_whitespace() && c != '\u{85}') || c == '\u{FEFF}')
}

/// `csvEscape` for a text value.
pub fn csv_escape(s: &str) -> String {
    if s.contains(['"', ',', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn formula_start(c: char) -> bool {
    matches!(c, '=' | '+' | '-' | '@' | '\t' | '\r')
}

/// A text cell a spreadsheet would run as a formula gets a leading apostrophe; the importer strips it.
pub fn safe_text(s: &str) -> String {
    if s.chars().next().is_some_and(formula_start) {
        format!("'{s}")
    } else {
        s.to_string()
    }
}

fn unsafe_text(s: &str) -> String {
    let mut it = s.chars();
    if it.next() == Some('\'') && it.next().is_some_and(formula_start) {
        s[1..].to_string()
    } else {
        s.to_string()
    }
}

/// RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF; blank lines dropped.
pub fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut cell = String::new();
    let mut q = false;
    let mut it = text.chars().peekable();
    while let Some(c) = it.next() {
        if q {
            if c == '"' {
                if it.peek() == Some(&'"') {
                    cell.push('"');
                    it.next();
                } else {
                    q = false;
                }
            } else {
                cell.push(c);
            }
        } else if c == '"' {
            q = true;
        } else if c == ',' {
            row.push(std::mem::take(&mut cell));
        } else if c == '\n' || c == '\r' {
            if c == '\r' && it.peek() == Some(&'\n') {
                it.next();
            }
            row.push(std::mem::take(&mut cell));
            rows.push(std::mem::take(&mut row));
        } else {
            cell.push(c);
        }
    }
    if !cell.is_empty() || !row.is_empty() {
        row.push(cell);
        rows.push(row);
    }
    rows.into_iter().filter(|r| r.iter().any(|c| !js_trim(c).is_empty())).collect()
}

// After FitNotes' columns, the set's effort (RIR, reps after failure, warm-up): what effective reps are worked
// out from, so a CSV round trip keeps them (Q6). FitNotes never writes these, so they also mark our own export.
const HEADER: [&str; 13] = ["Date", "Exercise", "Category", "Weight", "Weight Unit", "Reps", "Distance", "Distance Unit", "Time", "Comment", "RIR", "After failure", "Warm-up"];

/// JS `String(n)` for the finite numbers the export prints.
fn js_str(x: f64) -> String {
    crate::backup::js_num(x)
}

/// units.ts `num(x, d)`: rounded to `d` places, no trailing zeros.
fn num(x: f64, d: i32) -> String {
    let f = 10f64.powi(d);
    js_str(js_round(x * f) / f)
}

/// All done sets as CSV in FitNotes' layout, in the user's units (kgs/lbs, km/mi/m).
pub fn to_csv(sets: &[WorkoutSet], exercises: &[Exercise], categories: &[Category], st: &Settings) -> String {
    let ex: HashMap<&str, &Exercise> = exercises.iter().map(|e| (e.id.as_str(), e)).collect();
    let cat: HashMap<&str, &Category> = categories.iter().map(|c| (c.id.as_str(), c)).collect();
    let mut lines = vec![HEADER.join(",")];
    let w_unit = if st.unit == WeightUnit::Lb { "lbs" } else { "kgs" };
    let d_unit = match st.dist {
        DistUnit::Km => "km",
        DistUnit::Mi => "mi",
        DistUnit::M => "m",
    };
    let mut sorted: Vec<&WorkoutSet> = sets.iter().collect();
    sorted.sort_by(|a, b| by_order(a, b));
    for s in sorted {
        let Some(e) = ex.get(s.exercise_id.as_str()) else { continue };
        if s.is_planned() {
            continue;
        }
        let f = e.kind.fields();
        let has = |x: Field| f.contains(&x);
        let cells = [
            s.date.clone(),
            safe_text(&e.name),
            safe_text(cat.get(e.category_id.as_str()).map_or("", |c| c.name.as_str())),
            if has(Field::Weight) { s.weight.map_or(String::new(), |w| num(w_to_user(w, st.unit), 3)) } else { String::new() },
            if has(Field::Weight) { w_unit.to_string() } else { String::new() },
            if has(Field::Reps) { s.reps.map_or(String::new(), js_str) } else { String::new() },
            if has(Field::Distance) { s.distance.map_or(String::new(), |d| num(d_to_user(d, st.dist), 3)) } else { String::new() },
            if has(Field::Distance) { d_unit.to_string() } else { String::new() },
            if has(Field::Time) { s.time.map_or(String::new(), fmt_time) } else { String::new() },
            safe_text(s.comment.as_deref().unwrap_or("")),
            if has(Field::Reps) { s.rir.map_or(String::new(), js_str) } else { String::new() },
            if has(Field::Reps) && s.after.unwrap_or(0.0) > 0.0 { js_str(s.after.unwrap()) } else { String::new() },
            if has(Field::Reps) && s.warmup == Some(true) { "yes".to_string() } else { String::new() },
        ];
        lines.push(cells.iter().map(|c| csv_escape(c)).collect::<Vec<_>>().join(","));
    }
    lines.join("\r\n") + "\r\n"
}

/// "1:02:03", "02:03", "123" (seconds) → seconds; empty/invalid → None.
fn parse_duration(v: &str) -> Option<f64> {
    let s = js_trim(v);
    if s.is_empty() {
        return None;
    }
    let parts: Vec<f64> = s.split(':').map(|p| js_number(Some(p))).collect();
    if parts.iter().any(|n| !n.is_finite() || *n < 0.0) {
        return None;
    }
    Some(js_round(parts.iter().fold(0.0, |a, n| a * 60.0 + n)))
}

/// `^\d{1,3}(,\d{3})+(\.\d+)?$` — a number with thousands separators.
fn thousands(t: &str) -> bool {
    let (int, frac) = match t.split_once('.') {
        Some((i, f)) => (i, Some(f)),
        None => (t, None),
    };
    if frac.is_some_and(|f| f.is_empty() || !f.bytes().all(|b| b.is_ascii_digit())) {
        return false;
    }
    let groups: Vec<&str> = int.split(',').collect();
    groups.len() >= 2
        && (1..=3).contains(&groups[0].len())
        && groups.iter().all(|g| g.bytes().all(|b| b.is_ascii_digit()))
        && groups[1..].iter().all(|g| g.len() == 3)
}

fn parse_num(v: &str) -> Option<f64> {
    let t = js_trim(v);
    if t.is_empty() {
        return None;
    }
    let n = js_number(Some(&if thousands(t) { t.replace(',', "") } else { t.replacen(',', ".", 1) }));
    (n.is_finite() && n >= 0.0).then_some(n)
}

/// Weight in a unit word (kgs, kg, lbs, lb) → kg.
fn to_kg(v: f64, unit: &str) -> f64 {
    if js_trim(unit).to_lowercase().starts_with("lb") { v * KG_PER_LB } else { v }
}

/// Distance in a unit word (km, mi, miles, m, metres, ft, yd) → km.
fn to_km(v: f64, unit: &str) -> f64 {
    let u = js_trim(unit).to_lowercase();
    if u.starts_with("mi") {
        v * KM_PER_MI
    } else if u == "m" || u.starts_with("met") {
        v / 1000.0
    } else if u.starts_with("ft") || u.starts_with("feet") {
        (v * 0.3048) / 1000.0
    } else if u.starts_with("yd") || u.starts_with("yard") {
        (v * 0.9144) / 1000.0
    } else {
        v
    }
}

/// The exercise type that records exactly the fields that have values (weight and reps first).
pub fn infer_type(present: &HashSet<Field>) -> ExerciseType {
    use ExerciseType::*;
    let order = [Field::Weight, Field::Reps, Field::Distance, Field::Time];
    let f: Vec<Field> = order.iter().copied().filter(|x| present.contains(x)).collect();
    let prefs = [WeightReps, DistanceTime, WeightDistance, WeightTime, RepsDistance, RepsTime];
    for p in prefs {
        if p.fields().iter().all(|x| f.contains(x)) && f.iter().all(|x| p.fields().contains(x)) {
            return p;
        }
    }
    for p in prefs {
        if p.fields().iter().all(|x| f.contains(x)) {
            return p; // 3+ fields: the best pair
        }
    }
    match f.first() {
        Some(Field::Weight) => Weight,
        Some(Field::Reps) => Reps,
        Some(Field::Distance) => Distance,
        Some(Field::Time) => Time,
        None => WeightReps,
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ImportPlan {
    pub categories: Vec<Category>,
    pub exercises: Vec<Exercise>,
    pub sets: Vec<WorkoutSet>,
    /// Rows identical to a set already stored (same date, exercise and values): left out.
    pub duplicates: u32,
    /// Rows that couldn't be read (no date, no exercise, no values).
    pub skipped: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last: Option<String>,
    /// The file is Iron Notes' own export (it has the effort columns): Restore backup brings back far more.
    #[serde(rename = "ironNotes", skip_serializing_if = "Option::is_none")]
    pub iron_notes: Option<bool>,
}

fn key(s: &WorkoutSet) -> String {
    // `+ 0.0` turns -0 into 0 (JS toFixed prints "0.000").
    let fixed = |v: Option<f64>, d: usize| v.map_or(String::new(), |v| format!("{:.d$}", v + 0.0));
    let opt = |v: Option<f64>| v.map_or(String::new(), js_str);
    [s.date.clone(), s.exercise_id.clone(), fixed(s.weight, 3), opt(s.reps), fixed(s.distance, 4), opt(s.time)].join("|")
}

/// `name` or `name (…)` (a header with its unit).
fn head_is(h: &str, name: &str) -> bool {
    h == name || h.strip_prefix(name).and_then(|r| r.strip_prefix(" (")).is_some_and(|r| r.ends_with(')'))
}

/// The text between the first "(" and the last ")" of a header.
fn head_unit(h: &str) -> String {
    match (h.find('('), h.rfind(')')) {
        (Some(a), Some(b)) if a < b => h[a + 1..b].to_string(),
        _ => String::new(),
    }
}

struct Row {
    date: String,
    name: String,
    cat: String,
    weight: Option<f64>,
    reps: Option<f64>,
    distance: Option<f64>,
    time: Option<f64>,
    comment: Option<String>,
    rir: Option<f64>,
    after: Option<f64>,
    warmup: bool,
}

impl Row {
    fn get(&self, f: Field) -> Option<f64> {
        match f {
            Field::Weight => self.weight,
            Field::Reps => self.reps,
            Field::Distance => self.distance,
            Field::Time => self.time,
        }
    }
}

/// What importing a FitNotes CSV would add: new categories and exercises (matched by name, case-
/// insensitive) and the sets, minus duplicates of the stored ones. Err if it isn't such a file.
/// `id` makes new ids (`seed::uid` in the app); sets get orders `start_order`, +1, +2…
pub fn plan_import(
    text: &str,
    categories: &[Category],
    exercises: &[Exercise],
    sets: &[WorkoutSet],
    start_order: f64,
    id: &mut dyn FnMut() -> String,
) -> Result<ImportPlan, String> {
    let rows = parse_csv(text.strip_prefix('\u{FEFF}').unwrap_or(text));
    if rows.is_empty() {
        return Err("Empty file".into());
    }
    let head: Vec<String> = rows[0].iter().map(|h| js_trim(h).to_lowercase()).collect();
    let col = |f: &dyn Fn(&str) -> bool| head.iter().position(|h| f(h));
    let c_date = col(&|h| h == "date");
    let c_exercise = col(&|h| h == "exercise" || h == "exercise name");
    let c_category = col(&|h| h == "category");
    let c_weight = col(&|h| head_is(h, "weight"));
    let c_weight_unit = col(&|h| h == "weight unit");
    let c_reps = col(&|h| h == "reps");
    let c_distance = col(&|h| head_is(h, "distance"));
    let c_distance_unit = col(&|h| h == "distance unit");
    let c_time = col(&|h| head_is(h, "time") || head_is(h, "duration"));
    let c_comment = col(&|h| matches!(h, "comment" | "note" | "notes"));
    let c_rir = col(&|h| h == "rir");
    let c_after = col(&|h| h == "after failure");
    let c_warmup = col(&|h| h == "warm-up" || h == "warmup");
    let (Some(c_date), Some(c_exercise)) = (c_date, c_exercise) else {
        return Err("Not a FitNotes CSV (needs Date and Exercise columns)".into());
    };
    // A unit in the header ("Weight (lbs)") applies to every row without a unit column.
    let w_head = c_weight.map_or(String::new(), |i| head_unit(&head[i]));
    let d_head = c_distance.map_or(String::new(), |i| head_unit(&head[i]));
    let cell = |r: &[String], i: Option<usize>| -> String { i.and_then(|i| r.get(i)).cloned().unwrap_or_default() };

    let mut cats: HashMap<String, Category> = categories.iter().map(|x| (x.name.to_lowercase(), x.clone())).collect();
    let mut exs: HashMap<String, Exercise> = exercises.iter().map(|x| (x.name.to_lowercase(), x.clone())).collect();
    let mut new_cats: Vec<Category> = Vec::new();
    let mut cat_order = categories.iter().fold(-1.0f64, |a, x| a.max(x.order)) + 1.0;

    // First pass: read rows; collect which fields each new exercise uses (to choose its type).
    let mut read: Vec<Row> = Vec::new();
    let mut present: HashMap<String, HashSet<Field>> = HashMap::new();
    let mut skipped = 0u32;
    for r in &rows[1..] {
        let date: String = js_trim(&cell(r, Some(c_date))).chars().take(10).collect();
        let name = unsafe_text(js_trim(&cell(r, Some(c_exercise))));
        let b = date.as_bytes();
        let date_ok = b.len() == 10 && b.iter().enumerate().all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() });
        if !date_ok || name.is_empty() {
            skipped += 1;
            continue;
        }
        let w = parse_num(&cell(r, c_weight));
        let reps = parse_num(&cell(r, c_reps));
        let dist = parse_num(&cell(r, c_distance));
        let row = Row {
            date,
            name,
            cat: if c_category.is_some() { unsafe_text(js_trim(&cell(r, c_category))) } else { String::new() },
            weight: w.map(|w| to_kg(w, &if c_weight_unit.is_some() { cell(r, c_weight_unit) } else { w_head.clone() })),
            reps: reps.map(js_round),
            distance: dist.map(|d| to_km(d, &if c_distance_unit.is_some() { cell(r, c_distance_unit) } else { d_head.clone() })),
            time: if c_time.is_some() { parse_duration(&cell(r, c_time)) } else { None },
            comment: if c_comment.is_some() { Some(unsafe_text(js_trim(&cell(r, c_comment)))).filter(|c| !c.is_empty()) } else { None },
            rir: if c_rir.is_some() { parse_num(&cell(r, c_rir)).map(js_round) } else { None },
            after: if c_after.is_some() { parse_num(&cell(r, c_after)).filter(|a| *a > 0.0).map(js_round) } else { None },
            warmup: c_warmup.is_some() && matches!(js_trim(&cell(r, c_warmup)).to_lowercase().as_str(), "yes" | "true" | "1" | "x"),
        };
        let vals: Vec<Field> = [Field::Weight, Field::Reps, Field::Distance, Field::Time].into_iter().filter(|f| row.get(*f).unwrap_or(0.0) > 0.0).collect();
        if vals.is_empty() {
            skipped += 1;
            continue;
        }
        present.entry(row.name.to_lowercase()).or_default().extend(vals);
        read.push(row);
    }

    let mut new_exs: Vec<Exercise> = Vec::new();
    // Stored sets as a multiset: three identical sets in the file over two stored add one.
    let mut have: HashMap<String, u32> = HashMap::new();
    for s in sets {
        *have.entry(key(s)).or_insert(0) += 1;
    }
    let mut out: Vec<WorkoutSet> = Vec::new();
    let mut duplicates = 0u32;
    let mut order = start_order;
    for row in &read {
        let k = row.name.to_lowercase();
        let ex = match exs.get(&k) {
            Some(e) => e.clone(),
            None => {
                let cat_name = if row.cat.is_empty() { "Imported".to_string() } else { row.cat.clone() };
                let cat = match cats.get(&cat_name.to_lowercase()) {
                    Some(c) => c.clone(),
                    None => {
                        let c = Category { id: id(), name: cat_name.clone(), color: COLORS[((cat_order as usize) + new_cats.len()) % COLORS.len()].to_string(), order: cat_order, rest: None };
                        cat_order += 1.0;
                        cats.insert(cat_name.to_lowercase(), c.clone());
                        new_cats.push(c.clone());
                        c
                    }
                };
                let e = Exercise { id: id(), name: row.name.clone(), category_id: cat.id, kind: infer_type(&present[&k]), ..Default::default() };
                exs.insert(k, e.clone());
                new_exs.push(e.clone());
                e
            }
        };
        let mut s = WorkoutSet { id: id(), date: row.date.clone(), exercise_id: ex.id.clone(), order, comment: row.comment.clone(), ..Default::default() };
        order += 1.0;
        for f in ex.kind.fields() {
            if let Some(v) = row.get(*f) {
                match f {
                    Field::Weight => s.weight = Some(js_round(v * 1000.0) / 1000.0),
                    Field::Reps => s.reps = Some(v),
                    Field::Distance => s.distance = Some(v),
                    Field::Time => s.time = Some(v),
                }
            }
        }
        // The effort, for exercises with reps (what effective reps are counted from).
        if ex.kind.fields().contains(&Field::Reps) {
            if row.rir.is_some() {
                s.rir = row.rir;
            }
            if row.after.is_some() {
                s.after = row.after;
            }
            if row.warmup {
                s.warmup = Some(true);
            }
        }
        if !ex.kind.fields().iter().any(|f| s.field(*f).unwrap_or(0.0) > 0.0) {
            skipped += 1; // e.g. a time-only row for an existing reps exercise: nothing it records
            continue;
        }
        if let Some(left) = have.get_mut(&key(&s)) {
            if *left > 0 {
                *left -= 1;
                duplicates += 1;
                continue;
            }
        }
        out.push(s);
    }
    let mut dates: Vec<&String> = out.iter().map(|s| &s.date).collect();
    dates.sort();
    let (first, last) = (dates.first().map(|d| (*d).clone()), dates.last().map(|d| (*d).clone()));
    let iron_notes = if c_warmup.is_some() && c_rir.is_some() { Some(true) } else { None };
    Ok(ImportPlan { categories: new_cats, exercises: new_exs, sets: out, duplicates, skipped, first, last, iron_notes })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_and_formula_guard() {
        assert_eq!(csv_escape("a,b"), "\"a,b\"");
        assert_eq!(csv_escape("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(safe_text("=SUM(A1)"), "'=SUM(A1)");
        assert_eq!(unsafe_text("'=SUM(A1)"), "=SUM(A1)");
        assert_eq!(unsafe_text("'quoted"), "'quoted");
    }

    #[test]
    fn parses_quotes_newlines_and_blank_lines() {
        let rows = parse_csv("a,\"b\nc\",\"d\"\"e\"\r\n\r\n,,\r\nx,y");
        assert_eq!(rows, vec![vec!["a", "b\nc", "d\"e"], vec!["x", "y"]]);
    }

    #[test]
    fn thousands_separators() {
        assert_eq!(parse_num("1,234.5"), Some(1234.5));
        assert_eq!(parse_num("82,5"), Some(82.5));
        assert_eq!(parse_num("-3"), None);
        assert_eq!(parse_num(""), None);
    }
}
