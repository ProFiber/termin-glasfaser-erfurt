import { useMemo } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { Contact, CallState } from "@/lib/types";

const MAGENTA = "#e20074";

type NvtRow = {
  nvt: string;
  ort: string;
  gesamt: number;
  erledigt: number;
  termin: number;
  offen: number;
  abgelehnt: number;
  pct: number;
};

export default function NvtTab({
  contacts,
  states,
}: {
  contacts: Contact[];
  states: Record<string, CallState>;
}) {
  const rows = useMemo<NvtRow[]>(() => {
    const map = new Map<string, NvtRow>();
    for (const c of contacts) {
      const nvt = (c.nvt || "—").trim() || "—";
      const ort = (c.ort || "").trim();
      let r = map.get(nvt);
      if (!r) {
        r = { nvt, ort, gesamt: 0, erledigt: 0, termin: 0, offen: 0, abgelehnt: 0, pct: 0 };
        map.set(nvt, r);
      }
      r.gesamt++;
      const st = states[c.bid]?.status ?? "offen";
      if (st === "erledigt") r.erledigt++;
      else if (st === "termin") r.termin++;
      else if (st === "abgelehnt") r.abgelehnt++;
      else r.offen++;
    }
    const arr = Array.from(map.values());
    for (const r of arr) r.pct = r.gesamt ? (r.erledigt / r.gesamt) * 100 : 0;
    arr.sort((a, b) => b.pct - a.pct || b.gesamt - a.gesamt);
    return arr;
  }, [contacts, states]);

  const totalGesamt = rows.reduce((s, r) => s + r.gesamt, 0);
  const totalErledigt = rows.reduce((s, r) => s + r.erledigt, 0);
  const totalPct = totalGesamt ? Math.round((totalErledigt / totalGesamt) * 100) : 0;

  function shareWhatsApp() {
    const date = new Date().toLocaleDateString("de-DE");
    const lines: string[] = [];
    lines.push("📊 NVT-Fortschritt · An der Schmücke");
    lines.push(`Stand: ${date}`);
    lines.push("");
    lines.push(`Gesamt: ${totalErledigt} von ${totalGesamt} (${totalPct}%)`);
    lines.push("");
    for (const r of rows) {
      const pct = Math.round(r.pct);
      const filled = Math.round(pct / 10);
      const bar = "█".repeat(filled) + "░".repeat(10 - filled);
      lines.push(`${r.nvt} ${r.ort} ${bar} ${pct}%`);
      lines.push(`✅ ${r.erledigt} erledigt von ${r.gesamt} gesamt`);
      lines.push("");
    }
    const text = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  function cardBg(pct: number): string {
    if (pct >= 100) return "#d1fae5";
    if (pct > 50) return "#ecfdf5";
    return "white";
  }

  return (
    <div style={{ padding: 12, paddingBottom: 100, background: "#f8fafc", minHeight: "100%" }}>
      <div style={{
        background: "white", borderRadius: 12, padding: 14, marginBottom: 12,
        border: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>📊 NVT-Übersicht</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            {totalErledigt} von {totalGesamt} Objekten erledigt · <b style={{ color: MAGENTA }}>{totalPct}%</b> Fortschritt
          </div>
        </div>
        <button onClick={shareWhatsApp}
          style={{
            background: "#25D366", color: "white", border: "none", borderRadius: 10,
            padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
          }}>
          💬 Teilen
        </button>
      </div>

      <ChartsSection rows={rows} states={states} totalPct={totalPct} />


      {rows.map((r) => {
        const pct = Math.round(r.pct);
        return (
          <div key={r.nvt} style={{
            background: cardBg(r.pct), border: `1px solid ${r.pct >= 100 ? "#10b981" : "#e5e7eb"}`,
            borderRadius: 12, padding: 12, marginBottom: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>{r.nvt}</div>
                <div style={{ fontSize: 12, color: "#666" }}>{r.ort || "—"} · {r.gesamt} Objekte</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: r.pct >= 100 ? "#059669" : r.pct > 50 ? "#16a34a" : "#111" }}>
                {pct}%
              </div>
            </div>

            <div style={{
              height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden", marginBottom: 8,
            }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: r.pct >= 100 ? "#059669" : "#22c55e",
                transition: "width 0.3s",
              }} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, fontWeight: 600 }}>
              <span style={{ color: "#16a34a" }}>✅ {r.erledigt} erl.</span>
              <span style={{ color: "#3b82f6" }}>📅 {r.termin} Termin</span>
              <span style={{ color: "#6b7280" }}>⚪ {r.offen} offen</span>
              <span style={{ color: "#ef4444" }}>🔴 {r.abgelehnt} abgel.</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
