export interface Driver {
  position: number;
  driverNumber: string;
  code: string;
  name: string;
  team: string;
  teamColor?: string; // Color from F1 API
  gap: string;
  interval: string;
  lastLap: string;
  bestLap: string;
  sector1: string;
  sector2: string;
  sector3: string;
  bestSector1?: string;
  bestSector2?: string;
  bestSector3?: string;
  hasSector1Record?: boolean; // Has the overall best S1 time
  hasSector2Record?: boolean; // Has the overall best S2 time
  hasSector3Record?: boolean; // Has the overall best S3 time
  sector1Status: SectorStatus;
  sector2Status: SectorStatus;
  sector3Status: SectorStatus;
  miniSectors?: SectorStatus[];
  sector1SegmentCount?: number;
  sector2SegmentCount?: number;
  sector3SegmentCount?: number;
  tire: TireInfo;
  inPit: boolean;
  pitCount: number;
  retired: boolean;
  currentLap?: number;
  drsEnabled?: boolean;
  positionChange?: number;
  lastLapPersonalBest?: boolean;
  lastLapOverallFastest?: boolean; // Last lap is the session's fastest lap
  trackProgress?: number; // 0-1 position on track for map
  trackX?: number; // X coordinate on track
  trackY?: number; // Y coordinate on track
}

export interface TireInfo {
  compound: string;
  age: number;
  isNew: boolean;
}

export type SectorStatus = "purple" | "green" | "yellow" | "blue" | "none";

export interface SessionInfo {
  type: string;
  name: string;
  sessionName: string; // "Practice 3", "Qualifying", "Race", etc.
  track: string;
  country: string;
  remainingTime: string;
  currentLap: number;
  totalLaps: number;
  circuitKey?: number;
  isLive: boolean;
}

export interface TrackStatusInfo {
  status: number;
  message: string;
}

export interface WeatherData {
  airTemp: number;
  humidity: number;
  pressure: number;
  rainfall: boolean;
  trackTemp: number;
  windDirection: number;
  windSpeed: number;
}

export interface RadioCapture {
  utc: string;
  racingNumber: string;
  path: string;
}

export interface TeamRadio {
  captures: RadioCapture[];
}

export interface RaceControlMessage {
  utc: string;
  message: string;
  category?: string;
  flag?: string;
  lap?: number;
  driverNumber?: string;
  sector?: number; // Sector number for yellow flags
}

export interface F1State {
  drivers: Driver[];
  sessionInfo: SessionInfo;
  trackStatus: TrackStatusInfo;
  weather?: WeatherData;
  teamRadios: RadioCapture[];
  raceControlMessages: RaceControlMessage[];
  isConnected: boolean;
  error: string | null;
}

// API Response types
export interface TimingDataDriver {
  RacingNumber: string;
  Line: number;
  GapToLeader: string;
  IntervalToPositionAhead: { Value: string };
  Sectors: {
    [key: string]: {
      Value: string;
      PersonalFastest: boolean;
      OverallFastest: boolean;
    };
  };
  LastLapTime: { Value: string; PersonalFastest: boolean };
  BestLapTime: { Value: string };
  InPit: boolean;
  PitOut: boolean;
  Retired: boolean;
  NumberOfPitStops: number;
}

export interface TimingAppDataDriver {
  RacingNumber: string;
  Stints: {
    Compound: string;
    New: string;
    TotalLaps: number;
  }[];
}
