//! The SQLite store: what src/lib/db.ts does with IndexedDB.
//!
//! Document-style tables: every record is kept as its JSON text (`data`) next to the key columns the
//! queries need, so records round-trip exactly (backups stay lossless) and a new optional field needs
//! no migration. `meta` is the device-sync change log, written by every write like db.ts `stamp`.

use std::fmt;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, Params, Transaction};
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::model::{
    Backup, BodyMetric, BodyMetricEntry, Category, DayComment, Exercise, Routine, Settings, WorkoutSet,
};

/// The newest schema version `migrate` knows (`PRAGMA user_version`).
pub const SCHEMA_VERSION: i32 = 1;

#[derive(Debug, Clone, PartialEq)]
pub enum StoreError {
    Sqlite(String),
    Json(String),
    Invalid(String),
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(e) => write!(f, "database error: {e}"),
            Self::Json(e) => write!(f, "JSON error: {e}"),
            Self::Invalid(e) => write!(f, "invalid: {e}"),
        }
    }
}
impl std::error::Error for StoreError {}
impl From<rusqlite::Error> for StoreError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Sqlite(e.to_string())
    }
}
impl From<serde_json::Error> for StoreError {
    fn from(e: serde_json::Error) -> Self {
        Self::Json(e.to_string())
    }
}

type Result<T> = std::result::Result<T, StoreError>;

static LAST_MT: Mutex<u64> = Mutex::new(0);

/// A change time in ms since the epoch, strictly increasing within the process (db.ts `changeTime`):
/// two writes in one millisecond stay ordered.
pub fn change_time() -> f64 {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    let mut last = LAST_MT.lock().unwrap_or_else(|e| e.into_inner());
    *last = (*last + 1).max(now);
    *last as f64
}

/// db.ts `metaKey`: `<store>:<key>`.
pub fn meta_key(store: &str, key: &str) -> String {
    format!("{store}:{key}")
}

const SCHEMA_V1: &str = "
CREATE TABLE categories (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE exercises (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE routines (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE metrics (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE sets (id TEXT PRIMARY KEY, date TEXT NOT NULL, exercise_id TEXT NOT NULL, ord REAL NOT NULL, data TEXT NOT NULL);
CREATE INDEX sets_date ON sets (date);
CREATE INDEX sets_exercise ON sets (exercise_id, date, ord);
CREATE TABLE body (id TEXT PRIMARY KEY, metric_id TEXT NOT NULL, date TEXT NOT NULL, at REAL NOT NULL, data TEXT NOT NULL);
CREATE INDEX body_metric ON body (metric_id, date, at);
CREATE TABLE comments (date TEXT PRIMARY KEY, text TEXT NOT NULL);
CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE meta (key TEXT PRIMARY KEY, mt REAL NOT NULL, del INTEGER NOT NULL DEFAULT 0);
CREATE INDEX meta_mt ON meta (mt);
";

/// Every table `import_backup` clears.
const ALL_TABLES: [&str; 9] = ["categories", "exercises", "routines", "metrics", "sets", "body", "comments", "kv", "meta"];

/// Brings the schema up to `SCHEMA_VERSION`, one step per version (later versions add `if v < 2 {…}`).
fn migrate(conn: &Connection) -> Result<()> {
    let v: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if v > SCHEMA_VERSION {
        return Err(StoreError::Invalid(format!("database version {v} is newer than this app ({SCHEMA_VERSION})")));
    }
    if v < SCHEMA_VERSION {
        let tx = conn.unchecked_transaction()?;
        if v < 1 {
            tx.execute_batch(SCHEMA_V1)?;
        }
        tx.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION}"))?;
        tx.commit()?;
    }
    Ok(())
}

pub struct Store {
    conn: Connection,
}

fn stamp(tx: &Transaction, store: &str, key: &str, del: bool) -> Result<()> {
    tx.prepare_cached("INSERT INTO meta (key, mt, del) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET mt = excluded.mt, del = excluded.del")?
        .execute(params![meta_key(store, key), change_time(), del as i64])?;
    Ok(())
}

/// Upserts a document row that has only `id` + `data`.
fn put_doc<T: Serialize>(tx: &Transaction, table: &str, id: &str, rec: &T) -> Result<()> {
    tx.prepare_cached(&format!("INSERT INTO {table} (id, data) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET data = excluded.data"))?
        .execute(params![id, serde_json::to_string(rec)?])?;
    stamp(tx, table, id, false)
}

fn del_doc(tx: &Transaction, table: &str, id: &str) -> Result<()> {
    tx.prepare_cached(&format!("DELETE FROM {table} WHERE id = ?1"))?.execute([id])?;
    stamp(tx, table, id, true)
}

fn put_set_row(tx: &Transaction, s: &WorkoutSet) -> Result<()> {
    tx.prepare_cached(
        "INSERT INTO sets (id, date, exercise_id, ord, data) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET date = excluded.date, exercise_id = excluded.exercise_id, ord = excluded.ord, data = excluded.data",
    )?
    .execute(params![s.id, s.date, s.exercise_id, s.order, serde_json::to_string(s)?])?;
    stamp(tx, "sets", &s.id, false)
}

fn put_entry_row(tx: &Transaction, e: &BodyMetricEntry) -> Result<()> {
    tx.prepare_cached(
        "INSERT INTO body (id, metric_id, date, at, data) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET metric_id = excluded.metric_id, date = excluded.date, at = excluded.at, data = excluded.data",
    )?
    .execute(params![e.id, e.metric_id, e.date, e.at, serde_json::to_string(e)?])?;
    stamp(tx, "body", &e.id, false)
}

fn put_comment_row(tx: &Transaction, c: &DayComment) -> Result<()> {
    tx.prepare_cached("INSERT INTO comments (date, text) VALUES (?1, ?2) ON CONFLICT(date) DO UPDATE SET text = excluded.text")?
        .execute(params![c.date, c.text])?;
    stamp(tx, "comments", &c.date, false)
}

/// A kv row. Not stamped in the change log: only `settings` syncs (callers stamp "kv:settings"); the
/// one-time flags (`seeded`, `bodySeeded`) are this device's own.
fn put_kv(tx: &Transaction, key: &str, value: &serde_json::Value) -> Result<()> {
    tx.prepare_cached("INSERT INTO kv (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")?
        .execute(params![key, value.to_string()])?;
    Ok(())
}

fn ids_where(tx: &Transaction, sql: &str, key: &str) -> Result<Vec<String>> {
    let mut st = tx.prepare_cached(sql)?;
    let rows = st.query_map([key], |r| r.get(0))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

impl Store {
    /// Opens (creating and migrating) the database file.
    pub fn open(path: &str) -> Result<Store> {
        Self::init(Connection::open(path)?)
    }

    pub fn open_in_memory() -> Result<Store> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Store> {
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=OFF;")?;
        migrate(&conn)?;
        // Change times continue after the newest stored one, even if the clock went back since.
        let newest: Option<f64> = conn.query_row("SELECT MAX(mt) FROM meta", [], |r| r.get(0))?;
        if let Some(mt) = newest {
            let mut last = LAST_MT.lock().unwrap_or_else(|e| e.into_inner());
            *last = (*last).max(mt as u64);
        }
        Ok(Store { conn })
    }

    /// The schema version stored in the file.
    pub fn schema_version(&self) -> Result<i32> {
        Ok(self.conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
    }

    fn tx(&self) -> Result<Transaction<'_>> {
        Ok(self.conn.unchecked_transaction()?)
    }

    fn docs<T: DeserializeOwned, P: Params>(&self, sql: &str, p: P) -> Result<Vec<T>> {
        let mut st = self.conn.prepare_cached(sql)?;
        let rows = st.query_map(p, |r| r.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            let row = row?;
            out.push(serde_json::from_str(&row).map_err(|e| {
                // Which table and record, so a bug report can point at it.
                let table = sql.split_whitespace().skip_while(|w| !w.eq_ignore_ascii_case("FROM")).nth(1).unwrap_or("?");
                let head: String = row.chars().take(80).collect();
                StoreError::Json(format!("{table}: unreadable record {head}: {e}"))
            })?);
        }
        Ok(out)
    }

    fn strings<P: Params>(&self, sql: &str, p: P) -> Result<Vec<String>> {
        let mut st = self.conn.prepare_cached(sql)?;
        let rows = st.query_map(p, |r| r.get::<_, String>(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    fn kv(&self, key: &str) -> Result<Option<String>> {
        let mut st = self.conn.prepare_cached("SELECT value FROM kv WHERE key = ?1")?;
        let mut rows = st.query([key])?;
        Ok(match rows.next()? {
            Some(r) => Some(r.get(0)?),
            None => None,
        })
    }

    // ---- Settings ----

    /// The stored settings, cleaned like a backup's (backup.ts `cleanSettings`): a partial, older or
    /// damaged row gets the defaults for what it lacks or has wrong — settings never stop the app opening.
    pub fn settings(&self) -> Result<Settings> {
        let raw = self.kv("settings")?;
        let v: Option<serde_json::Value> = raw.as_deref().and_then(|r| serde_json::from_str(r).ok());
        Ok(crate::backup::clean_settings(v.as_ref()))
    }

    pub fn put_settings(&self, s: &Settings) -> Result<()> {
        let tx = self.tx()?;
        put_kv(&tx, "settings", &serde_json::to_value(s)?)?;
        stamp(&tx, "kv", "settings", false)?;
        Ok(tx.commit()?)
    }

    // ---- Library ----

    pub fn categories(&self) -> Result<Vec<Category>> {
        self.docs("SELECT data FROM categories ORDER BY rowid", [])
    }
    pub fn put_category(&self, c: &Category) -> Result<()> {
        let tx = self.tx()?;
        put_doc(&tx, "categories", &c.id, c)?;
        Ok(tx.commit()?)
    }
    /// Does not touch the category's exercises (as db.ts).
    pub fn delete_category(&self, id: &str) -> Result<()> {
        let tx = self.tx()?;
        del_doc(&tx, "categories", id)?;
        Ok(tx.commit()?)
    }
    pub fn exercises(&self) -> Result<Vec<Exercise>> {
        self.docs("SELECT data FROM exercises ORDER BY rowid", [])
    }
    pub fn put_exercise(&self, e: &Exercise) -> Result<()> {
        let tx = self.tx()?;
        put_doc(&tx, "exercises", &e.id, e)?;
        Ok(tx.commit()?)
    }
    /// Deletes the exercise AND every set logged for it, each with a tombstone (as db.ts `deleteExercise`).
    pub fn delete_exercise(&self, id: &str) -> Result<()> {
        let tx = self.tx()?;
        for sid in ids_where(&tx, "SELECT id FROM sets WHERE exercise_id = ?1", id)? {
            del_doc(&tx, "sets", &sid)?;
        }
        del_doc(&tx, "exercises", id)?;
        Ok(tx.commit()?)
    }

    // ---- Sets ----

    pub fn sets_on(&self, date: &str) -> Result<Vec<WorkoutSet>> {
        self.docs("SELECT data FROM sets WHERE date = ?1 ORDER BY ord, rowid", [date])
    }
    pub fn sets_of(&self, exercise_id: &str) -> Result<Vec<WorkoutSet>> {
        self.docs("SELECT data FROM sets WHERE exercise_id = ?1 ORDER BY date, ord, rowid", [exercise_id])
    }
    /// Sets from `from` to `to` inclusive, by date then order.
    pub fn sets_between(&self, from: &str, to: &str) -> Result<Vec<WorkoutSet>> {
        self.docs("SELECT data FROM sets WHERE date BETWEEN ?1 AND ?2 ORDER BY date, ord, rowid", [from, to])
    }
    pub fn put_set(&self, s: &WorkoutSet) -> Result<()> {
        self.put_sets(std::slice::from_ref(s))
    }
    /// Several sets in one transaction (copy a workout, reorder, import).
    pub fn put_sets(&self, sets: &[WorkoutSet]) -> Result<()> {
        let tx = self.tx()?;
        for s in sets {
            put_set_row(&tx, s)?;
        }
        Ok(tx.commit()?)
    }
    pub fn delete_set(&self, id: &str) -> Result<()> {
        self.delete_sets(&[id])
    }
    pub fn delete_sets<S: AsRef<str>>(&self, ids: &[S]) -> Result<()> {
        let tx = self.tx()?;
        for id in ids {
            del_doc(&tx, "sets", id.as_ref())?;
        }
        Ok(tx.commit()?)
    }
    /// The distinct dates with sets from `from` to `to` inclusive, sorted (the calendar).
    pub fn dates_with_sets(&self, from: &str, to: &str) -> Result<Vec<String>> {
        self.strings("SELECT DISTINCT date FROM sets WHERE date BETWEEN ?1 AND ?2 ORDER BY date", [from, to])
    }
    /// The exercises logged on a date, in the order of their first set.
    pub fn exercise_ids_on(&self, date: &str) -> Result<Vec<String>> {
        self.strings("SELECT exercise_id FROM sets WHERE date = ?1 GROUP BY exercise_id ORDER BY MIN(ord)", [date])
    }

    // ---- Routines ----

    pub fn routines(&self) -> Result<Vec<Routine>> {
        self.docs("SELECT data FROM routines ORDER BY rowid", [])
    }
    pub fn put_routine(&self, r: &Routine) -> Result<()> {
        let tx = self.tx()?;
        put_doc(&tx, "routines", &r.id, r)?;
        Ok(tx.commit()?)
    }
    pub fn delete_routine(&self, id: &str) -> Result<()> {
        let tx = self.tx()?;
        del_doc(&tx, "routines", id)?;
        Ok(tx.commit()?)
    }

    // ---- Body measures ----

    pub fn metrics(&self) -> Result<Vec<BodyMetric>> {
        self.docs("SELECT data FROM metrics ORDER BY rowid", [])
    }
    pub fn put_metrics(&self, list: &[BodyMetric]) -> Result<()> {
        let tx = self.tx()?;
        for m in list {
            put_doc(&tx, "metrics", &m.id, m)?;
        }
        Ok(tx.commit()?)
    }
    /// Deletes a measure and all its entries (as db.ts `deleteMetric`).
    pub fn delete_metric(&self, id: &str) -> Result<()> {
        let tx = self.tx()?;
        for eid in ids_where(&tx, "SELECT id FROM body WHERE metric_id = ?1", id)? {
            del_doc(&tx, "body", &eid)?;
        }
        del_doc(&tx, "metrics", id)?;
        Ok(tx.commit()?)
    }
    /// A measure's entries, by date then entry time.
    pub fn body_of(&self, metric_id: &str) -> Result<Vec<BodyMetricEntry>> {
        self.docs("SELECT data FROM body WHERE metric_id = ?1 ORDER BY date, at, rowid", [metric_id])
    }
    pub fn put_entry(&self, e: &BodyMetricEntry) -> Result<()> {
        let tx = self.tx()?;
        put_entry_row(&tx, e)?;
        Ok(tx.commit()?)
    }
    pub fn delete_entry(&self, id: &str) -> Result<()> {
        let tx = self.tx()?;
        del_doc(&tx, "body", id)?;
        Ok(tx.commit()?)
    }

    // ---- Comments ----

    pub fn comments(&self) -> Result<Vec<DayComment>> {
        let mut st = self.conn.prepare_cached("SELECT date, text FROM comments ORDER BY rowid")?;
        let rows = st.query_map([], |r| Ok(DayComment { date: r.get(0)?, text: r.get(1)? }))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }
    pub fn comment(&self, date: &str) -> Result<Option<String>> {
        let mut st = self.conn.prepare_cached("SELECT text FROM comments WHERE date = ?1")?;
        let mut rows = st.query([date])?;
        Ok(match rows.next()? {
            Some(r) => Some(r.get(0)?),
            None => None,
        })
    }
    /// Saves the trimmed text; empty deletes the comment (tombstone), and empty over no comment is a no-op
    /// (no tombstone filling the log) — as db.ts `putComment`.
    pub fn put_comment(&self, date: &str, text: &str) -> Result<()> {
        let t = text.trim();
        let tx = self.tx()?;
        if t.is_empty() {
            let had = tx.prepare_cached("DELETE FROM comments WHERE date = ?1")?.execute([date])? > 0;
            if !had {
                return Ok(());
            }
            stamp(&tx, "comments", date, true)?;
        } else {
            put_comment_row(&tx, &DayComment { date: date.into(), text: t.into() })?;
        }
        Ok(tx.commit()?)
    }

    // ---- Flags ----

    fn flag(&self, key: &str) -> Result<bool> {
        Ok(self.kv(key)?.is_some())
    }
    fn set_flag(&self, key: &str) -> Result<()> {
        let tx = self.tx()?;
        put_kv(&tx, key, &serde_json::Value::Bool(true))?;
        Ok(tx.commit()?)
    }
    /// First start (state.ts / body-state.ts): the starter library and body measures written once, with
    /// their flags, in ONE transaction — a kill half-way leaves nothing, so the next start seeds again.
    /// `library`/`metrics` are None when that part is already seeded (or the user has their own data).
    pub fn seed(&self, library: Option<(&[Category], &[Exercise])>, metrics: Option<&[BodyMetric]>) -> Result<()> {
        let tx = self.tx()?;
        if let Some((cats, exs)) = library {
            for c in cats {
                put_doc(&tx, "categories", &c.id, c)?;
            }
            for e in exs {
                put_doc(&tx, "exercises", &e.id, e)?;
            }
            put_kv(&tx, "seeded", &serde_json::Value::Bool(true))?;
        }
        if let Some(list) = metrics {
            for m in list {
                put_doc(&tx, "metrics", &m.id, m)?;
            }
            put_kv(&tx, "bodySeeded", &serde_json::Value::Bool(true))?;
        }
        Ok(tx.commit()?)
    }

    pub fn is_seeded(&self) -> Result<bool> {
        self.flag("seeded")
    }
    pub fn set_seeded(&self) -> Result<()> {
        self.set_flag("seeded")
    }
    pub fn is_body_seeded(&self) -> Result<bool> {
        self.flag("bodySeeded")
    }
    pub fn set_body_seeded(&self) -> Result<()> {
        self.set_flag("bodySeeded")
    }

    // ---- Backup ----

    /// Everything, in the web app's backup shape. `exported` is an ISO timestamp from the caller.
    pub fn export_backup(&self, exported: &str) -> Result<Backup> {
        Ok(Backup {
            app: "iron-notes".into(),
            version: 1,
            exported: exported.into(),
            categories: self.categories()?,
            exercises: self.exercises()?,
            sets: self.docs("SELECT data FROM sets ORDER BY rowid", [])?,
            comments: self.comments()?,
            settings: self.settings()?,
            routines: self.routines()?,
            metrics: self.metrics()?,
            body: self.docs("SELECT data FROM body ORDER BY rowid", [])?,
        })
    }

    pub fn export_backup_json(&self, exported: &str) -> Result<String> {
        Ok(serde_json::to_string(&self.export_backup(exported)?)?)
    }

    /// Replaces everything with the backup in ONE transaction (db.ts `importAll`): all tables cleared,
    /// all records written, settings, `seeded`, and `bodySeeded` only when the file had measures.
    pub fn import_backup(&self, b: &Backup, has_metrics: bool) -> Result<()> {
        let tx = self.tx()?;
        for t in ALL_TABLES {
            tx.execute(&format!("DELETE FROM {t}"), [])?;
        }
        for c in &b.categories {
            put_doc(&tx, "categories", &c.id, c)?;
        }
        for e in &b.exercises {
            put_doc(&tx, "exercises", &e.id, e)?;
        }
        for s in &b.sets {
            put_set_row(&tx, s)?;
        }
        for c in &b.comments {
            put_comment_row(&tx, c)?;
        }
        for r in &b.routines {
            put_doc(&tx, "routines", &r.id, r)?;
        }
        for m in &b.metrics {
            put_doc(&tx, "metrics", &m.id, m)?;
        }
        for e in &b.body {
            put_entry_row(&tx, e)?;
        }
        put_kv(&tx, "settings", &serde_json::to_value(&b.settings)?)?;
        stamp(&tx, "kv", "settings", false)?;
        put_kv(&tx, "seeded", &serde_json::Value::Bool(true))?;
        if has_metrics {
            put_kv(&tx, "bodySeeded", &serde_json::Value::Bool(true))?;
        }
        Ok(tx.commit()?)
    }

    /// Restores a backup file's text. Nothing changes unless it parses and validates.
    pub fn import_backup_json(&self, json: &str) -> Result<()> {
        let v: serde_json::Value = serde_json::from_str(json)?;
        let has_metrics = v.get("metrics").is_some_and(|m| m.is_array());
        let b = crate::backup::validate_backup(&v).map_err(StoreError::Invalid)?;
        self.import_backup(&b, has_metrics)
    }

    // ---- Change log (device sync) ----

    /// `(key, change time, deleted)` of every record changed after `mt`, oldest first.
    pub fn changes_since(&self, mt: f64) -> Result<Vec<(String, f64, bool)>> {
        let mut st = self.conn.prepare_cached("SELECT key, mt, del FROM meta WHERE mt > ?1 ORDER BY mt")?;
        let rows = st.query_map([mt], |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?, r.get::<_, i64>(2)? != 0)))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::Instant;

    /// A fresh directory under the system's temp dir, removed when dropped.
    struct TmpDir(std::path::PathBuf);
    impl TmpDir {
        fn path(&self) -> &std::path::Path {
            &self.0
        }
        fn join(&self, name: &str) -> std::path::PathBuf {
            self.0.join(name)
        }
    }
    impl Drop for TmpDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn tmp_dir() -> TmpDir {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let d = std::env::temp_dir().join(format!("iron-core-store-{}-{n}-{}", std::process::id(), change_time()));
        std::fs::create_dir_all(&d).unwrap();
        TmpDir(d)
    }

    fn set(id: &str, date: &str, ex: &str, order: f64) -> WorkoutSet {
        WorkoutSet { id: id.into(), date: date.into(), exercise_id: ex.into(), order, weight: Some(60.0), reps: Some(8.0), ..Default::default() }
    }

    fn rich() -> Backup {
        serde_json::from_value(json!({
            "app": "iron-notes", "version": 1, "exported": "2026-01-01T00:00:00.000Z",
            "categories": [
                {"id": "c1", "name": "Chest", "color": "#aabbcc", "order": 0, "rest": 120},
                {"id": "c2", "name": "Legs", "color": "#112233", "order": 1}
            ],
            "exercises": [
                {"id": "e1", "name": "Bench", "categoryId": "c1", "type": "weight,reps", "notes": "pause", "increment": 2.5,
                 "repTop": 12, "repBottom": 6, "joint": true, "load": "perHand", "plates": true, "rest": 150, "favorite": true,
                 "muscles": {"primary": ["chest"], "secondary": ["triceps", "frontDelts"]}},
                {"id": "e2", "name": "Run", "categoryId": "c2", "type": "distance,time"}
            ],
            "sets": [
                {"id": "s1", "date": "2026-01-05", "exerciseId": "e1", "order": 2, "weight": 100, "reps": 5, "distance": 1.5, "time": 30,
                 "comment": "ok", "group": "A", "done": true, "planned": true, "rir": 2, "after": 1, "warmup": true, "deload": true, "sore": 2, "at": 1700000000000.0},
                {"id": "s2", "date": "2026-01-05", "exerciseId": "e1", "order": 1, "weight": 80, "reps": 8},
                {"id": "s3", "date": "2026-01-04", "exerciseId": "e2", "order": 1.5, "distance": 5, "time": 1500}
            ],
            "comments": [{"date": "2026-01-05", "text": "felt strong"}],
            "settings": {"mode": "lyle", "unit": "lb", "dist": "mi", "rest": 60, "autoTimer": false, "timerSound": false, "markDone": true,
                "formula": "brzycki", "weekStart": 0, "keepScreenOn": true,
                "plates": {"unit": "lb", "bar": 45, "sizes": [45, 35, 25, 10, 5, 2.5]},
                "cycle": {"start": "2026-01-01", "weeks": 8}, "light": {"start": "2026-01-02"},
                "program": {"routineId": "r1", "lastDayId": "d1", "weekdays": [1, 3, 5]},
                "diet": "cut", "restNotify": true, "roundPlates": true, "gymEnglish": true, "lang": "sv"},
            "routines": [{"id": "r1", "name": "PPL", "order": 0, "days": [
                {"id": "d1", "name": "Push", "items": [
                    {"exerciseId": "e1", "group": "ss1", "sets": [{"weight": 80, "reps": 8}, {"weight": 82.5, "reps": 6, "distance": 1, "time": 2}]},
                    {"exerciseId": "e2", "group": "ss1", "sets": [{"reps": 10}]}]}]}],
            "metrics": [{"id": "m1", "name": "Weight", "kind": "weight", "order": 0}, {"id": "m2", "name": "Waist", "kind": "length", "order": 1}],
            "body": [
                {"id": "b2", "metricId": "m1", "date": "2026-01-02", "value": 80.5, "at": 2},
                {"id": "b1", "metricId": "m1", "date": "2026-01-01", "value": 81, "at": 1},
                {"id": "b3", "metricId": "m2", "date": "2026-01-01", "value": 90, "at": 1}
            ]
        }))
        .unwrap()
    }

    #[test]
    fn round_trip_is_lossless() {
        let s = Store::open_in_memory().unwrap();
        let b = rich();
        s.import_backup(&b, true).unwrap();
        let out = s.export_backup("later").unwrap();
        assert_eq!(Backup { exported: b.exported.clone(), ..out }, b);
        // The JSON file has the web file's shape and parses back to the same value.
        let text = s.export_backup_json("x").unwrap();
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["app"], "iron-notes");
        assert_eq!(v["sets"][0]["exerciseId"], "e1");
        assert_eq!(serde_json::from_value::<Backup>(v).unwrap().sets, b.sets);
        assert!(s.is_seeded().unwrap() && s.is_body_seeded().unwrap());
    }

    #[test]
    fn import_without_metrics_leaves_body_unseeded() {
        let s = Store::open_in_memory().unwrap();
        s.import_backup(&rich(), false).unwrap();
        assert!(s.is_seeded().unwrap());
        assert!(!s.is_body_seeded().unwrap());
    }

    #[test]
    fn import_replaces_everything_and_stamps_meta() {
        let s = Store::open_in_memory().unwrap();
        s.import_backup(&rich(), true).unwrap();
        s.put_set(&set("old", "2025-01-01", "e9", 1.0)).unwrap();
        s.delete_set("s1").unwrap();
        let small = Backup {
            sets: vec![set("only", "2026-02-02", "e1", 1.0)],
            comments: vec![],
            routines: vec![],
            body: vec![],
            metrics: vec![],
            categories: vec![],
            exercises: vec![],
            ..rich()
        };
        s.import_backup(&small, true).unwrap();
        assert_eq!(s.sets_of("e9").unwrap().len(), 0);
        assert_eq!(s.sets_between("0000-00-00", "9999-99-99").unwrap().len(), 1);
        assert!(s.categories().unwrap().is_empty() && s.routines().unwrap().is_empty() && s.comment("2026-01-05").unwrap().is_none());
        let ch = s.changes_since(0.0).unwrap();
        // The old tombstone is gone; only "sets:only" and "kv:settings" remain.
        let mut keys: Vec<_> = ch.iter().map(|c| c.0.as_str()).collect();
        keys.sort();
        assert_eq!(keys, ["kv:settings", "sets:only"]);
        assert!(ch.iter().all(|c| !c.2));
    }

    #[test]
    fn failed_import_changes_nothing() {
        let s = Store::open_in_memory().unwrap();
        s.import_backup(&rich(), true).unwrap();
        let before = s.export_backup("x").unwrap();
        let log = s.changes_since(0.0).unwrap();
        assert!(matches!(s.import_backup_json("{ not json"), Err(StoreError::Json(_))));
        // Parses but is not a backup (the validator, whatever its state, must reject it).
        assert!(s.import_backup_json("{\"app\":\"other\"}").is_err());
        assert_eq!(s.export_backup("x").unwrap(), before);
        assert_eq!(s.changes_since(0.0).unwrap(), log);
    }

    #[test]
    fn import_is_one_transaction() {
        // A write failing midway (a table the import writes late is missing) rolls the whole import back,
        // including the clearing of the tables before it.
        let s = Store::open_in_memory().unwrap();
        s.import_backup(&rich(), true).unwrap();
        let before = s.export_backup("x").unwrap();
        s.conn.execute("DROP TABLE body", []).unwrap();
        assert!(s.import_backup(&Backup { sets: vec![], ..rich() }, true).is_err());
        s.conn
            .execute_batch("CREATE TABLE body (id TEXT PRIMARY KEY, metric_id TEXT NOT NULL, date TEXT NOT NULL, at REAL NOT NULL, data TEXT NOT NULL);")
            .unwrap();
        assert_eq!(s.export_backup("x").unwrap().sets, before.sets);
        assert_eq!(s.categories().unwrap(), before.categories);
    }

    #[test]
    fn set_queries_order_and_filter() {
        let s = Store::open_in_memory().unwrap();
        s.put_sets(&[
            set("a", "2026-03-02", "e1", 2.0),
            set("b", "2026-03-02", "e1", 1.0),
            set("c", "2026-03-02", "e2", 0.5),
            set("d", "2026-03-01", "e1", 9.0),
            set("e", "2026-04-01", "e3", 1.0),
        ])
        .unwrap();
        let ids = |v: Vec<WorkoutSet>| v.into_iter().map(|s| s.id).collect::<Vec<_>>();
        assert_eq!(ids(s.sets_on("2026-03-02").unwrap()), ["c", "b", "a"]);
        assert_eq!(ids(s.sets_of("e1").unwrap()), ["d", "b", "a"]);
        assert_eq!(ids(s.sets_between("2026-03-01", "2026-03-31").unwrap()), ["d", "c", "b", "a"]);
        assert_eq!(s.dates_with_sets("2026-03-01", "2026-04-30").unwrap(), ["2026-03-01", "2026-03-02", "2026-04-01"]);
        assert_eq!(s.dates_with_sets("2026-03-02", "2026-03-02").unwrap(), ["2026-03-02"]);
        assert_eq!(s.exercise_ids_on("2026-03-02").unwrap(), ["e2", "e1"]);
        assert!(s.sets_on("2000-01-01").unwrap().is_empty());
        // Updating a set moves it.
        s.put_set(&set("a", "2026-05-05", "e1", 1.0)).unwrap();
        assert_eq!(ids(s.sets_of("e1").unwrap()), ["d", "b", "a"]);
        assert_eq!(ids(s.sets_on("2026-05-05").unwrap()), ["a"]);
        s.delete_sets(&["a", "b"]).unwrap();
        assert_eq!(ids(s.sets_of("e1").unwrap()), ["d"]);
    }

    #[test]
    fn writes_stamp_meta_and_deletes_leave_tombstones() {
        let s = Store::open_in_memory().unwrap();
        let t0 = change_time();
        s.put_set(&set("a", "2026-03-02", "e1", 1.0)).unwrap();
        s.put_category(&Category { id: "c".into(), name: "C".into(), color: "#000000".into(), order: 0.0, rest: None }).unwrap();
        s.put_settings(&Settings::default()).unwrap();
        let ch = s.changes_since(t0).unwrap();
        let keys: Vec<_> = ch.iter().map(|c| c.0.clone()).collect();
        assert_eq!(keys, ["sets:a", "categories:c", "kv:settings"]);
        assert!(ch.windows(2).all(|w| w[0].1 < w[1].1), "strictly increasing");
        assert!(ch.iter().all(|c| !c.2));
        let t1 = ch[2].1;
        s.delete_set("a").unwrap();
        s.delete_category("c").unwrap();
        let ch = s.changes_since(t1).unwrap();
        assert_eq!(ch.iter().map(|c| (c.0.as_str(), c.2)).collect::<Vec<_>>(), [("sets:a", true), ("categories:c", true)]);
        assert!(s.sets_on("2026-03-02").unwrap().is_empty() && s.categories().unwrap().is_empty());
    }

    #[test]
    fn change_time_is_strictly_increasing() {
        let mut last = 0.0;
        for _ in 0..5000 {
            let t = change_time();
            assert!(t > last);
            last = t;
        }
    }

    #[test]
    fn delete_exercise_and_metric_cascade() {
        let s = Store::open_in_memory().unwrap();
        s.import_backup(&rich(), true).unwrap();
        s.delete_exercise("e1").unwrap();
        assert!(s.sets_of("e1").unwrap().is_empty());
        assert_eq!(s.exercises().unwrap().len(), 1);
        assert_eq!(s.sets_between("0", "9").unwrap().len(), 1);
        let ch = s.changes_since(0.0).unwrap();
        for k in ["sets:s1", "sets:s2", "exercises:e1"] {
            assert!(ch.iter().any(|c| c.0 == k && c.2), "{k} tombstoned");
        }
        s.delete_metric("m1").unwrap();
        assert!(s.body_of("m1").unwrap().is_empty());
        assert_eq!(s.body_of("m2").unwrap().len(), 1);
        assert!(s.changes_since(0.0).unwrap().iter().any(|c| c.0 == "body:b1" && c.2));
    }

    #[test]
    fn body_entries_are_ordered_by_date_then_time() {
        let s = Store::open_in_memory().unwrap();
        s.import_backup(&rich(), true).unwrap();
        let ids: Vec<_> = s.body_of("m1").unwrap().into_iter().map(|e| e.id).collect();
        assert_eq!(ids, ["b1", "b2"]);
        s.put_entry(&BodyMetricEntry { id: "b9".into(), metric_id: "m1".into(), date: "2026-01-02".into(), value: 1.0, at: 1.0 }).unwrap();
        let ids: Vec<_> = s.body_of("m1").unwrap().into_iter().map(|e| e.id).collect();
        assert_eq!(ids, ["b1", "b9", "b2"]);
        s.delete_entry("b9").unwrap();
        assert_eq!(s.body_of("m1").unwrap().len(), 2);
    }

    #[test]
    fn put_comment_rules() {
        let s = Store::open_in_memory().unwrap();
        // Empty over nothing: no row, no tombstone.
        s.put_comment("2026-01-01", "   ").unwrap();
        assert_eq!(s.comment("2026-01-01").unwrap(), None);
        assert!(s.changes_since(0.0).unwrap().is_empty());
        // Trimmed on save.
        s.put_comment("2026-01-01", "  hello \n").unwrap();
        assert_eq!(s.comment("2026-01-01").unwrap().as_deref(), Some("hello"));
        s.put_comment("2026-01-01", "again").unwrap();
        assert_eq!(s.comments().unwrap(), [DayComment { date: "2026-01-01".into(), text: "again".into() }]);
        // Empty over a comment deletes it, leaving a tombstone.
        s.put_comment("2026-01-01", "").unwrap();
        assert_eq!(s.comment("2026-01-01").unwrap(), None);
        assert_eq!(s.changes_since(0.0).unwrap().iter().map(|c| (c.0.as_str(), c.2)).collect::<Vec<_>>(), [("comments:2026-01-01", true)]);
    }

    #[test]
    fn settings_default_partial_and_flags() {
        let s = Store::open_in_memory().unwrap();
        assert_eq!(s.settings().unwrap(), Settings::default());
        assert!(!s.is_seeded().unwrap() && !s.is_body_seeded().unwrap());
        // An older/partial stored row gets the defaults for the rest.
        s.conn.execute("INSERT INTO kv (key, value) VALUES ('settings', '{\"unit\":\"lb\"}')", []).unwrap();
        let got = s.settings().unwrap();
        assert_eq!(got.unit, crate::units::WeightUnit::Lb);
        assert_eq!(got.rest, Settings::default().rest);
        s.set_seeded().unwrap();
        s.set_body_seeded().unwrap();
        assert!(s.is_seeded().unwrap() && s.is_body_seeded().unwrap());
    }

    #[test]
    fn library_routines_metrics_crud() {
        let s = Store::open_in_memory().unwrap();
        let b = rich();
        s.put_exercise(&b.exercises[0]).unwrap();
        s.put_exercise(&Exercise { name: "Bench 2".into(), ..b.exercises[0].clone() }).unwrap();
        assert_eq!(s.exercises().unwrap().len(), 1);
        assert_eq!(s.exercises().unwrap()[0].name, "Bench 2");
        s.put_routine(&b.routines[0]).unwrap();
        assert_eq!(s.routines().unwrap(), b.routines);
        s.delete_routine("r1").unwrap();
        assert!(s.routines().unwrap().is_empty());
        s.put_metrics(&b.metrics).unwrap();
        assert_eq!(s.metrics().unwrap(), b.metrics);
    }

    #[test]
    fn file_backed_database_reopens_with_data() {
        let dir = tmp_dir();
        let path = dir.join("reopen.db");
        for ext in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{ext}", path.display()));
        }
        let p = path.to_str().unwrap();
        {
            let s = Store::open(p).unwrap();
            s.import_backup(&rich(), true).unwrap();
            s.put_comment("2026-06-06", "later").unwrap();
        }
        let s = Store::open(p).unwrap();
        assert_eq!(s.schema_version().unwrap(), SCHEMA_VERSION);
        let out = s.export_backup("x").unwrap();
        assert_eq!(out.sets, rich().sets);
        assert_eq!(out.settings, rich().settings);
        assert_eq!(s.comment("2026-06-06").unwrap().as_deref(), Some("later"));
    }

    #[test]
    fn migration_sets_user_version_and_rejects_newer() {
        let s = Store::open_in_memory().unwrap();
        assert_eq!(s.schema_version().unwrap(), 1);
        // A newer database is refused, not mangled.
        let dir = tmp_dir();
        let path = dir.join("newer.db");
        for ext in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{ext}", path.display()));
        }
        {
            let c = Connection::open(&path).unwrap();
            c.execute_batch("PRAGMA user_version = 99").unwrap();
        }
        assert!(matches!(Store::open(path.to_str().unwrap()), Err(StoreError::Invalid(_))));
        // Re-running migrate on a current database is a no-op.
        migrate(&s.conn).unwrap();
        assert_eq!(s.schema_version().unwrap(), 1);
    }

    #[test]
    fn ten_thousand_sets_are_fast() {
        let s = Store::open_in_memory().unwrap();
        let sets: Vec<WorkoutSet> = (0..10_000)
            .map(|i| set(&format!("s{i}"), &format!("2025-{:02}-{:02}", i / 28 % 12 + 1, i % 28 + 1), &format!("e{}", i % 40), (i % 5) as f64))
            .collect();
        let b = Backup { sets, ..rich() };
        let t = Instant::now();
        s.import_backup(&b, true).unwrap();
        let import = t.elapsed();
        let t = Instant::now();
        let mine = s.sets_of("e7").unwrap();
        let q = t.elapsed();
        let t = Instant::now();
        let month = s.sets_between("2025-03-01", "2025-03-31").unwrap();
        let q2 = t.elapsed();
        println!("10k sets: import {import:?}, sets_of({} rows) {q:?}, month({} rows) {q2:?}", mine.len(), month.len());
        assert_eq!(mine.len(), 250);
        assert!(mine.windows(2).all(|w| (&w[0].date, w[0].order) <= (&w[1].date, w[1].order)));
        assert_eq!(s.export_backup("x").unwrap().sets.len(), 10_000);
        // Loose bounds (debug build, shared CI runners): ~0.2 s and ~1–5 ms here.
        assert!(import.as_secs_f64() < 10.0 && q.as_secs_f64() < 1.0 && q2.as_secs_f64() < 1.0, "too slow");
    }

    #[test]
    fn seeding_is_all_or_nothing() {
        let s = Store::open_in_memory().unwrap();
        let cats = vec![Category { id: "c".into(), name: "Chest".into(), color: "#aabbcc".into(), order: 0.0, rest: None }];
        let exs = vec![Exercise { id: "e".into(), name: "Bench".into(), category_id: "c".into(), ..Default::default() }];
        let ms = vec![BodyMetric { id: "m".into(), name: "Body weight".into(), kind: Default::default(), order: 0.0 }];
        // A failure half-way (here: the measures' table is gone) leaves no partial library and no flags.
        s.conn.execute_batch("ALTER TABLE metrics RENAME TO metrics_gone").unwrap();
        assert!(s.seed(Some((&cats, &exs)), Some(&ms)).is_err());
        assert!(s.categories().unwrap().is_empty() && s.exercises().unwrap().is_empty());
        assert!(!s.is_seeded().unwrap() && !s.is_body_seeded().unwrap());
        s.conn.execute_batch("ALTER TABLE metrics_gone RENAME TO metrics").unwrap();
        s.seed(Some((&cats, &exs)), Some(&ms)).unwrap();
        assert_eq!((s.categories().unwrap().len(), s.exercises().unwrap().len(), s.metrics().unwrap().len()), (1, 1, 1));
        assert!(s.is_seeded().unwrap() && s.is_body_seeded().unwrap());
    }

    #[test]
    fn damaged_settings_fall_back_to_defaults() {
        let s = Store::open_in_memory().unwrap();
        for raw in ["not json", r#"{"mode":"lyle","unit":42,"rest":-5}"#, "[]"] {
            let tx = s.tx().unwrap();
            tx.execute("INSERT OR REPLACE INTO kv (key, value) VALUES ('settings', ?1)", [raw]).unwrap();
            tx.commit().unwrap();
            let st = s.settings().unwrap();
            assert_eq!(st.unit, Settings::default().unit, "{raw}");
            assert_eq!(st.rest, 90.0, "{raw}");
        }
        assert_eq!(s.settings().unwrap(), Settings::default());
        let tx = s.tx().unwrap();
        tx.execute("INSERT OR REPLACE INTO kv (key, value) VALUES ('settings', ?1)", [r#"{"mode":"lyle","unit":42}"#]).unwrap();
        tx.commit().unwrap();
        assert_eq!(s.settings().unwrap().mode, crate::model::TrainingMode::Lyle); // the valid parts are kept
    }

    #[test]
    fn an_unreadable_row_names_its_table() {
        let s = Store::open_in_memory().unwrap();
        let tx = s.tx().unwrap();
        tx.execute("INSERT INTO exercises (id, data) VALUES ('x', '{\"id\":1}')", []).unwrap();
        tx.commit().unwrap();
        let e = s.exercises().unwrap_err().to_string();
        assert!(e.contains("exercises: unreadable record"), "{e}");
    }

    #[test]
    fn restore_leaves_no_tombstones_like_the_web() {
        // backup.ts importAll: the restored data becomes this device's newest; records only another
        // device has come back at the next sync — a restore deletes nothing elsewhere.
        let s = Store::open_in_memory().unwrap();
        s.put_set(&set("old", "2026-01-01", "e", 1.0)).unwrap();
        s.import_backup(&rich(), true).unwrap();
        let log = s.changes_since(0.0).unwrap();
        assert!(log.iter().all(|(k, _, del)| !del && k != "sets:old"));
        assert!(log.iter().any(|(k, _, _)| k == "kv:settings"));
    }

    #[test]
    fn change_times_continue_after_a_restart() {
        let dir = tmp_dir();
        let path = dir.join("clock.db");
        let p = path.to_str().unwrap();
        let ahead = change_time() + 3_600_000.0; // as if the clock went back an hour since
        {
            let s = Store::open(p).unwrap();
            let tx = s.tx().unwrap();
            tx.execute("INSERT INTO meta (key, mt, del) VALUES ('sets:x', ?1, 0)", [ahead]).unwrap();
            tx.commit().unwrap();
        }
        let s = Store::open(p).unwrap();
        s.put_set(&set("y", "2026-01-01", "e", 1.0)).unwrap();
        let mt = s.changes_since(0.0).unwrap().into_iter().find(|(k, _, _)| k == "sets:y").unwrap().1;
        assert!(mt > ahead);
        let _ = dir.path();
    }
}
