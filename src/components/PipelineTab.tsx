import { useMemo, useState } from "react";
import type { Contact, CallState } from "@/lib/types";

type Props = {
  contacts: Contact[];
  states: Record<string, CallState>;
};

type StageKey = "gebaut" | "aufmass" | "eingereicht" | "avisiert" | "verguetet";

const STAGES: { key: StageKey; label: string; color: string }[] = [
  { key: "gebaut",      label: "🚧 Gebaut",         color: "#3b82f6" },
  { key: "aufmass",     label: "📐 Aufmaß",         color: "#8b5cf6" },
  { key: "eingereicht", label: "📤 Eingereicht",    color: "#f59e0b" },
  { key: "avisiert",    label: "📬 Avisiert",       color: "#0ea5e9" },
  { key: "verguetet",   label: "💶 Vergütet",       color: "#22c55e" },
];

function stageOf(cs: CallState | undefined): StageKey | null {
  if (!cs || cs.status !== "erledigt") return null;
  if (cs.verguetet_am) return "verguetet";
  if (cs.avis_am) return "avisiert";
  if (cs.eingereicht_am || cs.pruefung_status === "eingereicht") return "eingereicht";
  if (cs.aufmass_am) return "aufmass";
  return "gebaut";
}

function stageDateOf(cs: CallState, stage: StageKey): string | null {
  switch (stage) {
    case "gebaut":      return cs.erledigt_datum ?? null;
    case "aufmass":     return cs.aufmass_am ?? null;
    case "eingereicht": return cs.eingereicht_am ?? null;
    case "avisiert":    return cs.avis_am ?? null;
    case "verguetet":   return cs.verguetet_am ?? null;
  }
}

function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = today.getTime() - d.getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

function ageColor(days: number | null, stage: StageKey): string {
  if (days === null || stage === "verguetet") return "#64748b";
  if (stage === "gebaut" || stage === "aufmass") {
    if (days > 14) return "#dc2626";
    if (days > 7) return "#f59e0b";
    return "#22c55e";
  }
  // eingereicht / avisiert – lange Wartezeit üblich
  if (days > 45) return "#dc2626";
  if (days > 21) return "#f59e0b";
  return "#22c55e";
}

function reasonFor(cs: CallState, stage: StageKey): string | null {
  if (cs.klarfall) return `⚠️ Klärfall${cs.klarfall_notiz ? `: ${cs.klarfall_notiz}` : ""}`;
  if (cs.pruefung_status === "nachforderung") {
    const gr = (cs.pruefung_nachforderung ?? []).join(", ");
    return `↩ Nachforderung${gr ? `: ${gr}` : ""}${cs.pruefung_notiz ? ` (${cs.pruefung_notiz})` : ""}`;
  }
  if (stage === "gebaut") {
    const miss: string[] = [];
    if (!cs.fotos_erhalten) miss.push("Foto");
    if (!cs.protokoll_erhalten) miss.push("Protokoll");
    if (miss.length) return `📎 ${miss.join(" + ")} fehlt`;
    return "wartet auf Aufmaß";
  }
  if (stage === "aufmass") return "wartet auf Einreichung";
  if (stage === "eingereicht") return "wartet auf Avis von Telekom";
  if (stage === "avisiert") return "wartet auf Vergütung";
  return null;
}

export default function PipelineTab({ contacts, states }: Props) {
  const [hideVerguetet, setHideVerguetet] = useState(true);

  const grouped = useMemo(() => {
    const g: Record<StageKey, { c: Contact; cs: CallState; days: number | null }[]> = {
      gebaut: [], aufmass: [], eingereicht: [], avisiert: [], verguetet: [],
    };
    for (const c of contacts) {
      const cs = states[c.bid];
      const s = stageOf(cs);
      if (!s) continue;
      const days = daysBetween(stageDateOf(cs!, s));
      g[s].push({ c, cs: cs!, days });
    }
    // sort by age desc within each stage (ältester zuerst)
    for (const k of Object.keys(g) as StageKey[]) {
      g[k].sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
    }
    return g;
  }, [contacts, states]);

  const visibleStages = hideVerguetet ? STAGES.filter(s => s.key !== "verguetet") : STAGES;
  const total = STAGES.reduce((n, s) => n + grouped[s.key].length, 0);
  const stuck = grouped.gebaut.filter(x => (x.days ?? 0) > 14).length
             + grouped.aufmass.filter(x => (x.days ?? 0) > 14).length
             + grouped.eingereicht.filter(x => (x.days ?? 0) > 45).length
             + grouped.avisiert.filter(x => (x.days ?? 0) > 45).length;

  return (
    <div style={{ padding: 12, background: "#f8fafc", minHeight: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Pipeline Bau → Vergütung</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            {total} Objekte in der Pipeline · <b style={{ color: stuck > 0 ? "#dc2626" : "#22c55e" }}>{stuck}</b> hängen zu lange
          </div>
        </div>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={hideVerguetet} onChange={(e) => setHideVerguetet(e.target.checked)} />
          Vergütete ausblenden
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${visibleStages.length}, minmax(220px, 1fr))`, gap: 8, overflowX: "auto" }}>
        {visibleStages.map((stage) => {
          const items = grouped[stage.key];
          return (
            <div key={stage.key} style={{ background: "white", borderRadius: 10, padding: 8, minWidth: 220, borderTop: `4px solid ${stage.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px 8px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{stage.label}</span>
                <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 999 }}>{items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
                {items.length === 0 && (
                  <div style={{ fontSize: 11, color: "#94a3b8", padding: 10, textAlign: "center" }}>—</div>
                )}
                {items.map(({ c, cs, days }) => {
                  const col = ageColor(days, stage.key);
                  const reason = reasonFor(cs, stage.key);
                  return (
                    <div key={c.bid} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#fff" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", lineHeight: 1.25 }}>
                        {c.strasse} {c.hnr}{c.hnr_zusatz ?? ""}
                      </div>
                      <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
                        {c.name || "—"} · NVT {c.nvt || "?"}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: col }}>
                          {days === null ? "—" : `${days} T${days === 1 ? "" : "."} in Stufe`}
                        </span>
                        {cs.team && (
                          <span style={{ fontSize: 9, color: "#64748b" }}>
                            {cs.team === "team1" ? "Jozey" : cs.team === "team2" ? "Adil" : cs.team}
                          </span>
                        )}
                      </div>
                      {reason && (
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 4, padding: "4px 6px", background: "#f8fafc", borderRadius: 6, borderLeft: `2px solid ${col}` }}>
                          {reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
