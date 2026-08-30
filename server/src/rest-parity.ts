// Shared serializers for the self-hosted API. Keep these independent from Convex
// so the VPS runtime can expose the same domain concepts without importing it.
import { strategyDefs } from "./strategies.js";

export function publicStrategies() {
  return strategyDefs().map((s) => ({ ...s, enabled: true, active: true }));
}

export function strategyFamilies() {
  const rows = strategyDefs();
  return [...new Set(rows.map((s) => s.category))].sort();
}

export function parseBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  return value === true || value === "true" || value === 1 || value === "1";
}
