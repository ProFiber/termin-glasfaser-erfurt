import { useEffect, useMemo, useRef, useState } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { Contact, CallState, DokuState } from "@/lib/types";
import { isPriorityNvt, isUrgentNvt } from "@/lib/priority";
import { supabase } from "@/integrations/supabase/client";

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

function todayISO(): string {
  const d = new Date(); d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}

function isSameLocalDay(iso: string | null | undefined, ref: string): boolean {
  if (!iso) return false;
  return new Date(iso).toISOString().slice(0,10) === ref;
}

/** Animated counter */
function useCounter(target: number, ms = 600): number {
  const [val, setVal] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    fromRef.current = val;
    startRef.current = null;
    let raf = 0;
    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return val;
}

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: "#94a3b8",
  letterSpacing: 1, textTransform: "uppercase", marginBottom: 8,
};

const CARD: React.CSSProperties = {
  background: "white", borderRadius: 12, padding: 16, marginBottom: 12,
  border: "1px solid #e5e7eb",
};

export default function NvtTab({
  contacts,
  states,
  onOpenKlarfaelle,
  onOpenAuskundungHeute,
}: {
  contacts: Contact[];
  states: Record<string, CallState>;
  onOpenKlarfaelle?: () => void;
  onOpenAuskundungHeute?: () => void;
}) {
  const [dokuStates, setDokuStates] = useState<Record<string, DokuState>>({});

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase.from("doku_states").select("*");
      if (cancel) return;
      const map: Record<string, DokuState> = {};
      (data as DokuState[] | null)?.forEach((d) => (map[d.bid] = d));
      setDokuStates(map);
    })();
    const ch = supabase
      .channel("doku_states_dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "doku_states" }, (payload) => {
        const row = (payload.new ?? payload.old) as DokuState;
        if (!row?.bid) return;
        setDokuStates((prev) => {
          if (payload.eventType === "DELETE") {
            const n = { ...prev }; delete n[row.bid]; return n;
          }
          return { ...prev, [row.bid]: row };
        });
      })
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, []);

  const today = todayISO();

  const klarfallCount = useMemo(
    () => contacts.reduce((n, c) => n + (states[c.bid]?.klarfall ? 1 : 0), 0),
    [contacts, states],
  );

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
  const totalTermin = rows.reduce((s, r) => s + r.termin, 0);
  const totalOffen = rows.reduce((s, r) => s + r.offen, 0);
  const totalAbgelehnt = rows.reduce((s, r) => s + r.abgelehnt, 0);
  const totalPct = totalGesamt ? Math.round((totalErledigt / totalGesamt) * 100) : 0;

  // Section 1 KPIs
  const termineHeute = useMemo(() => {
    let vm = 0, nm = 0;
    for (const c of contacts) {
      const s = states[c.bid];
      if (s?.termin_datum === today) {
        if (/-NM$/i.test(s.termin_slot || "")) nm++;
        else vm++;
      }
    }
    return { total: vm + nm, vm, nm };
  }, [contacts, states, today]);

  const erledigtHeute = useMemo(() => {
    let n = 0;
    for (const s of Object.values(states)) {
      if (s.status === "erledigt" && isSameLocalDay(s.updated_at, today)) n++;
    }
    return n;
  }, [states, today]);

  // Section 2 progress
  const dokuComplete = useMemo(() => {
    let n = 0;
    for (const c of contacts) {
      const d = dokuStates[c.bid];
      if (d && d.foto && d.protokoll && d.sharepoint) n++;
    }
    return n;
  }, [contacts, dokuStates]);
  const dokuPct = totalGesamt ? Math.round((dokuComplete / totalGesamt) * 100) : 0;

  // Section 3 priority
  const urgentRows = rows.filter((r) => isUrgentNvt(r.nvt));
  const prioRows = rows.filter((r) => isPriorityNvt(r.nvt) && !isUrgentNvt(r.nvt));
  const sumOf = (list: NvtRow[]) => {
    const g = list.reduce((s, r) => s + r.gesamt, 0);
    const e = list.reduce((s, r) => s + r.erledigt, 0);
    return { g, e, pct: g ? Math.round((e / g) * 100) : 0 };
  };
  const u = sumOf(urgentRows);
  const p = sumOf(prioRows);

  // Section 4 team
  const teamHeute = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of Object.values(dokuStates)) {
      if (!d.durchfuehrt_von) continue;
      if (!isSameLocalDay(d.durchfuehrt_am, today)) continue;
      // names may be comma-separated
      const names = d.durchfuehrt_von.split(/[,;/]+/).map((x) => x.trim()).filter(Boolean);
      for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [dokuStates, today]);

  // Section 5 warnings
  const auskundungHeute = useMemo(
    () => contacts.filter((c) => isSameLocalDay(c.auskundung_von, today)),
    [contacts, today],
  );
  const lowPrioNvts = [...urgentRows, ...prioRows].filter((r) => r.pct < 50);

  const grabenTotal = useMemo(
    () => Object.values(states).reduce((s, x) => s + (x.grabenlaenge ?? 0), 0),
    [states],
  );

  const animTermine = useCounter(termineHeute.total);
  const animErledigt = useCounter(erledigtHeute);
  const animKlar = useCounter(klarfallCount);
  const animPct = useCounter(totalPct);
  const animGraben = useCounter(grabenTotal);

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

  const teamColors = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#ef4444"];

  // Stacked bar segments
  const stackTotal = totalErledigt + totalTermin + totalOffen + totalAbgelehnt || 1;
  const stackSegs = [
    { label: "✅", val: totalErledigt, color: "#22c55e" },
    { label: "📅", val: totalTermin, color: "#3b82f6" },
    { label: "⚪", val: totalOffen, color: "#9ca3af" },
    { label: "🔴", val: totalAbgelehnt, color: "#ef4444" },
  ];

  return (
    <div style={{ padding: 12, paddingBottom: 100, background: "#f2f2f7", minHeight: "100%" }}>
      {/* SECTION 1 — Tages-KPIs */}
      <div style={SECTION_TITLE}>📌 Tages-KPIs</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 12 }}>
        <KpiCard
          color="#3b82f6"
          icon="🗓️"
          label="Heute Termine"
          value={animTermine}
          sub={`VM ${termineHeute.vm} · NM ${termineHeute.nm}`}
        />
        <KpiCard
          color="#22c55e"
          icon="✅"
          label="Heute erledigt"
          value={animErledigt}
        />
        <KpiCard
          color="#f59e0b"
          icon="⚠️"
          label="Klärfälle"
          value={animKlar}
          onClick={klarfallCount > 0 ? onOpenKlarfaelle : undefined}
        />
        <KpiCard
          color="#a16207"
          icon="⛏️"
          label="Grabenlänge"
          value={animGraben >= 1000 ? `${(animGraben / 1000).toFixed(1)} km` : `${animGraben} m`}
          sub="Gesamt"
        />
      </div>

      {/* SECTION 2 — Fortschritts-Karussell */}
      <div style={SECTION_TITLE}>📈 Fortschritt</div>
      <ProgressCarousel
        slides={[
          {
            title: "Gesamt",
            color: "#22c55e",
            done: totalErledigt,
            total: totalGesamt,
            pct: totalPct,
            footer: `${totalErledigt} von ${totalGesamt} Objekten erledigt`,
            extra: (
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 6, fontSize: 11, fontWeight: 700 }}>
                <span style={{ color: "#3b82f6" }}>● {totalTermin} Termin</span>
                <span style={{ color: "#6b7280" }}>● {totalOffen} Offen</span>
                <span style={{ color: "#ef4444" }}>● {totalAbgelehnt} Abgel.</span>
              </div>
            ),
          },
          {
            title: "Top Prio",
            color: "#ef4444",
            done: u.e,
            total: u.g,
            pct: u.pct,
            footer: `${u.e} von ${u.g} · NVT 2V8031–34`,
            extra: (
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 6, fontSize: 10, fontWeight: 700, color: "#475569" }}>
                {urgentRows.map((r) => (
                  <span key={r.nvt}>{r.nvt} {Math.round(r.pct)}%</span>
                ))}
              </div>
            ),
          },
          {
            title: "Priorität",
            color: "#f97316",
            done: p.e,
            total: p.g,
            pct: p.pct,
            footer: `${p.e} von ${p.g} · ${prioRows.length} NVTs`,
            extra: (
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 6, fontSize: 10, fontWeight: 700, color: "#475569" }}>
                {[...prioRows].sort((a, b) => b.pct - a.pct).slice(0, 3).map((r) => (
                  <span key={r.nvt}>{r.nvt} {Math.round(r.pct)}%</span>
                ))}
              </div>
            ),
          },
        ]}
      />

      {/* Doku-Fortschritt unter dem Karussell */}
      <div style={CARD}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
          📋 Doku: {dokuComplete} / {totalGesamt} vollständig dokumentiert ({dokuPct}%)
        </div>
        <ProgressBar pct={dokuPct} color="#22c55e" />
      </div>

      {/* SECTION 4 — Team Performance */}
      <div style={SECTION_TITLE}>👥 Team heute</div>
      <div style={CARD}>
        {teamHeute.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "8px 0" }}>
            Heute noch keine Doku-Aktivität.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {teamHeute.map(([name, n], i) => (
              <div key={name} style={{
                background: teamColors[i % teamColors.length] + "1a",
                border: `1px solid ${teamColors[i % teamColors.length]}55`,
                color: teamColors[i % teamColors.length],
                borderRadius: 999, padding: "6px 12px",
                fontSize: 13, fontWeight: 700,
              }}>
                {name}: {n}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 5 — Warnungen & Aktionen */}
      {(klarfallCount > 0 || auskundungHeute.length > 0 || lowPrioNvts.length > 0) && (
        <>
          <div style={SECTION_TITLE}>⚠️ Warnungen & Aktionen</div>
          {klarfallCount > 0 && (
            <button
              type="button"
              onClick={() => onOpenKlarfaelle?.()}
              style={{
                width: "100%", textAlign: "left", cursor: "pointer",
                background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: 12,
                padding: "12px 14px", marginBottom: 10, color: "#7c2d12",
                fontSize: 14, fontWeight: 800,
              }}
            >
              ⚠️ {klarfallCount} offene Klärfall{klarfallCount === 1 ? "" : "e"}
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: "#92400e" }}>
                Tippen, um zur Objekte-Liste zu wechseln
              </div>
            </button>
          )}
          {auskundungHeute.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenAuskundungHeute?.()}
              style={{
                width: "100%", textAlign: "left", cursor: "pointer",
                background: "#dbeafe", border: "2px solid #3b82f6", borderRadius: 12,
                padding: "12px 14px", marginBottom: 10, color: "#1e3a8a",
                fontSize: 14, fontWeight: 800,
              }}
            >
              📅 {auskundungHeute.length} Auskundung{auskundungHeute.length === 1 ? "" : "en"} heute
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: "#1e40af" }}>
                {auskundungHeute.slice(0, 3).map((c) => `${c.strasse} ${c.hnr}`).join(" · ")}
                {auskundungHeute.length > 3 ? " …" : ""}
              </div>
            </button>
          )}
          {lowPrioNvts.length > 0 && (
            <div style={{
              background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 12,
              padding: "12px 14px", marginBottom: 10, color: "#7f1d1d",
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
                🔴 Prioritäts-NVTs unter 50%
              </div>
              {lowPrioNvts.map((r) => (
                <div key={r.nvt} style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>
                  {r.nvt} · {r.ort} — {Math.round(r.pct)}% ({r.erledigt}/{r.gesamt})
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* SECTION 6 — NVT Übersicht (existing) */}
      <div style={SECTION_TITLE}>📡 NVT Fortschritt</div>
      <div style={{
        ...CARD, padding: 12,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>📊 NVT-Übersicht</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            {totalErledigt} von {totalGesamt} · <b style={{ color: MAGENTA }}>{totalPct}%</b>
          </div>
        </div>
        <button onClick={shareWhatsApp}
          style={{
            background: "#25D366", color: "white", border: "none", borderRadius: 10,
            padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>
          💬 Teilen
        </button>
      </div>

      <NvtStatusBar rows={rows} />

      {(() => {
        const rest = rows.filter((r) => !isPriorityNvt(r.nvt));
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
              <ProgressBar pct={pct} color={r.pct >= 100 ? "#059669" : "#22c55e"} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, fontWeight: 600, marginTop: 8 }}>
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
            {urgentRows.length > 0 && urgentRows.map((r) => renderCard(r, "urgent"))}
            {prioRows.length > 0 && prioRows.map((r) => renderCard(r, "prio"))}
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

function KpiCard({
  color, icon, label, value, sub, onClick,
}: {
  color: string; icon: string; label: string; value: number | string; sub?: string; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        background: color + "1a",
        border: `1px solid ${color}66`,
        borderRadius: 10, padding: 12, textAlign: "left",
        cursor: onClick ? "pointer" : "default",
        display: "flex", flexDirection: "column", gap: 2,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 16 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", lineHeight: 1.2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b" }}>{sub}</div>}
    </button>
  );
}
function PrioCard({
  icon, title, subtitle, done, total, pct, color,
}: {
  icon: string; title: string; subtitle: string;
  done: number; total: number; pct: number; color: string;
}) {
  return (
    <div style={{
      background: "white", border: `1px solid ${color}55`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 12, padding: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color }}>{icon} {title}</div>
      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6 }}>{subtitle}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{done}<span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}> / {total}</span></div>
      <div style={{ marginTop: 6 }}>
        <ProgressBar pct={pct} color={color} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginTop: 4 }}>{pct}%</div>
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, transition: "width 0.6s" }} />
    </div>
  );
}

function NvtStatusBar({ rows }: { rows: NvtRow[] }) {
  const data = useMemo(
    () => rows.map((r) => ({
      nvt: r.nvt,
      Erledigt: r.erledigt,
      Termin: r.termin,
      Offen: r.offen,
      Abgelehnt: r.abgelehnt,
      pct: Math.round(r.pct),
    })),
    [rows],
  );
  return (
    <div style={CARD}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 8 }}>
        Status pro NVT
      </div>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 40, left: 0, bottom: 5 }}>
          <XAxis type="number" fontSize={11} />
          <YAxis type="category" dataKey="nvt" fontSize={11} width={70} />
          <Tooltip />
          <Legend />
          <Bar dataKey="Erledigt" stackId="a" fill="#22c55e" />
          <Bar dataKey="Termin" stackId="a" fill="#3b82f6" />
          <Bar dataKey="Offen" stackId="a" fill="#9ca3af" />
          <Bar dataKey="Abgelehnt" stackId="a" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type CarouselSlide = {
  title: string;
  color: string;
  done: number;
  total: number;
  pct: number;
  footer: string;
  extra?: React.ReactNode;
};

function ProgressCarousel({ slides }: { slides: CarouselSlide[] }) {
  const [idx, setIdx] = useState(0);
  const [drag, setDrag] = useState(0);
  const startX = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);

  useEffect(() => {
    const update = () => { widthRef.current = wrapRef.current?.offsetWidth ?? 0; };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; setDrag(0); };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    setDrag(e.touches[0].clientX - startX.current);
  };
  const onTouchEnd = () => {
    if (startX.current === null) return;
    if (drag < -50 && idx < slides.length - 1) setIdx(idx + 1);
    else if (drag > 50 && idx > 0) setIdx(idx - 1);
    setDrag(0);
    startX.current = null;
  };

  const w = widthRef.current || 1;
  const offset = -idx * w + drag;

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        ref={wrapRef}
        style={{ position: "relative", overflow: "hidden", borderRadius: 12, height: 220, background: "white", border: "1px solid #e5e7eb" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div style={{
          display: "flex", height: "100%",
          transform: `translateX(${offset}px)`,
          transition: startX.current === null ? "transform 0.3s ease" : "none",
        }}>
          {slides.map((s, i) => (
            <div key={i} style={{ flex: "0 0 100%", height: "100%" }}>
              <CarouselSlideView slide={s} active={i === idx} />
            </div>
          ))}
        </div>

        {idx > 0 && (
          <button onClick={() => setIdx(idx - 1)}
            style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)",
              border: "none", background: "rgba(255,255,255,0.8)", borderRadius: "50%",
              width: 28, height: 28, fontSize: 18, cursor: "pointer", color: "#475569" }}>‹</button>
        )}
        {idx < slides.length - 1 && (
          <button onClick={() => setIdx(idx + 1)}
            style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
              border: "none", background: "rgba(255,255,255,0.8)", borderRadius: "50%",
              width: 28, height: 28, fontSize: 18, cursor: "pointer", color: "#475569" }}>›</button>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
        {slides.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            aria-label={`Slide ${i + 1}`}
            style={{
              width: 8, height: 8, borderRadius: "50%", border: "none", padding: 0,
              background: i === idx ? "#e20074" : "#d1d5db", cursor: "pointer",
            }} />
        ))}
      </div>
    </div>
  );
}

function CarouselSlideView({ slide, active }: { slide: CarouselSlide; active: boolean }) {
  const [animPct, setAnimPct] = useState(0);
  useEffect(() => {
    if (!active) { setAnimPct(0); return; }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimPct(slide.pct * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, slide.pct]);

  const display = Math.round(animPct);
  const ringValue = animPct;

  return (
    <div style={{ width: "100%", height: "100%", padding: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: 140, height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[
                { name: "v", value: ringValue },
                { name: "r", value: Math.max(0, 100 - ringValue) },
              ]}
              dataKey="value"
              cx="50%" cy="50%"
              innerRadius={48} outerRadius={66}
              stroke="none"
              startAngle={90} endAngle={-270}
              isAnimationActive={false}
            >
              <Cell fill={slide.color} />
              <Cell fill="#e5e7eb" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", pointerEvents: "none",
        }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#111", lineHeight: 1 }}>{display}%</div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>{slide.title}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginTop: 4, textAlign: "center" }}>
        {slide.footer}
      </div>
      {slide.extra}
    </div>
  );
}
