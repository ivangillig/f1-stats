import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

export const runtime = "edge";

export const alt = siteConfig.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at 80% 0%, rgba(225,6,0,0.35), transparent 55%)",
          padding: "80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              width: "16px",
              height: "64px",
              backgroundColor: "#e10600",
            }}
          />
          <div
            style={{
              fontSize: "34px",
              color: "#9ca3af",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
            }}
          >
            Live Timing
          </div>
        </div>
        <div
          style={{
            fontSize: "92px",
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          F1 Stats
        </div>
        <div
          style={{
            marginTop: "32px",
            fontSize: "36px",
            color: "#d1d5db",
            maxWidth: "900px",
            lineHeight: 1.3,
          }}
        >
          Telemetría y tiempos de Fórmula 1 en tiempo real
        </div>
      </div>
    ),
    { ...size },
  );
}
