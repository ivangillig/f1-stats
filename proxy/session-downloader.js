/**
 * Session archive downloader.
 *
 * Downloads a complete OpenF1 session into SQLite (session-store.js) so replay
 * can serve it locally. Heavy topics (location, intervals) are fetched in time
 * windows to keep responses manageable; everything is paced to respect OpenF1
 * rate limits (paid 60 req/min, free 30).
 *
 * Per-topic verification: after a session is marked complete, topics that came
 * back empty are retried on later passes (up to MAX_TOPIC_ATTEMPTS). This
 * covers OpenF1 consolidating data minutes after a session ends, and future
 * live-recorded sessions that lack topics OpenF1 doesn't deliver live (e.g.
 * location).
 *
 * car_data is intentionally NOT archived: replay doesn't consume it and it's
 * by far the heaviest topic.
 */

import {
  API_BASE,
  fetchJSON,
  sleep,
  requestDelayMs,
} from "./openf1-rest.js";
import * as store from "./session-store.js";

const TAG = "[session-db]";
const KEEP_SESSIONS = 3;
const MAX_TOPIC_ATTEMPTS = 4;
// Don't download a session until it's been over for this long — OpenF1 needs
// time to consolidate, and it keeps the cutoff consistent with checkActiveSession().
const SESSION_OVER_GRACE_MS = 30 * 60 * 1000;

// topic → REST path is identical. dateField = property holding the event
// timestamp (null = static topic). windowMinutes = fetch in time windows.
const TOPICS = [
  // drivers gets extra retries: it's 1-2 cheap requests and team colours can
  // take hours to consolidate upstream (critical for UI rendering)
  { topic: "drivers", dateField: null, maxAttempts: 12 },
  { topic: "starting_grid", dateField: null, raceOnly: true },
  { topic: "stints", dateField: null },
  { topic: "pit", dateField: "date" },
  { topic: "weather", dateField: "date" },
  { topic: "race_control", dateField: "date" },
  { topic: "team_radio", dateField: "date" },
  { topic: "position", dateField: "date" },
  { topic: "laps", dateField: "date_start" },
  { topic: "intervals", dateField: "date", raceOnly: true, windowMinutes: 30 },
  { topic: "location", dateField: "date", windowMinutes: 5 },
];

let downloading = false;

export function isArchiveDownloading() {
  return downloading;
}

function isRaceLike(session) {
  return (
    session.session_type === "Race" || session.session_type === "Sprint"
  );
}

function topicApplies(def, session) {
  return !def.raceOnly || isRaceLike(session);
}

// Session time bounds with margins for data slightly outside date_start/date_end
function sessionBounds(session) {
  const start = Date.parse(session.date_start) - 5 * 60 * 1000;
  const rawEnd = session.date_end
    ? Date.parse(session.date_end)
    : Date.parse(session.date_start) + 3 * 60 * 60 * 1000;
  return { start, end: rawEnd + 10 * 60 * 1000 };
}

// Throws when any request fails outright — an empty array from a failed
// request must never be confused with a legitimately empty window, or the
// session would be archived with silent gaps.
async function fetchTopic(session, def) {
  const key = session.session_key;
  if (!def.windowMinutes) {
    const rows = await fetchJSON(
      `${API_BASE}/${def.topic}?session_key=${key}`,
      4,
      TAG,
      null,
    );
    if (rows === null) throw new Error(`fetch failed for topic ${def.topic}`);
    return rows;
  }
  const { start, end } = sessionBounds(session);
  const stepMs = def.windowMinutes * 60 * 1000;
  const rows = [];
  for (let s = start; s < end; s += stepMs) {
    const e = Math.min(s + stepMs, end);
    const sISO = new Date(s).toISOString();
    const eISO = new Date(e).toISOString();
    const field = def.dateField;
    const chunk = await fetchJSON(
      `${API_BASE}/${def.topic}?session_key=${key}&${field}>=${sISO}&${field}<${eISO}`,
      4,
      TAG,
      null,
    );
    if (chunk === null) {
      throw new Error(`fetch failed for topic ${def.topic} window ${sISO}`);
    }
    if (Array.isArray(chunk)) rows.push(...chunk);
    await sleep(requestDelayMs());
  }
  return rows;
}

// Merge missing team info — OpenF1 returns null team_name/team_colour for a
// while after a session ends (same gap the live path patches with
// backfillTeamInfo() in mqtt-client.js); without this the dashboard renders
// white driver boxes and white map dots.
// Pass 1: newest archived session that has the driver (free, local).
// Pass 2: the driver's REST history — covers rookies/FP1-only drivers that
// aren't in any archived lineup.
async function backfillDriverTeamInfo(sessionKey, drivers) {
  if (!drivers.some((d) => !d.team_colour)) return drivers;

  const byNumber = new Map();
  for (const s of store.listSessions()) {
    // newest first — keep the first (most recent) hit per driver
    if (s.session_key === sessionKey) continue;
    for (const d of store.getTopicRows(s.session_key, "drivers")) {
      if (d.team_colour && !byNumber.has(d.driver_number)) {
        byNumber.set(d.driver_number, d);
      }
    }
  }

  let patched = 0;
  const result = [];
  for (const d of drivers) {
    if (d.team_colour) {
      result.push(d);
      continue;
    }
    let prev = byNumber.get(d.driver_number);
    if (!prev) {
      const hist = await fetchJSON(
        `${API_BASE}/drivers?driver_number=${d.driver_number}`,
        4,
        TAG,
        null,
      );
      await sleep(requestDelayMs());
      prev = (Array.isArray(hist) ? hist : [])
        .filter((h) => h.team_colour && h.session_key !== sessionKey)
        .sort((a, b) => b.session_key - a.session_key)[0];
    }
    if (!prev) {
      result.push(d);
      continue;
    }
    patched++;
    result.push({
      ...d,
      team_name: d.team_name ?? prev.team_name,
      team_colour: d.team_colour ?? prev.team_colour,
      first_name: d.first_name ?? prev.first_name,
      last_name: d.last_name ?? prev.last_name,
      headshot_url: d.headshot_url ?? prev.headshot_url,
    });
  }
  if (patched > 0) {
    console.log(
      `${TAG} ${sessionKey}/drivers: backfilled team info for ${patched} drivers`,
    );
  }
  return result;
}

async function downloadTopic(session, def) {
  let rows = await fetchTopic(session, def);
  if (def.topic === "drivers" && Array.isArray(rows)) {
    rows = await backfillDriverTeamInfo(session.session_key, rows);
  }
  store.replaceTopic(
    session.session_key,
    def.topic,
    Array.isArray(rows) ? rows : [],
    def.dateField,
  );
  console.log(
    `${TAG} ${session.session_key}/${def.topic}: ${Array.isArray(rows) ? rows.length : 0} rows`,
  );
  await sleep(requestDelayMs());
}

// Download every applicable topic for a session and mark it complete.
// Returns true on success (even if some optional topics came back empty —
// the verify pass retries those later).
export async function downloadSession(session) {
  if (downloading) {
    console.log(`${TAG} Download already in progress — skipping`);
    return false;
  }
  downloading = true;
  const label = `${session.session_name} ${session.location} (${session.session_key})`;
  console.log(`${TAG} Downloading session ${label}...`);
  const startedAt = Date.now();
  try {
    store.upsertSessionMeta(session);
    // Resume support: topics with rows already stored were fully fetched on a
    // previous (interrupted) attempt — fetchTopic throws on partial failures,
    // so stored rows are trustworthy.
    const fetched = new Map(
      store.getTopicStatus(session.session_key).map((t) => [t.topic, t]),
    );
    for (const def of TOPICS) {
      if (!topicApplies(def, session)) continue;
      if ((fetched.get(def.topic)?.row_count ?? 0) > 0) continue;
      await downloadTopic(session, def);
    }
    store.markComplete(session.session_key);
    store.pruneSessions(KEEP_SESSIONS);
    console.log(
      `${TAG} Session ${label} archived in ${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
    return true;
  } catch (err) {
    console.error(`${TAG} Download failed for ${label}: ${err.message}`);
    return false;
  } finally {
    downloading = false;
  }
}

export async function downloadSessionByKey(sessionKey) {
  const sessions = await fetchJSON(
    `${API_BASE}/sessions?session_key=${sessionKey}`,
    4,
    TAG,
  );
  if (!sessions || sessions.length === 0) {
    console.error(`${TAG} Session ${sessionKey} not found in OpenF1`);
    return false;
  }
  return downloadSession(sessions[0]);
}

// Latest session (any type) that ended more than 30 min ago, or null.
export async function findLatestFinishedSession() {
  const year = new Date().getFullYear();
  const sessions = await fetchJSON(
    `${API_BASE}/sessions?date_start>=${year - 1}-01-01`,
    4,
    TAG,
  );
  const cutoff = Date.now() - SESSION_OVER_GRACE_MS;
  const finished = (sessions || []).filter(
    (s) => s.date_end && Date.parse(s.date_end) < cutoff,
  );
  if (finished.length === 0) return null;
  finished.sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
  return finished[finished.length - 1];
}

// Minimum fraction of the session timespan a windowed topic must cover.
// Below this the topic is considered partial (e.g. OpenF1 only has location
// fragments for the session) and is re-fetched in case upstream backfilled.
const MIN_TIME_COVERAGE = 0.6;

function hasPoorCoverage(session, def) {
  if (!def.windowMinutes) return false;
  const bounds = store.getTopicTimeBounds(session.session_key, def.topic);
  if (!bounds || bounds.count === 0 || bounds.min == null) return false;
  const sessionSpan =
    Date.parse(session.date_end) - Date.parse(session.date_start);
  if (!Number.isFinite(sessionSpan) || sessionSpan <= 0) return false;
  return (bounds.max - bounds.min) / sessionSpan < MIN_TIME_COVERAGE;
}

// Re-fetch applicable topics that are empty or partial and haven't exhausted
// their attempts. Cheap when there's nothing to do (local DB check only).
export async function verifyStoredSession(session) {
  const status = new Map(
    store.getTopicStatus(session.session_key).map((t) => [t.topic, t]),
  );
  const missing = TOPICS.filter((def) => {
    if (!topicApplies(def, session)) return false;
    const t = status.get(def.topic);
    if (!t) return true;
    if (t.attempts >= (def.maxAttempts ?? MAX_TOPIC_ATTEMPTS)) return false;
    if (t.row_count === 0 || hasPoorCoverage(session, def)) return true;
    // drivers stored without team colours (OpenF1 consolidates them late and
    // no archived session could backfill them yet) — retry
    if (def.topic === "drivers") {
      return store
        .getTopicRows(session.session_key, "drivers")
        .some((d) => !d.team_colour);
    }
    return false;
  });
  if (missing.length === 0) return;
  if (downloading) return;
  downloading = true;
  try {
    console.log(
      `${TAG} Backfilling empty topics for session ${session.session_key}: ${missing.map((d) => d.topic).join(", ")}`,
    );
    for (const def of missing) {
      await downloadTopic(session, def);
    }
  } catch (err) {
    console.error(`${TAG} Backfill error: ${err.message}`);
  } finally {
    downloading = false;
  }
}

// Main maintenance entry point — called periodically by server.js.
// Downloads the latest finished session if it isn't archived yet; otherwise
// runs the per-topic backfill pass. Calls onNewSessionReady(session) after a
// successful new download so the caller can restart replay onto it.
export async function ensureLatestSessionArchived({ onNewSessionReady } = {}) {
  if (downloading) return;
  const latest = await findLatestFinishedSession();
  if (!latest) return;
  if (store.isComplete(latest.session_key)) {
    await verifyStoredSession(latest);
    return;
  }
  console.log(
    `${TAG} New finished session detected: ${latest.session_name} ${latest.location} (${latest.session_key})`,
  );
  const ok = await downloadSession(latest);
  if (ok && onNewSessionReady) onNewSessionReady(latest);
}
