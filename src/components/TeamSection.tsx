import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Contact, CallState } from "@/lib/types";

type Props = {
  contact: Contact;
  cs: CallState | undefined;
  onPatch: (changes: Partial<Pick<CallState, "team" | "team_status" | "fotos_erhalten" | "protokoll_erhalten">>) => void;
};

const TEAM_COLORS: Record<string, { bg: string; label: string }> = {
  team1: { bg: "#3b82f6", label: "Team Halil" },
  team2: { bg: "#7c3aed", label: "Team Adil" },
};

const STEPS = [
  { key: "zugewiesen", label: "Zugewiesen" },
  { key: "in_arbeit", label: "In Arbeit" },
  { key: "fertig", label: "Fertig" },
];

function buildAddress(c: Contact) {
  return `${c.strasse} ${c.hnr}${c.hnr_zusatz}, ${c.plz} ${c.ort}, Germany`;
}

function buildWaMessage(c: Contact, team: string) {
  const teamLabel = team === "team1" ? "Halil" : team === "team2" ? "Adil" : "?";
  const adr = encodeURIComponent(buildAddress(c));
  return `👷 *Neuer Auftrag · Glasfaser*
_Störmer Bau · Pro-Fiber_

📍 *${c.strasse} ${c.hnr}${c.hnr_zusatz}* — ${c.name}
🏠 ${c.typ}${c.we ? ` · ${c.we} WE` : ""}
📮 ${c.plz} ${c.ort}
🔌 NVT: ${c.nvt}
📞 Eigentümer: ${c.mobil}
☎️ Festnetz: ${c.festnetz}

🗺️ Navigation: https://www.google.com/maps/dir/?api=1&destination=${adr}
📸 Streetview: https://www.google.com/maps?q=${adr}

⚠️ Bitte Fotos + Protokoll gemeinsam hochladen wenn fertig.

_Team ${teamLabel} · Pro-Fiber GmbH_`;
}

export default function TeamSection({ contact, cs, onPatch }: Props) {
  const team = cs?.team ?? "";
  const teamStatus = cs?.team_status ?? "";
  const fotos = cs?.fotos_erhalten ?? false;
  const protokoll = cs?.protokoll_erhalten ?? false;

  const currentStepIdx = STEPS.findIndex((s) => s.key === teamStatus);

  // When both received → mark doku state as foto+protokoll
  const [doneSynced, setDoneSynced] = useState(false);
  useEffect(() => { setDoneSynced(false); }, [contact.bid]);
  useEffect(() => {
    if (fotos && protokoll && !doneSynced) {
      setDoneSynced(true);
      supabase.from("doku_states").upsert(
        { bid: contact.bid, foto: true, protokoll: true },
        { onConflict: "bid" }
      ).then(({ error }) => { if (error) console.error("doku sync failed", error); });
    }
  }, [fotos, protokoll, doneSynced, contact.bid]);

  function openWa() {
    const msg = buildWaMessage(contact, team);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div style={{ marginTop: 12, marginBottom: 12, padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: "#475569", letterSpacing: 1, marginBottom: 8 }}>👷 TEAM</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: team ? 10 : 0 }}>
        <button
          onClick={() => onPatch({ team: "", team_status: "" })}
          style={{
            padding: "9px 4px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
            background: team === "" ? "#475569" : "#f1f5f9",
            color: team === "" ? "white" : "#64748b",
          }}
        >— Kein Team</button>
        {(["team1", "team2"] as const).map((t) => {
          const active = team === t;
          const meta = TEAM_COLORS[t];
          return (
            <button
              key={t}
              onClick={() => onPatch({ team: t, team_status: teamStatus || "zugewiesen" })}
              style={{
                padding: "9px 4px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
                background: active ? meta.bg : "#f1f5f9",
                color: active ? "white" : "#64748b",
              }}
            >👷 {meta.label}</button>
          );
        })}
      </div>

      {team && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
            {STEPS.map((s, i) => {
              const completed = currentStepIdx >= 0 && i < currentStepIdx;
              const current = s.key === teamStatus;
              const bg = completed ? "#10b981" : current ? "white" : "#f1f5f9";
              const color = completed ? "white" : current ? "#0f172a" : "#94a3b8";
              const border = current ? "2px solid #e20074" : "2px solid transparent";
              return (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                  <button
                    onClick={() => onPatch({ team_status: s.key })}
                    style={{
                      flex: 1, padding: "7px 4px", borderRadius: 7, border, cursor: "pointer",
                      fontWeight: 700, fontSize: 11, background: bg, color,
                    }}
                  >{s.label}</button>
                  {i < STEPS.length - 1 && <span style={{ color: "#cbd5e1", fontSize: 12 }}>→</span>}
                </div>
              );
            })}
          </div>

          {teamStatus === "fertig" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10, padding: "8px 10px", background: "white", borderRadius: 7, border: "1px solid #e2e8f0" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#1e293b", cursor: "pointer" }}>
                <input type="checkbox" checked={fotos} onChange={(e) => onPatch({ fotos_erhalten: e.target.checked })} style={{ width: 18, height: 18 }} />
                📸 Fotos erhalten
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#1e293b", cursor: "pointer" }}>
                <input type="checkbox" checked={protokoll} onChange={(e) => onPatch({ protokoll_erhalten: e.target.checked })} style={{ width: 18, height: 18 }} />
                📄 Protokoll erhalten
              </label>
            </div>
          )}

          <button
            onClick={openWa}
            style={{
              width: "100%", padding: "10px", borderRadius: 8, border: "none", cursor: "pointer",
              background: "#25D366", color: "white", fontWeight: 700, fontSize: 14,
            }}
          >📱 WhatsApp an {TEAM_COLORS[team]?.label ?? "Team"}</button>
        </>
      )}
    </div>
  );
}
