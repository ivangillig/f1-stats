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

// Driver info mapping (number -> info) - 2024/2025 Season
// Note: This is a fallback, the app will use DriverList from F1 API when available
export const DRIVERS: Record<
  string,
  { name: string; team: string; code: string }
> = {
  "1": { name: "Max Verstappen", team: "Red Bull Racing", code: "VER" },
  "11": { name: "Sergio Perez", team: "Red Bull Racing", code: "PER" },
  "16": { name: "Charles Leclerc", team: "Ferrari", code: "LEC" },
  "55": { name: "Carlos Sainz", team: "Williams", code: "SAI" }, // 2025: Williams
  "44": { name: "Lewis Hamilton", team: "Ferrari", code: "HAM" }, // 2025: Ferrari
  "63": { name: "George Russell", team: "Mercedes", code: "RUS" },
  "12": { name: "Andrea Kimi Antonelli", team: "Mercedes", code: "ANT" }, // 2025
  "4": { name: "Lando Norris", team: "McLaren", code: "NOR" },
  "81": { name: "Oscar Piastri", team: "McLaren", code: "PIA" },
  "14": { name: "Fernando Alonso", team: "Aston Martin", code: "ALO" },
  "18": { name: "Lance Stroll", team: "Aston Martin", code: "STR" },
  "10": { name: "Pierre Gasly", team: "Alpine", code: "GAS" },
  "7": { name: "Jack Doohan", team: "Alpine", code: "DOO" }, // 2025
  "23": { name: "Alex Albon", team: "Williams", code: "ALB" },
  "43": { name: "Franco Colapinto", team: "Williams", code: "COL" }, // 2024 replacement
  "22": { name: "Yuki Tsunoda", team: "RB", code: "TSU" },
  "30": { name: "Liam Lawson", team: "RB", code: "LAW" }, // 2024/2025
  "6": { name: "Isack Hadjar", team: "RB", code: "HAD" }, // 2025
  "87": { name: "Oliver Bearman", team: "Haas F1 Team", code: "BEA" }, // 2025
  "31": { name: "Esteban Ocon", team: "Haas F1 Team", code: "OCO" }, // 2025: Haas
  "5": { name: "Gabriel Bortoleto", team: "Kick Sauber", code: "BOR" }, // 2025
  "27": { name: "Nico Hulkenberg", team: "Kick Sauber", code: "HUL" }, // 2025: Sauber
  // Legacy numbers (might appear in historical data)
  "77": { name: "Valtteri Bottas", team: "Kick Sauber", code: "BOT" },
  "24": { name: "Zhou Guanyu", team: "Kick Sauber", code: "ZHO" },
  "20": { name: "Kevin Magnussen", team: "Haas F1 Team", code: "MAG" },
  "3": { name: "Daniel Ricciardo", team: "RB", code: "RIC" },
  "2": { name: "Logan Sargeant", team: "Williams", code: "SAR" },
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
  1: { name: "Green Flag", color: "#00bc7d", key: "green" },
  2: { name: "Yellow Flag", color: "#ffb900", key: "yellow" },
  4: { name: "Safety Car", color: "#FFA500", key: "scDeployed" },
  5: { name: "Red Flag", color: "#FF0000", key: "red" },
  6: { name: "VSC Deployed", color: "#FFA500", key: "vscDeployed" },
  7: { name: "VSC Ending", color: "#FFA500", key: "vscEnding" },
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
