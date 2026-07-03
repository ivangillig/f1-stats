// Team colors mapping (F1 2024/2025 official colors)
export const TEAM_COLORS: Record<string, string> = {
  "Red Bull Racing": "#3671C6",
  Ferrari: "#E80020",
  Mercedes: "#27F4D2",
  McLaren: "#FF8000",
  "Aston Martin": "#229971",
  Alpine: "#FF87BC",
  Williams: "#1868DB",
  RB: "#6692FF",
  "Kick Sauber": "#52E252",
  "Haas F1 Team": "#B6BABD",
};

// Team logo mapping (team name -> image file in /images/teams/)
export const TEAM_LOGOS: Record<string, string> = {
  "Red Bull Racing": "/images/teams/redbull.png",
  Ferrari: "/images/teams/ferrari.png",
  Mercedes: "/images/teams/mercedes.png",
  McLaren: "/images/teams/mclaren.png",
  "Aston Martin": "/images/teams/astonmartin.png",
  Alpine: "/images/teams/alpine.png",
  Williams: "/images/teams/williams.png",
  RB: "/images/teams/rb.png",
  "Kick Sauber": "/images/teams/kicksauber.svg",
  "Haas F1 Team": "/images/teams/haas.png",
};

export const TIRE_COMPOUNDS: Record<string, { color: string; name: string }> = {
  SOFT: { color: "#FF3333", name: "Soft" },
  MEDIUM: { color: "#FFD700", name: "Medium" },
  HARD: { color: "#FFFFFF", name: "Hard" },
  INTERMEDIATE: { color: "#43B02A", name: "Inter" },
  WET: { color: "#0067AD", name: "Wet" },
};

export const TRACK_STATUS: Record<
  number,
  { name: string; color: string; key: string }
> = {
  1: { name: "Green Flag", color: "#10DF5F", key: "green" },
  2: { name: "Yellow Flag", color: "#FBFF00", key: "yellow" },
  4: { name: "Safety Car", color: "#FFA500", key: "scDeployed" },
  5: { name: "Red Flag", color: "#FF0000", key: "red" },
  6: { name: "Virtual Safety Car", color: "#FFA500", key: "vscDeployed" },
  7: { name: "Chequered Flag", color: "#3A3A3A", key: "chequered" },
  8: { name: "VSC Ending", color: "#FFA500", key: "vscEnding" },
};

// Circuit ShortName → Country name fallback (when API omits Meeting.Country)
export const CIRCUIT_TO_COUNTRY: Record<string, string> = {
  Montreal: "Canada",
  Silverstone: "Great Britain",
  Monza: "Italy",
  Imola: "Italy",
  Spa: "Belgium",
  Monaco: "Monaco",
  Barcelona: "Spain",
  Suzuka: "Japan",
  Zandvoort: "Netherlands",
  Baku: "Azerbaijan",
  Jeddah: "Saudi Arabia",
  Melbourne: "Australia",
  Sakhir: "Bahrain",
  Shanghai: "China",
  Budapest: "Hungary",
  Singapore: "Singapore",
  Austin: "United States",
  "Mexico City": "Mexico",
  "São Paulo": "Brazil",
  "Las Vegas": "United States",
  Lusail: "Qatar",
  "Yas Island": "UAE",
  Spielberg: "Austria",
  Miami: "United States",
};

// Country name to ISO 3166-1 alpha-2 code (for flagcdn.com images)
export const COUNTRY_CODES: Record<string, string> = {
  Australia: "au",
  Austria: "at",
  Azerbaijan: "az",
  Bahrain: "bh",
  Belgium: "be",
  Brazil: "br",
  Canada: "ca",
  China: "cn",
  France: "fr",
  Germany: "de",
  "Great Britain": "gb",
  Hungary: "hu",
  Italy: "it",
  Japan: "jp",
  Mexico: "mx",
  Monaco: "mc",
  Netherlands: "nl",
  Portugal: "pt",
  Qatar: "qa",
  Russia: "ru",
  "Saudi Arabia": "sa",
  Singapore: "sg",
  Spain: "es",
  UAE: "ae",
  "United Arab Emirates": "ae",
  "United States": "us",
  USA: "us",
  "Las Vegas": "us",
  Miami: "us",
};

// Country name to flag emoji mapping
export const COUNTRY_FLAGS: Record<string, string> = {
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Azerbaijan: "🇦🇿",
  Bahrain: "🇧🇭",
  Belgium: "🇧🇪",
  Brazil: "🇧🇷",
  Canada: "🇨🇦",
  China: "🇨🇳",
  France: "🇫🇷",
  Germany: "🇩🇪",
  "Great Britain": "🇬🇧",
  Hungary: "🇭🇺",
  Italy: "🇮🇹",
  Japan: "🇯🇵",
  Mexico: "🇲🇽",
  Monaco: "🇲🇨",
  Netherlands: "🇳🇱",
  Portugal: "🇵🇹",
  Qatar: "🇶🇦",
  Russia: "🇷🇺",
  "Saudi Arabia": "🇸🇦",
  Singapore: "🇸🇬",
  Spain: "🇪🇸",
  UAE: "🇦🇪",
  "United Arab Emirates": "🇦🇪",
  "United States": "🇺🇸",
  USA: "🇺🇸",
  "Las Vegas": "🇺🇸",
  Miami: "🇺🇸",
  // Demo mode
  "Demo Mode - Proxy Not Running": "🏁",
};
