import austin from "./austin.json";
import baku from "./baku.json";
import catalunya from "./catalunya.json";
import hungaroring from "./hungaroring.json";
import imola from "./imola.json";
import interlagos from "./interlagos.json";
import jeddah from "./jeddah.json";
import lasVegas from "./las-vegas.json";
import lusail from "./lusail.json";
import melbourne from "./melbourne.json";
import mexicoCity from "./mexico-city.json";
import miami from "./miami.json";
import monteCarlo from "./monte-carlo.json";
import montreal from "./montreal.json";
import monza from "./monza.json";
import sakhir from "./sakhir.json";
import shanghai from "./shanghai.json";
import silverstone from "./silverstone.json";
import singapore from "./singapore.json";
import spaFrancorchamps from "./spa-francorchamps.json";
import spielberg from "./spielberg.json";
import suzuka from "./suzuka.json";
import yasMarinaCircuit from "./yas-marina-circuit.json";
import zandvoort from "./zandvoort.json";

export interface CircuitCorner {
  number: number;
  /** Arc-length fraction (0-1) along `points`, same convention as curve.getPointAt(u). */
  u: number;
}

export interface CircuitTrack {
  circuit_short_name: string;
  session_key: number;
  year: number;
  driver_number: number;
  lap_number: number;
  points: [number, number][];
  /** Real sector boundaries derived from lap timing (arc-length fraction). Null if unavailable. */
  sectorU: { sector1End: number; sector2End: number } | null;
  /** Corner markers approximated from path curvature — not official FIA corner numbers. */
  corners: CircuitCorner[];
}

const CIRCUIT_TRACKS: Record<string, CircuitTrack> = {
  austin: austin as CircuitTrack,
  baku: baku as CircuitTrack,
  catalunya: catalunya as CircuitTrack,
  hungaroring: hungaroring as CircuitTrack,
  imola: imola as CircuitTrack,
  interlagos: interlagos as CircuitTrack,
  jeddah: jeddah as CircuitTrack,
  "las-vegas": lasVegas as CircuitTrack,
  lusail: lusail as CircuitTrack,
  melbourne: melbourne as CircuitTrack,
  "mexico-city": mexicoCity as CircuitTrack,
  miami: miami as CircuitTrack,
  "monte-carlo": monteCarlo as CircuitTrack,
  montreal: montreal as CircuitTrack,
  monza: monza as CircuitTrack,
  sakhir: sakhir as CircuitTrack,
  shanghai: shanghai as CircuitTrack,
  silverstone: silverstone as CircuitTrack,
  singapore: singapore as CircuitTrack,
  "spa-francorchamps": spaFrancorchamps as CircuitTrack,
  spielberg: spielberg as CircuitTrack,
  suzuka: suzuka as CircuitTrack,
  "yas-marina-circuit": yasMarinaCircuit as CircuitTrack,
  zandvoort: zandvoort as CircuitTrack,
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getCircuitTrack(circuitShortName?: string | null): CircuitTrack | null {
  if (!circuitShortName) return null;
  return CIRCUIT_TRACKS[slugify(circuitShortName)] ?? null;
}
