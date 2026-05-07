import { useMemo } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { Contact, CallState } from "@/lib/types";
import { isPriorityNvt, isUrgentNvt } from "@/lib/priority";

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

      {(() => {
        const urgent = rows.filter((r) => isUrgentNvt(r.nvt));
        const prio = rows.filter((r) => isPriorityNvt(r.nvt) && !isUrgentNvt(r.nvt));
        const rest = rows.filter((r) => !isPriorityNvt(r.nvt));
        const sumPct = (list: NvtRow[]) => {
          const g = list.reduce((s, r) => s + r.gesamt, 0);
          const e = list.reduce((s, r) => s + r.erledigt, 0);
          return { g, e, pct: g ? Math.round((e / g) * 100) : 0 };
        };
        const u = sumPct(urgent);
        const p = sumPct(prio);

        const renderCard = (r: NvtRow, kind: "urgent" | "prio" | "normal") => {
          const pct = Math.round(r.pct);
          const accent = kind === "urgent" ? "#dc2626" : kind === "prio" ? "#f97316" : null;
          const emoji = kind === "urgent" ? "🔴 " : kind === "prio" ? "🔥 " : "";
          return (
            <div key={r.nvt} style={{
              background: cardBg(r.pct),
              border: `1px solid ${r.pct >= 100 ? "#10b981" : "#e5e7eb"}`,
              borderLeft: accent ? `4px solid ${accent}` : undefined,
              borderRadius: 12, padding: 12, marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>
                    {emoji}{r.nvt}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>{r.ort || "—"} · {r.gesamt} Objekte</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: r.pct >= 100 ? "#059669" : r.pct > 50 ? "#16a34a" : "#111" }}>
                  {pct}%
                </div>
              </div>
              <div style={{ height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
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
        };

        return (
          <>
            {urgent.length > 0 && (
              <>
                <div style={{
                  background: "#fee2e2", border: "1px solid #fca5a5",
                  color: "#7f1d1d", fontWeight: 800, fontSize: 13,
                  padding: "10px 12px", borderRadius: 10, marginBottom: 10,
                }}>
                  🔴 Höchste Priorität – sofort abarbeiten
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: "#7f1d1d" }}>
                    {u.e} / {u.g} dringende Objekte erledigt ({u.pct}%)
                  </div>
                </div>
                {urgent.map((r) => renderCard(r, "urgent"))}
              </>
            )}
            {prio.length > 0 && (
              <>
                <div style={{
                  background: "#fff7ed", border: "1px solid #fed7aa",
                  color: "#9a3412", fontWeight: 800, fontSize: 13,
                  padding: "10px 12px", borderRadius: 10, marginBottom: 10,
                }}>
                  🔥 Priorität – zuerst abarbeiten
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: "#9a3412" }}>
                    {p.e} / {p.g} prioritäre Objekte erledigt ({p.pct}%)
                  </div>
                </div>
                {prio.map((r) => renderCard(r, "prio"))}
              </>
            )}
            {rest.length > 0 && (
              <>
                <div style={{
                  background: "#f1f5f9", color: "#334155", fontWeight: 700, fontSize: 13,
                  padding: "10px 12px", borderRadius: 10, marginTop: 6, marginBottom: 10,
                }}>
                  Weitere NVTs
                </div>
                {rest.map((r) => renderCard(r, "normal"))}
              </>
            )}
          </>
        );
      })()}
    </div>
  );
}

type NvtRowMin = {
  nvt: string; gesamt: number; erledigt: number; termin: number; offen: number; abgelehnt: number; pct: number;
};

function ChartsSection({
  rows, states, totalPct,
}: {
  rows: NvtRowMin[];
  states: Record<string, CallState>;
  totalPct: number;
}) {
  const totals = useMemo(() => {
    let erledigt = 0, termin = 0, offen = 0, abgelehnt = 0;
    for (const r of rows) {
      erledigt += r.erledigt; termin += r.termin; offen += r.offen; abgelehnt += r.abgelehnt;
    }
    return [
      { name: "Erledigt", value: erledigt, color: "#22c55e" },
      { name: "Termin", value: termin, color: "#3b82f6" },
      { name: "Offen", value: offen, color: "#9ca3af" },
      { name: "Abgelehnt", value: abgelehnt, color: "#ef4444" },
    ];
  }, [rows]);

  const barData = useMemo(
    () => rows.map((r) => ({
      nvt: r.nvt,
      Erledigt: r.erledigt,
      Termin: r.termin,
      Offen: r.offen,
      Abgelehnt: r.abgelehnt,
      pct: Math.round(r.pct),
      gesamt: r.gesamt,
    })),
    [rows],
  );

  const lineData = useMemo(() => {
    const days: { date: string; label: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      days.push({ date: iso, label });
    }
    const perDay = new Map<string, number>(days.map((d) => [d.date, 0]));
    for (const s of Object.values(states)) {
      if (s.status !== "erledigt" || !s.updated_at) continue;
      const iso = new Date(s.updated_at).toISOString().slice(0, 10);
      if (perDay.has(iso)) perDay.set(iso, (perDay.get(iso) ?? 0) + 1);
    }
    let cum = 0;
    return days.map((d) => {
      cum += perDay.get(d.date) ?? 0;
      return { label: d.label, kumuliert: cum };
    });
  }, [states]);

  const cardStyle: React.CSSProperties = {
    background: "white", borderRadius: 12, padding: 16, marginBottom: 12, border: "1px solid #e5e7eb",
  };

  return (
    <>
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 8, textAlign: "center" }}>
          Gesamtverteilung
        </div>
        <div style={{ position: "relative", width: "100%", height: 220, display: "flex", justifyContent: "center" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={totals}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
              >
                {totals.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -65%)",
            textAlign: "center", pointerEvents: "none",
          }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#111" }}>{totalPct}%</div>
            <div style={{ fontSize: 11, color: "#666" }}>erledigt</div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 8 }}>
          Status pro NVT
        </div>
        <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 38)}>
          <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 40, left: 0, bottom: 5 }}>
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="nvt" fontSize={11} width={70} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Erledigt" stackId="a" fill="#22c55e">
              {barData.map((_, i) => <Cell key={i} />)}
            </Bar>
            <Bar dataKey="Termin" stackId="a" fill="#3b82f6" />
            <Bar dataKey="Offen" stackId="a" fill="#9ca3af" />
            <Bar dataKey="Abgelehnt" stackId="a" fill="#ef4444"
              label={{
                position: "right",
                formatter: (_v: number, _n: string, props: { payload?: { pct?: number } }) =>
                  `${props?.payload?.pct ?? 0}%`,
                fontSize: 11,
                fill: "#111",
              }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 8 }}>
          Erledigungen der letzten 14 Tage
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={lineData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="kumuliert" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
