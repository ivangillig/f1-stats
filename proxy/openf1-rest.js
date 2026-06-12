/**
 * Shared OpenF1 REST helpers — auth-aware fetch with 429 backoff.
 * Used by replay.js (streaming fallback) and session-downloader.js (archive).
 */

import { ensureValidToken, hasMQTTCredentials } from "./mqtt-client.js";

export const API_BASE = "https://api.openf1.org/v1";

// Request spacing to stay within OpenF1 rate limits (paid 60 req/min, free 30)
export const PAID_REQUEST_DELAY_MS = 800;
export const FREE_REQUEST_DELAY_MS = 1800;

export function requestDelayMs() {
  return hasMQTTCredentials() ? PAID_REQUEST_DELAY_MS : FREE_REQUEST_DELAY_MS;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Fetch with error handling and 429/5xx retry backoff.
// 404 returns [] — normal for time windows with no data (NOT an error).
// On unrecoverable failure returns `errorValue`: callers that must tell
// "no data" apart from "request failed" (the downloader) pass null.
export async function fetchJSON(
  url,
  retries = 4,
  tag = "[openf1-rest]",
  errorValue = [],
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers = {};
      if (hasMQTTCredentials()) {
        try {
          const token = await ensureValidToken();
          headers["Authorization"] = `Bearer ${token}`;
        } catch {
          // Fall through to unauthenticated request
        }
      }
      const response = await fetch(url, { headers });
      if (response.status === 429 || response.status >= 500) {
        const delay = 2000 * (attempt + 1);
        console.warn(
          `${tag} HTTP ${response.status}, retrying in ${delay / 1000}s...`,
        );
        await sleep(delay);
        continue;
      }
      if (response.status === 404) {
        return [];
      }
      if (!response.ok) {
        console.error(`${tag} API error: ${response.status} for ${url}`);
        return errorValue;
      }
      return await response.json();
    } catch (error) {
      const isLastAttempt = attempt >= retries;
      if (isLastAttempt) break;
      const delay = 2000 * (attempt + 1);
      console.warn(
        `${tag} Transient error (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay / 1000}s: ${error.message}`,
      );
      await sleep(delay);
    }
  }
  console.error(`${tag} Giving up after ${retries + 1} attempts for ${url}`);
  return errorValue;
}
