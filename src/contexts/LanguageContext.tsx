"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "es" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

const translations = {
  es: {
    // TopBar
    "topbar.laps": "Vuelta",
    "topbar.of": "de",

    // TimingBoard
    "timing.driver": "Piloto",
    "timing.drs": "DRS",
    "timing.tire": "Neumático",
    "timing.position": "+/-",
    "timing.gap": "Diferencia",
    "timing.last": "Última",
    "timing.s1": "S1",
    "timing.s2": "S2",
    "timing.s3": "S3",
    "timing.waiting": "Esperando datos de pilotos...",

    // DriverRow
    "driver.inPit": "En boxes",
    "driver.retired": "Retirado",
    "driver.drsEnabled": "DRS disponible",
    "driver.drsDisabled": "DRS no disponible",
    "driver.drsActive": "DRS activo",
    "driver.drsInactive": "DRS inactivo",
    "driver.tireAge": "Edad del neumático",
    "driver.laps": "vueltas",
    "driver.lapsOld": "{{laps}} vueltas de uso",
    "driver.newTire": "Nuevo",
    "driver.bestLap": "Mejor vuelta personal",
    "driver.lastLapBest": "Última vuelta (¡Mejor personal!)",
    "driver.sessionFastest": "¡Vuelta más rápida de la sesión!",
    "driver.positionGain": "posiciones ganadas",
    "driver.positionLoss": "posiciones perdidas",
    "driver.gapToLeader": "Diferencia al líder",
    "driver.intervalToAhead": "Intervalo al de adelante",
    "driver.bestLapTime": "Mejor tiempo de vuelta",
    "driver.bestSectorTime": "Mejor tiempo de sector",
    "driver.miniSectorRecord": "Récord de mini sector",
    "driver.miniSectorBest": "Mejor mini sector personal",
    "driver.miniSectorSlower": "Más lento que el mejor",
    "driver.miniSectorNoData": "Sin datos",
    "driver.sectorBest": "Mejor sector general",
    "driver.sectorPersonalBest": "Mejor sector personal",
    "driver.sectorSlower": "Más lento que mejor personal",
    "driver.sectorCurrent": "Tiempo de sector actual",
    "driver.soft": "Blando",
    "driver.medium": "Medio",
    "driver.hard": "Duro",
    "driver.intermediate": "Intermedio",
    "driver.wet": "Lluvia",

    // RaceControl
    "raceControl.title": "Control de Carrera",
    "raceControl.lap": "Vuelta {{lap}}",
    "raceControl.noMessages": "No hay mensajes",

    // RaceControl - Categories (from API)
    "raceControl.category.Flag": "Bandera",
    "raceControl.category.SafetyCar": "Safety Car",
    "raceControl.category.CarEvent": "Evento de Auto",
    "raceControl.category.Drs": "DRS",
    "raceControl.category.TrackLimits": "Límites de Pista",
    "raceControl.category.Other": "Otro",

    // RaceControl - Flag messages (translate common patterns)
    "raceControl.flag.green": "BANDERA VERDE",
    "raceControl.flag.yellow": "BANDERA AMARILLA",
    "raceControl.flag.doubleYellow": "DOBLE BANDERA AMARILLA",
    "raceControl.flag.red": "BANDERA ROJA",
    "raceControl.flag.blue": "BANDERA AZUL",
    "raceControl.flag.chequered": "BANDERA A CUADROS",
    "raceControl.flag.blackWhite": "BANDERA BLANCA Y NEGRA",
    "raceControl.flag.black": "BANDERA NEGRA",

    // RaceControl - Common message patterns
    "raceControl.msg.trackLimits": "LÍMITES DE PISTA",
    "raceControl.msg.safetyCarDeployed": "SAFETY CAR DESPLEGADO",
    "raceControl.msg.safetyCarEnding": "SAFETY CAR FINALIZANDO",
    "raceControl.msg.vscDeployed": "VSC DESPLEGADO",
    "raceControl.msg.vscEnding": "VSC FINALIZANDO",
    "raceControl.msg.drsEnabled": "DRS HABILITADO",
    "raceControl.msg.drsDisabled": "DRS DESHABILITADO",
    "raceControl.msg.cleared": "DESPEJADO",
    "raceControl.msg.clear": "DESPEJADO",
    "raceControl.msg.allClear": "TODO DESPEJADO",

    // TeamRadios
    "teamRadios.title": "Radio de Equipos",
    "teamRadios.noRadios": "No hay comunicaciones",

    // TrackViolations
    "violations.title": "Violaciones de Pista",
    "violations.noViolations": "No hay violaciones",
    "violations.violation": "Violación",
    "violations.violations": "Violaciones",

    // TrackMap
    "map.loading": "Cargando mapa...",
    "map.error": "Error al cargar el mapa",
    "map.notAvailable": "Mapa no disponible",

    // Footer
    "footer.madeWith": "Hecho con",
    "footer.version": "Versión",
    "footer.disclaimer":
      "Este sitio no está afiliado, asociado, autorizado, respaldado por, o de ninguna manera oficialmente conectado con Formula 1, FIA, o cualquiera de sus subsidiarias o afiliados.",

    // Error messages
    "error.demo": "Modo Demo:",
    "error.demoData":
      "Datos en vivo no disponibles. Mostrando datos de demostración.",
    "error.connection": "Conectando al servidor...",
    "error.reconnecting": "Reconectando...",

    // Track status
    "status.allClear": "Despejado",
    "status.yellow": "Bandera Amarilla",
    "status.green": "Bandera Verde",
    "status.scDeployed": "Safety Car",
    "status.red": "Bandera Roja",
    "status.vscDeployed": "Virtual Safety Car",
    "status.vscEnding": "VSC Finalizando",

    // Session types
    "session.title": "Sesión",
    "session.remaining": "Restante",
    "session.lap": "Vuelta",
    "session.type": "Tipo",
    "session.race": "Carrera",
    "session.qualifying": "Clasificación",
    "session.practice": "Práctica",
    "session.sprintQualifying": "Sprint Qualifying",
    "session.sprint": "Sprint",

    // Weather
    "weather.trackTemp": "Temperatura de Pista",
    "weather.airTemp": "Temperatura del Aire",
    "weather.humidity": "Humedad",
    "weather.rain": "Lluvia detectada",
    "weather.dry": "Condiciones secas",
    "weather.wind": "Viento",
  },
  en: {
    // TopBar
    "topbar.laps": "Lap",
    "topbar.of": "of",

    // TimingBoard
    "timing.driver": "Driver",
    "timing.drs": "DRS",
    "timing.tire": "Tire",
    "timing.position": "+/-",
    "timing.gap": "Gap",
    "timing.last": "Last",
    "timing.s1": "S1",
    "timing.s2": "S2",
    "timing.s3": "S3",
    "timing.waiting": "Waiting for driver data...",

    // DriverRow
    "driver.inPit": "In pit",
    "driver.retired": "Retired",
    "driver.drsEnabled": "DRS available",
    "driver.drsDisabled": "DRS not available",
    "driver.drsActive": "DRS active",
    "driver.drsInactive": "DRS inactive",
    "driver.tireAge": "Tire age",
    "driver.laps": "laps",
    "driver.lapsOld": "{{laps}} laps old",
    "driver.newTire": "New",
    "driver.bestLap": "Personal best lap",
    "driver.lastLapBest": "Last lap (Personal best!)",
    "driver.sessionFastest": "Session fastest lap!",
    "driver.positionGain": "positions gained",
    "driver.positionLoss": "positions lost",
    "driver.gapToLeader": "Gap to leader",
    "driver.intervalToAhead": "Interval to car ahead",
    "driver.bestLapTime": "Best lap time",
    "driver.bestSectorTime": "Best sector time",
    "driver.miniSectorRecord": "Mini sector record",
    "driver.miniSectorBest": "Personal best mini sector",
    "driver.miniSectorSlower": "Slower than best",
    "driver.sectorBest": "Overall best sector",
    "driver.sectorPersonalBest": "Personal best sector",
    "driver.sectorSlower": "Slower than personal best",
    "driver.sectorCurrent": "Current sector time",
    "driver.soft": "Soft",
    "driver.medium": "Medium",
    "driver.hard": "Hard",
    "driver.intermediate": "Intermediate",
    "driver.wet": "Wet",
    // RaceControl
    "raceControl.title": "Race Control",
    "raceControl.lap": "Lap {{lap}}",
    "raceControl.noMessages": "No messages",

    // RaceControl - Categories (from API)
    "raceControl.category.Flag": "Flag",
    "raceControl.category.SafetyCar": "Safety Car",
    "raceControl.category.CarEvent": "Car Event",
    "raceControl.category.Drs": "DRS",
    "raceControl.category.TrackLimits": "Track Limits",
    "raceControl.category.Other": "Other",

    // RaceControl - Flag messages (keep in English as standard)
    "raceControl.flag.green": "GREEN FLAG",
    "raceControl.flag.yellow": "YELLOW FLAG",
    "raceControl.flag.doubleYellow": "DOUBLE YELLOW FLAG",
    "raceControl.flag.red": "RED FLAG",
    "raceControl.flag.blue": "BLUE FLAG",
    "raceControl.flag.chequered": "CHEQUERED FLAG",
    "raceControl.flag.blackWhite": "BLACK AND WHITE FLAG",
    "raceControl.flag.black": "BLACK FLAG",

    // RaceControl - Common message patterns
    "raceControl.msg.trackLimits": "TRACK LIMITS",
    "raceControl.msg.safetyCarDeployed": "SAFETY CAR DEPLOYED",
    "raceControl.msg.safetyCarEnding": "SAFETY CAR ENDING",
    "raceControl.msg.vscDeployed": "VSC DEPLOYED",
    "raceControl.msg.vscEnding": "VSC ENDING",
    "raceControl.msg.drsEnabled": "DRS ENABLED",
    "raceControl.msg.drsDisabled": "DRS DISABLED",
    "raceControl.msg.cleared": "CLEARED",
    "raceControl.msg.clear": "CLEAR",
    "raceControl.msg.allClear": "ALL CLEAR",

    // TeamRadios
    "teamRadios.title": "Team Radios",
    "teamRadios.noRadios": "No communications",

    // TrackViolations
    "violations.title": "Track Violations",
    "violations.noViolations": "No violations",
    "violations.violation": "Violation",
    "violations.violations": "Violations",

    // TrackMap
    "map.loading": "Loading map...",
    "map.error": "Error loading map",
    "map.notAvailable": "Map not available",

    // Footer
    "footer.madeWith": "Made with",
    "footer.version": "Version",
    "footer.disclaimer":
      "This site is not affiliated, associated, authorized, endorsed by, or in any way officially connected with Formula 1, FIA, or any of its subsidiaries or affiliates.",

    // Error messages
    "error.demo": "Demo Mode:",
    "error.demoData": "Live data unavailable. Displaying demo data.",
    "error.connection": "Connecting to server...",
    "error.reconnecting": "Reconnecting...",

    // Track status
    "status.allClear": "All Clear",
    "status.yellow": "Yellow Flag",
    "status.green": "Green Flag",
    "status.scDeployed": "Safety Car Deployed",
    "status.red": "Red Flag",
    "status.vscDeployed": "VSC Deployed",
    "status.vscEnding": "VSC Ending",

    // Session types
    "session.title": "Session",
    "session.remaining": "Remaining",
    "session.lap": "Lap",
    "session.type": "Type",
    "session.race": "Race",
    "session.qualifying": "Qualifying",
    "session.practice": "Practice",
    "session.sprintQualifying": "Sprint Qualifying",
    "session.sprint": "Sprint",

    // Weather
    "weather.trackTemp": "Track Temperature",
    "weather.airTemp": "Air Temperature",
    "weather.humidity": "Humidity",
    "weather.rain": "Rain detected",
    "weather.dry": "Dry conditions",
    "weather.wind": "Wind",
  },
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("es");

  useEffect(() => {
    const saved = localStorage.getItem("f1-dashboard-language") as Language;
    if (saved && (saved === "es" || saved === "en")) {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("f1-dashboard-language", lang);
  };
  const t = (key: string, params?: Record<string, string | number>): string => {
    const dict = translations[language] as Record<string, string>;
    let text = dict[key] || key;

    // Replace {{param}} placeholders with values
    if (params) {
      Object.entries(params).forEach(([param, value]) => {
        text = text.replace(new RegExp(`{{${param}}}`, "g"), String(value));
      });
    }

    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
