// Loop test: fake 5s-long session in a temp DB → replay should restart at
// ~65s (REPLAY_END_BUFFER_MS=60s). Watch for two restarts to rule out
// double poll chains.
import "dotenv/config";
import * as store from "./session-store.js";
import { startReplay } from "./replay.js";

const T0 = Date.parse("2026-06-01T13:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

store.upsertSessionMeta({
  session_key: 999,
  session_name: "LoopTest",
  session_type: "Race",
  location: "Loopville",
  circuit_key: 144,
  circuit_short_name: "Loopville",
  country_name: "Testland",
  date_start: iso(T0),
  date_end: iso(T0 + 5000),
  meeting_name: "Loop GP",
});
store.replaceTopic(
  999,
  "drivers",
  [
    { driver_number: 1, name_acronym: "AAA", full_name: "Driver A", team_name: "T1", team_colour: "FF0000" },
    { driver_number: 2, name_acronym: "BBB", full_name: "Driver B", team_name: "T2", team_colour: "0000FF" },
  ],
  null,
);
store.replaceTopic(
  999,
  "laps",
  [
    { driver_number: 1, lap_number: 1, date_start: iso(T0), lap_duration: 5 },
    { driver_number: 2, lap_number: 1, date_start: iso(T0 + 1000), lap_duration: 5 },
  ],
  "date_start",
);
store.replaceTopic(
  999,
  "position",
  [
    { driver_number: 1, position: 1, date: iso(T0) },
    { driver_number: 2, position: 2, date: iso(T0 + 1000) },
  ],
  "date",
);
for (const topic of ["location", "intervals", "race_control", "team_radio", "pit", "stints", "weather", "starting_grid"]) {
  store.replaceTopic(999, topic, [], topic === "stints" || topic === "starting_grid" ? null : "date");
}
store.markComplete(999);

let events = 0;
let resets = 0;
const state = {};
const t0 = Date.now();
const broadcast = (event) => {
  events++;
  if (event === "reset") {
    resets++;
    console.log(`>>> RESET #${resets} at +${Math.round((Date.now() - t0) / 1000)}s (events so far: ${events})`);
  }
};

console.log("starting replay (expect restart at ~65s, second at ~130s)...");
await startReplay(broadcast, state);

setTimeout(() => {
  console.log(`DONE: resets=${resets}, total events=${events}`);
  process.exit(resets === 2 ? 0 : 1);
}, 150_000);
