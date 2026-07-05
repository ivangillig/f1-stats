/**
 * One-off extraction tool: pulls one clean racing lap of x/y location data
 * for a circuit from OpenF1 (most recent finished Race there) and writes a
 * simplified, normalized track outline to src/data/circuits/<slug>.json.
 *
 * Usage: node scripts/extract-circuit-track.js "Silverstone"
 *
 * Run from proxy/ so dotenv picks up proxy/.env (OpenF1 auth is optional —
 * this also works unauthenticated against the free tier, just slower).
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { fetchJSON, API_BASE } from "../openf1-rest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../../src/data/circuits");

const circuitShortName = process.argv[2];
if (!circuitShortName) {
  console.error('Usage: node scripts/extract-circuit-track.js "Silverstone"');
  process.exit(1);
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Ramer-Douglas-Peucker polyline simplification.
function perpendicularDistance(pt, lineStart, lineEnd) {
  const [x, y] = pt;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}

function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[last]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[last]];
}

// Turning-angle curvature peaks on the simplified path, used as a stand-in
// for corner numbers — OpenF1 has no official corner-number field, so this
// is an approximation, not the FIA-numbered apexes.
function detectCorners(points, { angleThresholdDeg = 18, minGapFrac = 0.015 } = {}) {
  const n = points.length;
  const angle = (i) => {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const v1x = cur[0] - prev[0], v1y = cur[1] - prev[1];
    const v2x = next[0] - cur[0], v2y = next[1] - cur[1];
    const a1 = Math.atan2(v1y, v1x);
    const a2 = Math.atan2(v2y, v2x);
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff);
  };
  const dist = cumulativeDistance(points, true);
  const total = dist[n - 1];
  const angles = points.map((_, i) => angle(i));
  const candidates = [];
  for (let i = 0; i < n; i++) {
    if (angles[i] * (180 / Math.PI) < angleThresholdDeg) continue;
    const isPeak =
      angles[i] >= angles[(i - 1 + n) % n] && angles[i] >= angles[(i + 1) % n];
    if (isPeak) candidates.push(i);
  }
  // Keep peaks in track order, drop ones too close (arc-length) to the
  // previous kept peak — otherwise one physical corner emits several pins.
  candidates.sort((a, b) => dist[a] - dist[b]);
  const kept = [];
  for (const idx of candidates) {
    const u = dist[idx] / total;
    const prevU = kept.length ? kept[kept.length - 1].u : -Infinity;
    if (u - prevU < minGapFrac && kept.length) {
      if (angles[idx] > angles[kept[kept.length - 1].idx]) {
        kept[kept.length - 1] = { idx, u };
      }
      continue;
    }
    kept.push({ idx, u });
  }
  // Wrap-around: drop a trailing peak too close to the first one.
  if (kept.length > 1 && 1 - kept[kept.length - 1].u + kept[0].u < minGapFrac) {
    kept.pop();
  }
  return kept.map((k, i) => ({ number: i + 1, u: Number(k.u.toFixed(4)) }));
}

function cumulativeDistance(points, closed) {
  const n = points.length;
  const dist = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    dist[i] = dist[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  if (closed) {
    // Not used for total length beyond index n-1, but keep signature simple.
  }
  return dist;
}

// Attempts extraction from one session. Returns the data to write, or null
// if this session doesn't have usable data (caller tries the next one).
async function tryExtractSession(session) {
  console.log(
    `[extract] Trying session_key=${session.session_key} (${session.year} ${session.session_name})`,
  );

  // Winner tends to have the cleanest, most representative racing line.
  const results = await fetchJSON(
    `${API_BASE}/session_result?session_key=${session.session_key}&position=1`,
  );
  const driverNumber = results[0]?.driver_number ?? 1;
  console.log(`[extract] Using driver_number=${driverNumber}`);

  const laps = await fetchJSON(
    `${API_BASE}/laps?session_key=${session.session_key}&driver_number=${driverNumber}`,
  );
  const candidateLaps = laps
    .filter((l) => !l.is_pit_out_lap && l.lap_duration && l.lap_number > 3)
    .sort((a, b) => a.lap_duration - b.lap_duration);
  if (candidateLaps.length === 0) {
    console.warn(`[extract] No clean laps found for driver ${driverNumber}, skipping session`);
    return null;
  }
  // Fastest clean lap = least likely to be under safety car / traffic.
  const lap = candidateLaps[0];
  console.log(
    `[extract] Using lap_number=${lap.lap_number} duration=${lap.lap_duration}s`,
  );

  const start = new Date(lap.date_start);
  const end = new Date(start.getTime() + lap.lap_duration * 1000 + 500);
  const location = await fetchJSON(
    `${API_BASE}/location?session_key=${session.session_key}&driver_number=${driverNumber}` +
      `&date>=${start.toISOString()}&date<=${end.toISOString()}`,
  );
  if (location.length < 10) {
    console.warn(`[extract] Not enough location points (${location.length}), skipping session`);
    return null;
  }
  console.log(`[extract] Fetched ${location.length} location points`);

  const raw = location.map((p) => [p.x, p.y]);

  // Sector boundaries: real data. duration_sector_1/2 give us elapsed time
  // from lap start to each intermediate timing loop — find the raw location
  // sample nearest that timestamp, then express it as an arc-length fraction
  // (same convention as curve.getPointAt(u) at render time).
  let sectorU = null;
  if (lap.duration_sector_1 && lap.duration_sector_2) {
    const rawDist = cumulativeDistance(raw, false);
    const totalRawDist = rawDist[rawDist.length - 1];
    const lapStartMs = start.getTime();
    const s1EndMs = lapStartMs + lap.duration_sector_1 * 1000;
    const s2EndMs = lapStartMs + (lap.duration_sector_1 + lap.duration_sector_2) * 1000;
    const nearestIdx = (targetMs) => {
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < location.length; i++) {
        const diff = Math.abs(new Date(location[i].date).getTime() - targetMs);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      return bestIdx;
    };
    const s1Idx = nearestIdx(s1EndMs);
    const s2Idx = nearestIdx(s2EndMs);
    sectorU = {
      sector1End: Number((rawDist[s1Idx] / totalRawDist).toFixed(4)),
      sector2End: Number((rawDist[s2Idx] / totalRawDist).toFixed(4)),
    };
    console.log(
      `[extract] Sector boundaries (arc-length fraction): ${sectorU.sector1End}, ${sectorU.sector2End}`,
    );
  } else {
    console.warn("[extract] No sector duration data on this lap — skipping sector boundaries");
  }

  const simplified = douglasPeucker(raw, 25); // epsilon in OpenF1 cm units
  console.log(`[extract] Simplified to ${simplified.length} points`);

  // Center on centroid and scale so the largest extent maps to [-1, 1].
  const cx = raw.reduce((s, p) => s + p[0], 0) / raw.length;
  const cy = raw.reduce((s, p) => s + p[1], 0) / raw.length;
  const centered = simplified.map(([x, y]) => [x - cx, y - cy]);
  const maxExtent = Math.max(...centered.map(([x, y]) => Math.hypot(x, y)));
  const normalized = centered.map(([x, y]) => [
    Number((x / maxExtent).toFixed(4)),
    Number((y / maxExtent).toFixed(4)),
  ]);

  // Corner markers: approximated from curvature peaks, not an official
  // FIA corner list — see detectCorners() docstring.
  const corners = detectCorners(normalized);
  console.log(`[extract] Detected ${corners.length} corner candidates`);

  return {
    circuit_short_name: circuitShortName,
    session_key: session.session_key,
    year: session.year,
    driver_number: driverNumber,
    lap_number: lap.lap_number,
    points: normalized,
    sectorU,
    corners,
  };
}

async function main() {
  console.log(`[extract] Looking up sessions for ${circuitShortName}...`);
  const sessions = await fetchJSON(
    `${API_BASE}/sessions?circuit_short_name=${encodeURIComponent(circuitShortName)}&session_type=Race`,
  );
  const now = Date.now();
  const finished = sessions
    .filter((s) => new Date(s.date_end).getTime() < now)
    .sort((a, b) => new Date(b.date_end) - new Date(a.date_end));
  if (finished.length === 0) {
    console.error(`[extract] No finished Race sessions found for ${circuitShortName}`);
    process.exit(1);
  }

  let data = null;
  for (const session of finished) {
    data = await tryExtractSession(session);
    if (data) break;
  }
  if (!data) {
    console.error(
      `[extract] None of the ${finished.length} finished session(s) for ${circuitShortName} had usable data`,
    );
    process.exit(1);
  }

  const slug = slugify(circuitShortName);
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${slug}.json`);
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`[extract] Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
