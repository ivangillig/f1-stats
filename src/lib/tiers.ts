/**
 * Subscription tiers and feature entitlements.
 *
 * Single source of truth for "what does each tier unlock". Both the UI (to
 * show/hide, for UX) and the server (to actually gate — the real enforcement)
 * ask `can(tier, feature)`. Adding a tier or feature = edit the map here; no
 * scattered `tier === 'pro'` checks across components.
 *
 * SECURITY: the UI check is cosmetic. The enforcing check must run server-side
 * (e.g. the authenticated SSE route filters proxy events the user can't access;
 * gated endpoints 403 before serving). Never rely on the client to hide data
 * it already received.
 */

export const TIERS = ["free", "pro", "pro_plus"] as const;
export type Tier = (typeof TIERS)[number];

export type Feature =
  | "carTelemetry" // live RPM/speed/throttle/brake stream
  | "replaySeek" // scrub/seek within recorded sessions
  | "history"; // access to past sessions archive

const FEATURES: Record<Tier, Record<Feature, boolean>> = {
  free: { carTelemetry: false, replaySeek: false, history: false },
  pro: { carTelemetry: true, replaySeek: true, history: false },
  pro_plus: { carTelemetry: true, replaySeek: true, history: true },
};

export function can(tier: Tier, feature: Feature): boolean {
  return FEATURES[tier]?.[feature] ?? false;
}

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}
