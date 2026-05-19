// NVT-Prioritätssystem: 0 = keine, 1 = niedrig, 2 = mittel, 3 = höchste
export type PriorityLevel = 0 | 1 | 2 | 3;

// Aktuelle Priorität-3-NVTs (höchste Priorität)
export const NVT_PRIORITY: Record<string, PriorityLevel> = {
  "2V8001": 3,
  "2V8002": 3,
  "2V8007": 3,
  "2V8008": 3,
  "2V8009": 3,
  "2V8014": 3,
  "2V8015": 3,
  "2V8016": 3,
};

// ─── Konfiguration ───────────────────────────────────────────────
// Anzahl aktiver Teams – hier anpassen wenn sich die Teamanzahl ändert
export const NUM_TEAMS = 2;

// Aufträge pro Team pro Tag (Planungsgrundlage für Ampellogik)
export const AUFTRAEGE_PRO_TEAM_PRO_TAG = 3;
// ────────────────────────────────────────────────────────────────

export function getNvtPriority(nvt: string | null | undefined): PriorityLevel {
  if (!nvt) return 0;
  return NVT_PRIORITY[nvt] ?? 0;
}

export function priorityStars(level: PriorityLevel): string {
  if (level === 3) return "⭐⭐⭐";
  if (level === 2) return "⭐⭐";
  if (level === 1) return "⭐";
  return "";
}

// Legacy-Kompatibilität
export const URGENT_NVTS = Object.entries(NVT_PRIORITY)
  .filter(([, v]) => v === 3)
  .map(([k]) => k);

export const PRIORITY_NVTS = Object.entries(NVT_PRIORITY)
  .filter(([, v]) => v >= 2)
  .map(([k]) => k);

export const isUrgentNvt = (nvt: string | null | undefined): boolean =>
  getNvtPriority(nvt) === 3;

export const isPriorityNvt = (nvt: string | null | undefined): boolean =>
  getNvtPriority(nvt) >= 2;
