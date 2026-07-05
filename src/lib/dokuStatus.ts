// Zentrale, immer live berechnete Doku-Status-Logik.
// Reihenfolge der Regeln ist bindend – erste zutreffende gewinnt.
//
// Rohfelder aus Excel "Alle GF+ HA":
//   FotoGIS   (Ja/Nein)   → doku_states.foto
//   Protokoll (Ja/Nein)   → doku_states.protokoll
//   SharePoint (Ja/Nein)  → doku_states.sharepoint
//   Eingereicht am        → call_states.eingereicht_am
//   Aufmaß                → call_states.aufmass_am

export type DokuStatus =
  | "vollstaendig"   // Aufmaß vom AG bestätigt
  | "inPruefung"     // eingereicht + alle 3 Doku vorhanden
  | "unvollstaendig" // eingereicht, aber AG hat bemängelt – Doku fehlt
  | "ok"             // noch nicht eingereicht, aber alle 3 Doku vorhanden
  | "offen"          // 1–2 Doku vorhanden
  | "leer";          // keine Doku

export type DokuInput = {
  foto: boolean;
  protokoll: boolean;
  sharepoint: boolean;
  eingereicht_am: string | null | undefined;
  aufmass_am: string | null | undefined;
};

export function deriveDokuStatus(i: DokuInput): DokuStatus {
  const alle = i.foto && i.protokoll && i.sharepoint;
  const count = (i.foto ? 1 : 0) + (i.protokoll ? 1 : 0) + (i.sharepoint ? 1 : 0);
  if (i.aufmass_am) return "vollstaendig";
  if (i.eingereicht_am && alle) return "inPruefung";
  if (i.eingereicht_am && !alle) return "unvollstaendig";
  if (!i.eingereicht_am && alle) return "ok";
  if (!i.eingereicht_am && count > 0) return "offen";
  return "leer";
}

export const DOKU_STATUS_META: Record<
  DokuStatus,
  { label: string; color: string; bg: string; fg: string }
> = {
  vollstaendig:   { label: "Vollständig",   color: "#16a34a", bg: "#dcfce7", fg: "#166534" },
  inPruefung:     { label: "In Prüfung",    color: "#2563eb", bg: "#dbeafe", fg: "#1e40af" },
  unvollstaendig: { label: "unvollständig", color: "#dc2626", bg: "#fee2e2", fg: "#991b1b" },
  ok:             { label: "ok",            color: "#4ade80", bg: "#f0fdf4", fg: "#15803d" },
  offen:          { label: "offen",         color: "#94a3b8", bg: "#f1f5f9", fg: "#475569" },
  leer:           { label: "—",             color: "#cbd5e1", bg: "#f8fafc", fg: "#94a3b8" },
};

/** Fehlende Doks bei "unvollständig" – Reihenfolge stabil für Anzeige. */
export function fehlendeDoks(i: Pick<DokuInput, "foto" | "protokoll" | "sharepoint">): string[] {
  const out: string[] = [];
  if (!i.foto) out.push("FotoGIS");
  if (!i.protokoll) out.push("Protokoll");
  if (!i.sharepoint) out.push("SharePoint");
  return out;
}

/** Anzahl Tage seit Einreichung (nur wenn eingereicht_am gesetzt). */
export function tageInPruefung(eingereicht_am: string | null | undefined): number | null {
  if (!eingereicht_am) return null;
  const t = new Date(eingereicht_am).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}
