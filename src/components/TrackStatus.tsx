"use client";

import { TrackStatusInfo } from "@/types/f1";
import { TRACK_STATUS } from "@/lib/constants";
import { useLanguage } from "@/contexts/LanguageContext";

interface TrackStatusProps {
  status: TrackStatusInfo;
}

export default function TrackStatus({ status }: TrackStatusProps) {
  const { t } = useLanguage();
  const statusInfo = TRACK_STATUS[status.status] || TRACK_STATUS[1];

  // Traducir el mensaje del status
  const getStatusText = () => {
    if (status.message) {
      // Traducir mensajes comunes de la API
      const messageUpper = status.message.toUpperCase().trim();

      // Verificar coincidencias exactas primero
      if (messageUpper === "ALLCLEAR" || messageUpper === "ALL CLEAR") {
        return t("status.allClear");
      }

      // Luego verificar contenidos
      if (messageUpper.includes("GREEN")) {
        return t("status.green");
      }
      if (messageUpper.includes("YELLOW")) {
        return t("status.yellow");
      }
      if (messageUpper.includes("RED")) {
        return t("status.red");
      }
      if (
        messageUpper.includes("SC DEPLOYED") ||
        messageUpper.includes("SAFETY CAR")
      ) {
        return t("status.scDeployed");
      }
      if (messageUpper.includes("VSC DEPLOYED")) {
        return t("status.vscDeployed");
      }
      if (messageUpper.includes("VSC ENDING")) {
        return t("status.vscEnding");
      }
      // Si no hay traducción, devolver el mensaje original
      return status.message;
    }
    // Traducir los estados estándar basados en el código
    const statusKey = `status.${statusInfo.key}`;
    return t(statusKey);
  };

  return (
    <div
      className="flex items-center justify-center gap-3 py-2 px-4 border-b border-zinc-800"
      style={{
        backgroundColor: `${statusInfo.color}15`,
        boxShadow: `0 0 60px 10px ${statusInfo.color}40`,
      }}
    >
      <div
        className="w-4 h-4 rounded-full"
        style={{
          backgroundColor: statusInfo.color,
          boxShadow: `0 0 20px ${statusInfo.color}`,
          animation:
            status.status !== 1 ? "pulse 1s ease-in-out infinite" : "none",
        }}
      />
      <span
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: statusInfo.color }}
      >
        {getStatusText()}
      </span>
    </div>
  );
}
