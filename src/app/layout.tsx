import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 Live Dashboard",
  description: "Live F1 telemetry and timing data",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
