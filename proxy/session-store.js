/**
 * SQLite-backed session archive.
 *
 * Stores complete OpenF1 sessions locally so replay can run without hitting
 * the OpenF1 API (no rate limits, works offline). One row per OpenF1 record,
 * keyed by (session_key, topic) with a numeric timestamp for window queries.
 *
 * Completeness is tracked PER TOPIC (session_topics): a session recorded from
 * a live feed may lack topics (e.g. location, which OpenF1 doesn't deliver
 * live) — those get backfilled later by the downloader's verify pass.
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "data", "f1-sessions.db");

let db = null;

export function getDB() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_key INTEGER PRIMARY KEY,
      date_start TEXT NOT NULL,
      date_end TEXT,
      payload TEXT NOT NULL,
      complete INTEGER NOT NULL DEFAULT 0,
      downloaded_at TEXT
    );
    CREATE TABLE IF NOT EXISTS session_topics (
      session_key INTEGER NOT NULL,
      topic TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (session_key, topic)
    );
    CREATE TABLE IF NOT EXISTS session_events (
      session_key INTEGER NOT NULL,
      topic TEXT NOT NULL,
      ts INTEGER,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_lookup
      ON session_events (session_key, topic, ts);
  `);
  console.log(`[session-db] SQLite open at ${DB_PATH}`);
  return db;
}

export function getSessionMeta(sessionKey) {
  const row = getDB()
    .prepare(`SELECT * FROM sessions WHERE session_key = ?`)
    .get(sessionKey);
  if (!row) return null;
  return { ...row, payload: JSON.parse(row.payload) };
}

export function upsertSessionMeta(session) {
  getDB()
    .prepare(
      `INSERT INTO sessions (session_key, date_start, date_end, payload, complete)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(session_key) DO UPDATE SET
         date_start = excluded.date_start,
         date_end = excluded.date_end,
         payload = excluded.payload`,
    )
    .run(
      session.session_key,
      session.date_start,
      session.date_end || null,
      JSON.stringify(session),
    );
}

export function markComplete(sessionKey) {
  getDB()
    .prepare(
      `UPDATE sessions SET complete = 1, downloaded_at = ? WHERE session_key = ?`,
    )
    .run(new Date().toISOString(), sessionKey);
}

export function isComplete(sessionKey) {
  const row = getDB()
    .prepare(`SELECT complete FROM sessions WHERE session_key = ?`)
    .get(sessionKey);
  return row?.complete === 1;
}

// Replace all rows for one topic atomically. dateField is the row property
// holding the event timestamp (null for static topics like stints/drivers).
export function replaceTopic(sessionKey, topic, rows, dateField) {
  const database = getDB();
  const del = database.prepare(
    `DELETE FROM session_events WHERE session_key = ? AND topic = ?`,
  );
  const ins = database.prepare(
    `INSERT INTO session_events (session_key, topic, ts, payload) VALUES (?, ?, ?, ?)`,
  );
  const upsertTopic = database.prepare(
    `INSERT INTO session_topics (session_key, topic, row_count, attempts, updated_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(session_key, topic) DO UPDATE SET
       row_count = excluded.row_count,
       attempts = attempts + 1,
       updated_at = excluded.updated_at`,
  );
  database.transaction(() => {
    del.run(sessionKey, topic);
    for (const row of rows) {
      const raw = dateField ? row[dateField] : null;
      const ts = raw ? Date.parse(raw) : null;
      ins.run(sessionKey, topic, Number.isFinite(ts) ? ts : null, JSON.stringify(row));
    }
    upsertTopic.run(sessionKey, topic, rows.length, new Date().toISOString());
  })();
}

export function getTopicRows(sessionKey, topic) {
  return getDB()
    .prepare(
      `SELECT payload FROM session_events
       WHERE session_key = ? AND topic = ?
       ORDER BY ts ASC`,
    )
    .all(sessionKey, topic)
    .map((r) => JSON.parse(r.payload));
}

// Rows with start <= ts < end (Date objects or epoch ms)
export function getTopicWindow(sessionKey, topic, start, end) {
  const s = start instanceof Date ? start.getTime() : start;
  const e = end instanceof Date ? end.getTime() : end;
  return getDB()
    .prepare(
      `SELECT payload FROM session_events
       WHERE session_key = ? AND topic = ? AND ts >= ? AND ts < ?
       ORDER BY ts ASC`,
    )
    .all(sessionKey, topic, s, e)
    .map((r) => JSON.parse(r.payload));
}

// Time coverage of a topic: {min, max, count} in epoch ms (min/max null if empty)
export function getTopicTimeBounds(sessionKey, topic) {
  return getDB()
    .prepare(
      `SELECT MIN(ts) AS min, MAX(ts) AS max, COUNT(*) AS count
       FROM session_events
       WHERE session_key = ? AND topic = ? AND ts IS NOT NULL`,
    )
    .get(sessionKey, topic);
}

// Topic status rows for a session: [{topic, row_count, attempts, updated_at}]
export function getTopicStatus(sessionKey) {
  return getDB()
    .prepare(`SELECT * FROM session_topics WHERE session_key = ?`)
    .all(sessionKey);
}

export function deleteSession(sessionKey) {
  const database = getDB();
  database.transaction(() => {
    database
      .prepare(`DELETE FROM session_events WHERE session_key = ?`)
      .run(sessionKey);
    database
      .prepare(`DELETE FROM session_topics WHERE session_key = ?`)
      .run(sessionKey);
    database
      .prepare(`DELETE FROM sessions WHERE session_key = ?`)
      .run(sessionKey);
  })();
}

// Newest first
export function listSessions() {
  return getDB()
    .prepare(`SELECT * FROM sessions ORDER BY date_start DESC`)
    .all()
    .map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

// Keep the `keep` newest complete sessions; drop older complete ones and any
// stale incomplete leftovers (aborted downloads from a previous run).
export function pruneSessions(keep = 3) {
  const sessions = listSessions();
  const complete = sessions.filter((s) => s.complete === 1);
  const toDelete = [
    ...complete.slice(keep),
    // incomplete rows older than the newest complete one are zombies
    ...sessions.filter(
      (s) =>
        s.complete !== 1 &&
        complete.length > 0 &&
        s.date_start < complete[0].date_start,
    ),
  ];
  for (const s of toDelete) {
    console.log(
      `[session-db] Pruning session ${s.session_key} (${s.payload.session_name} ${s.payload.location}, ${s.date_start?.slice(0, 10)})`,
    );
    deleteSession(s.session_key);
  }
  if (toDelete.length > 0) getDB().exec("VACUUM");
  return toDelete.length;
}

// Newest complete session meta, or null
export function newestCompleteSession() {
  const sessions = listSessions();
  return sessions.find((s) => s.complete === 1) || null;
}

// ── SignalR event archive ─────────────────────────────────────────────────────
// Reuses session_events with topic prefixed "signalr:" so OpenF1 and SignalR
// rows coexist in the same table and the same window-query path works for both.

let _insertSignalR = null;
function insertSignalRStmt() {
  if (!_insertSignalR)
    _insertSignalR = getDB().prepare(
      `INSERT INTO session_events (session_key, topic, ts, payload) VALUES (?, ?, ?, ?)`,
    );
  return _insertSignalR;
}

export function insertSignalREvent(sessionKey, topic, ts, payload) {
  insertSignalRStmt().run(sessionKey, `signalr:${topic}`, ts, payload);
}

// Time-windowed query for SignalR events — same API as getTopicWindow
export function getSignalRWindow(sessionKey, topic, start, end) {
  const s = start instanceof Date ? start.getTime() : start;
  const e = end instanceof Date ? end.getTime() : end;
  return getDB()
    .prepare(
      `SELECT payload FROM session_events
       WHERE session_key = ? AND topic = ? AND ts >= ? AND ts < ?
       ORDER BY ts ASC`,
    )
    .all(sessionKey, `signalr:${topic}`, s, e)
    .map((r) => JSON.parse(r.payload));
}
