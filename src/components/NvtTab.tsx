import { useEffect, useMemo, useRef, useState } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { Contact, CallState, DokuState } from "@/lib/types";
import {
  isPriorityNvt, isUrgentNvt,
  getNvtPriority, priorityStars,
  type PriorityLevel,
} from "@/lib/priority";
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
  return toIsoDate(new Date());
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

function isSameLocalDay(iso: string | null | undefined, ref: string): boolean {
  if (!iso) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso === ref;
  return toIsoDate(new Date(iso)) === ref;
}

// ─── Ampel-Logik ─────────────────────────────────────────────────
type AmpelStatus = "gruen" | "gelb" | "rot";

function getAmpel(count: number, needed: number): AmpelStatus {
  if (count >= needed) return "gruen";
  if (count >= Math.ceil(needed / 2)) return "gelb";
  return "rot";
}

const AMPEL_COLOR: Record<AmpelStatus, string> = {
  gruen: "#16a34a",
  gelb: "#d97706",
  rot: "#dc2626",
};
const AMPEL_BG: Record<AmpelStatus, string> = {
  gruen: "#dcfce7",
  gelb: "#fef3c7",
  rot: "#fee2e2",
};
const AMPEL_DOT: Record<AmpelStatus, string> = {
  gruen: "🟢",
  gelb: "🟡",
  rot: "🔴",
};
// ─────────────────────────────────────────────────────────────────

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
  onOpenTeamDokuOffen,
  onOpenDoku,
  onOpenNeuTelekom20,
  onTeamAction,
  onPickKalenderDate,
  onOpenPlan,
}: {
  contacts: Contact[];
  states: Record<string, CallState>;
  onOpenKlarfaelle?: () => void;
  onOpenAuskundungHeute?: () => void;
  onOpenTeamDokuOffen?: () => void;
  onOpenDoku?: () => void;
  onOpenNeuTelekom20?: () => void;
  onTeamAction?: (team: "team1" | "team2", action: "auftraege" | "karte" | "doku") => void;
  onPickKalenderDate?: (dateISO: string) => void;
  onOpenPlan?: () => void;
}) {

  const [dokuStates, setDokuStates] = useState<Record<string, DokuState>>({});
  const [bedarfProTag, setBedarfProTag] = useState<number>(4);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: zList } = await supabase.from("umsatz_ziele").select("*");
      if (cancel) return;
      const zHaTag = (zList as { scope: string; ziel_eur: number }[] | null)?.find((z) => z.scope === "ha_pro_tag");
      if (zHaTag) setBedarfProTag(Number(zHaTag.ziel_eur));
    })();

    const zCh = supabase
      .channel("umsatz_ziele_dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "umsatz_ziele" }, (payload) => {
        const row = payload.new as { scope?: string; ziel_eur?: number } | null;
        if (row?.scope === "ha_pro_tag") setBedarfProTag(Number(row.ziel_eur));
      })
      .subscribe();

    return () => { cancel = true; supabase.removeChannel(zCh); };
  }, []);

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
  const morgenStr = addDays(today, 1);
  const uebermorganStr = addDays(today, 2);

  const klarfallCount = useMemo(
    () => contacts.reduce((n, c) => n + (states[c.bid]?.klarfall ? 1 : 0), 0),
    [contacts, states],
  );

  // Zahlungspipeline — Stufen aus Rohdaten (Excel-Datumsfelder + pruefung_status) ableiten
  const pipeline = useMemo(() => {
    let erledigt = 0, eingereicht = 0, nachforderung = 0, freigegeben = 0, verguetet = 0;
    let auskundung = 0, foto = 0, protokoll = 0, zustimmung = 0;
    for (const c of contacts) {
      const cs = states[c.bid];
      if (!cs || cs.status !== "erledigt") continue;
      erledigt++;
      const ps = cs.pruefung_status ?? "offen";
      // Stufen exklusiv, vom weitesten Fortschritt nach früher
      if (cs.verguetet_am) verguetet++;
      else if (cs.avis_am) freigegeben++;
      else if (ps === "nachforderung") nachforderung++;
      else if (cs.aufmass_am || ps === "freigegeben") freigegeben++;
      else if (cs.eingereicht_am || ps === "eingereicht") eingereicht++;

      const d = dokuStates[c.bid];
      if (c.auskundung_erforderlich && !c.auskundung_erfolgt) auskundung++;
      if (!d?.foto) foto++;
      if (!d?.protokoll) protokoll++;
      const z = (c.zustimmung || "").trim().toLowerCase();
      if (!z || z === "nein" || z === "offen") zustimmung++;
    }
    return { erledigt, eingereicht, nachforderung, freigegeben, verguetet, auskundung, foto, protokoll, zustimmung };
  }, [contacts, states, dokuStates]);


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

  // ─── Einsatzplanung ──────────────────────────────────────────────
  const einsatzPlanung = useMemo(() => {
    let heute = 0, morgen = 0, uebermorgen = 0;
    for (const c of contacts) {
      const s = states[c.bid];
      if (!s?.termin_datum) continue;
      // Termine zählen unabhängig vom Status (auch bereits erledigte Termine)
      if (s.status !== "termin" && s.status !== "erledigt") continue;
      if (s.termin_datum === today) heute++;
      else if (s.termin_datum === morgenStr) morgen++;
      else if (s.termin_datum === uebermorganStr) uebermorgen++;
    }
    return { heute, morgen, uebermorgen };
  }, [contacts, states, today, morgenStr, uebermorganStr]);


  const terminierbar = useMemo(() => {
    return contacts.filter((c) => {
      const st = states[c.bid]?.status ?? "offen";
      return st === "offen" || st === "angerufen" || st === "nichtErreicht";
    }).length;
  }, [contacts, states]);

  const ampelHeute = getAmpel(einsatzPlanung.heute, bedarfProTag);
  const ampelMorgen = getAmpel(einsatzPlanung.morgen, bedarfProTag);
  const ampelUebermorgen = getAmpel(einsatzPlanung.uebermorgen, bedarfProTag);
  const kritischWarnungAktiv = ampelMorgen === "rot" || ampelUebermorgen === "rot";

  // ────────────────────────────────────────────────────────────────

  // Tages-KPIs
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
      if (s.status !== "erledigt") continue;
      // Entweder Erledigt-Datum heute, oder Termin war heute, oder zuletzt heute geändert
      if (s.erledigt_datum === today || s.termin_datum === today || isSameLocalDay(s.updated_at, today)) n++;
    }
    return n;
  }, [states, today]);


  // Doku-Fortschritt
  const dokuComplete = useMemo(() => {
    let n = 0;
    for (const c of contacts) {
      const d = dokuStates[c.bid];
      if (d && d.foto && d.protokoll && d.sharepoint) n++;
    }
    return n;
  }, [contacts, dokuStates]);
  const dokuPct = totalGesamt ? Math.round((dokuComplete / totalGesamt) * 100) : 0;

  // Priorität-Auswertung
  const urgentRows = rows.filter((r) => isUrgentNvt(r.nvt));
  const prioRows = rows.filter((r) => isPriorityNvt(r.nvt) && !isUrgentNvt(r.nvt));
  const sumOf = (list: NvtRow[]) => {
    const g = list.reduce((s, r) => s + r.gesamt, 0);
    const e = list.reduce((s, r) => s + r.erledigt, 0);
    return { g, e, pct: g ? Math.round((e / g) * 100) : 0 };
  };
  const u = sumOf(urgentRows);
  const p = sumOf(prioRows);

  // Team heute
  const teamHeute = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of Object.values(dokuStates)) {
      if (!d.durchfuehrt_von) continue;
      if (!isSameLocalDay(d.durchfuehrt_am, today)) continue;
      const names = d.durchfuehrt_von.split(/[,;/]+/).map((x) => x.trim()).filter(Boolean);
      for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [dokuStates, today]);

  // Warnungen
  const auskundungHeute = useMemo(
    () => contacts.filter((c) => isSameLocalDay(c.auskundung_von, today)),
    [contacts, today],
  );
  const lowPrioNvts = [...urgentRows, ...prioRows].filter((r) => r.pct < 50);

  const grabenTotal = useMemo(
    () => Object.values(states).reduce((s, x) => s + (x.grabenlaenge ?? 0), 0),
    [states],
  );

  // Prio-3-Schnellansicht
  const p3contacts = useMemo(() => contacts.filter((c) => {
    const prio = states[c.bid]?.priority_override ?? getNvtPriority(c.nvt);
    return prio === 3;
  }), [contacts, states]);

  const p3stats = useMemo(() => {
    let offen = 0, termin = 0, gebaut = 0;
    for (const c of p3contacts) {
      const st = states[c.bid]?.status ?? "offen";
      if (st === "erledigt") gebaut++;
      else if (st === "termin") termin++;
      else offen++;
    }
    return { offen, termin, gebaut };
  }, [p3contacts, states]);

  // Animierte Zähler (nur noch Gesamt-%)
  const animPct = useCounter(totalPct);
  const animGraben = useCounter(grabenTotal);
  void animPct; void animGraben;


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

  return (
    <div style={{ padding: 12, paddingBottom: 100, background: "#f2f2f7", minHeight: "100%" }}>

      {/* ══════════════ 1) EINSATZPLANUNG ══════════════ */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...SECTION_TITLE, marginBottom: 6 }}>🎯 Einsatzplanung</div>

        {kritischWarnungAktiv && (
          <div style={{
            background: "#fee2e2", border: "2px solid #dc2626", borderRadius: 12,
            padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 22 }}>🚨</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#7f1d1d" }}>
                Terminierung erforderlich!
              </div>
              <div style={{ fontSize: 12, color: "#991b1b", marginTop: 2 }}>
                {ampelMorgen === "rot" ? "Morgen zu wenig Aufträge. " : ""}
                {ampelUebermorgen === "rot" ? "Übermorgen zu wenig Aufträge." : ""}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          {[
            { label: "Heute", count: einsatzPlanung.heute, ampel: ampelHeute, date: today },
            { label: "Morgen", count: einsatzPlanung.morgen, ampel: ampelMorgen, date: morgenStr },
            { label: "Übermorgen", count: einsatzPlanung.uebermorgen, ampel: ampelUebermorgen, date: uebermorganStr },
          ].map(({ label, count, ampel, date }) => {
            const clickable = !!onPickKalenderDate;
            return (
              <button
                key={label}
                type="button"
                onClick={clickable ? () => onPickKalenderDate!(date) : undefined}
                disabled={!clickable}
                title={clickable ? `Im Kalender öffnen (${date})` : undefined}
                style={{
                  background: AMPEL_BG[ampel],
                  border: `2px solid ${AMPEL_COLOR[ampel]}`,
                  borderRadius: 12, padding: "10px 8px", textAlign: "center",
                  cursor: clickable ? "pointer" : "default",
                  font: "inherit", color: "inherit",
                }}
              >
                <div style={{ fontSize: 18 }}>{AMPEL_DOT[ampel]}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: AMPEL_COLOR[ampel], lineHeight: 1.1 }}>
                  {count}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginTop: 2 }}>
                  {label} {clickable && <span style={{ color: "#94a3b8" }}>›</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{
          background: "white", border: "1px solid #e5e7eb", borderRadius: 12,
          padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>
            <b>{terminierbar}</b> terminierbar
            <span style={{ color: "#94a3b8", fontWeight: 500, marginLeft: 6 }}>(offen/angerufen/n. erreicht)</span>
          </div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
            Bedarf {bedarfProTag}/Tag
          </div>
        </div>
      </div>

      {/* ══════════════ 1b) ZAHLUNGSPIPELINE ══════════════ */}
      {pipeline.erledigt > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={SECTION_TITLE}>💰 Zahlungspipeline</div>
          <div
            onClick={() => onOpenDoku?.()}
            style={{
              background: "white", border: "1px solid #e5e7eb", borderRadius: 12,
              padding: "10px 12px", cursor: onOpenDoku ? "pointer" : "default",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, alignItems: "stretch" }}>
              {[
                { label: "Erledigt", value: pipeline.erledigt, color: "#0f172a" },
                { label: "Eingereicht", value: pipeline.eingereicht, color: "#3b82f6" },
                { label: "Nachforderung", value: pipeline.nachforderung, color: "#f59e0b", highlight: pipeline.nachforderung > 0 },
                { label: "Freigegeben", value: pipeline.freigegeben, color: "#22c55e" },
                { label: "Vergütet", value: pipeline.verguetet, color: "#059669" },
              ].map((s, i) => (
                <div key={s.label} style={{
                  textAlign: "center",
                  padding: "6px 2px",
                  borderRadius: 8,
                  background: s.highlight ? "#fef3c7" : "transparent",
                  border: s.highlight ? "1px solid #f59e0b" : "1px solid transparent",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: "#64748b", fontWeight: 700, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                  {i < 4 && <div style={{ display: "none" }}>→</div>}
                </div>
              ))}
            </div>
            {(pipeline.auskundung + pipeline.foto + pipeline.protokoll + pipeline.zustimmung) > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, fontWeight: 700, color: "#475569" }}>
                {pipeline.auskundung > 0 && <span style={{ color: "#dc2626" }}>🚫 Ohne Auskundung: {pipeline.auskundung}</span>}
                {pipeline.foto > 0 && <span>📸 Foto: {pipeline.foto}</span>}
                {pipeline.protokoll > 0 && <span>📄 Protokoll: {pipeline.protokoll}</span>}
                {pipeline.zustimmung > 0 && <span>✍️ Zustimmung: {pipeline.zustimmung}</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ 2) AKTIONEN / WARNUNGEN ══════════════ */}
      {(klarfallCount > 0 || auskundungHeute.length > 0 || lowPrioNvts.length > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={SECTION_TITLE}>⚠️ Aktionen</div>
          {klarfallCount > 0 && (
            <button
              type="button"
              onClick={() => onOpenKlarfaelle?.()}
              style={{
                width: "100%", textAlign: "left", cursor: "pointer",
                background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: 12,
                padding: "10px 14px", marginBottom: 8, color: "#7c2d12",
                fontSize: 14, fontWeight: 800,
              }}
            >
              ⚠️ {klarfallCount} Klärfall{klarfallCount === 1 ? "" : "e"} →
            </button>
          )}
          {auskundungHeute.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenAuskundungHeute?.()}
              style={{
                width: "100%", textAlign: "left", cursor: "pointer",
                background: "#dbeafe", border: "2px solid #3b82f6", borderRadius: 12,
                padding: "10px 14px", marginBottom: 8, color: "#1e3a8a",
                fontSize: 14, fontWeight: 800,
              }}
            >
              📅 {auskundungHeute.length} Auskundung{auskundungHeute.length === 1 ? "" : "en"} heute
              <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: "#1e40af" }}>
                {auskundungHeute.slice(0, 3).map((c) => `${c.strasse} ${c.hnr}`).join(" · ")}
                {auskundungHeute.length > 3 ? " …" : ""}
              </div>
            </button>
          )}
          {lowPrioNvts.length > 0 && (
            <div style={{
              background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 12,
              padding: "10px 14px", color: "#7f1d1d",
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
                🔴 Prio-NVTs unter 50%
              </div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>
                {lowPrioNvts.map((r) => `${r.nvt} (${Math.round(r.pct)}%)`).join(" · ")}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ 3) HEUTE — Teams + Aktivität ══════════════ */}
      <TeamsLive
        contacts={contacts}
        states={states}
        today={today}
        onOpenTeamDokuOffen={onOpenTeamDokuOffen}
        onTeamAction={onTeamAction}
        onOpenPlan={onOpenPlan}
      />

      <div style={{ ...CARD, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>Heute</div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
            🗓 {termineHeute.total} Termine · ✅ {erledigtHeute} erledigt
          </div>
        </div>
        {teamHeute.length === 0 ? (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Noch keine Doku-Aktivität heute.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {teamHeute.map(([name, n], i) => (
              <div key={name} style={{
                background: teamColors[i % teamColors.length] + "1a",
                border: `1px solid ${teamColors[i % teamColors.length]}55`,
                color: teamColors[i % teamColors.length],
                borderRadius: 999, padding: "4px 10px",
                fontSize: 12, fontWeight: 700,
              }}>
                {name}: {n}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════ 4) FORTSCHRITT — kompakte Zeile ══════════════ */}
      <div style={SECTION_TITLE}>📊 Fortschritt</div>
      <div style={{ ...CARD, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          {[
            { label: "Gesamt", pct: totalPct, done: totalErledigt, total: totalGesamt, color: "#22c55e" },
            { label: "Top Prio", pct: u.pct, done: u.e, total: u.g, color: "#dc2626" },
            { label: "Doku", pct: dokuPct, done: dokuComplete, total: totalGesamt, color: "#6366f1" },
          ].map(({ label, pct, done, total, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color }}>{pct}%</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#334155" }}>{label}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{done}/{total}</div>
            </div>
          ))}
        </div>
        <ProgressBar pct={totalPct} color="#22c55e" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 11, color: "#64748b", fontWeight: 600 }}>
          <span>⛏️ {grabenTotal >= 1000 ? `${(grabenTotal / 1000).toFixed(1)} km` : `${grabenTotal} m`} Graben</span>
          <button onClick={shareWhatsApp}
            style={{
              background: "#25D366", color: "white", border: "none", borderRadius: 8,
              padding: "5px 10px", fontWeight: 700, fontSize: 11, cursor: "pointer",
            }}>
            💬 Teilen
          </button>
        </div>
      </div>

      {/* ══════════════ 5) NVT-FORTSCHRITT ══════════════ */}
      <div style={SECTION_TITLE}>📡 NVT Fortschritt</div>

      {(() => {
        const rest = rows.filter((r) => !isPriorityNvt(r.nvt));
        const renderCard = (r: NvtRow, kind: "urgent" | "prio" | "normal") => {
          const pct = Math.round(r.pct);
          const accent = kind === "urgent" ? "#dc2626" : kind === "prio" ? "#f97316" : null;
          const emoji = kind === "urgent" ? "🔴 " : kind === "prio" ? "🔥 " : "";
          const nvtPrio = getNvtPriority(r.nvt) as PriorityLevel;
          const stars = priorityStars(nvtPrio);
          return (
            <div key={r.nvt} style={{
              background: cardBg(r.pct),
              border: `1px solid ${r.pct >= 100 ? "#10b981" : "#e5e7eb"}`,
              borderLeft: accent ? `4px solid ${accent}` : undefined,
              borderRadius: 12, padding: 10, marginBottom: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#111", display: "flex", alignItems: "center", gap: 6 }}>
                    {emoji}{r.nvt}
                    {stars && <span style={{ fontSize: 11, color: "#d97706" }}>{stars}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#666" }}>{r.ort || "—"} · {r.gesamt} Objekte</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: r.pct >= 100 ? "#059669" : r.pct > 50 ? "#16a34a" : "#111" }}>
                  {pct}%
                </div>
              </div>
              <ProgressBar pct={pct} color={r.pct >= 100 ? "#059669" : "#22c55e"} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11, fontWeight: 600, marginTop: 6 }}>
                <span style={{ color: "#16a34a" }}>✅ {r.erledigt}</span>
                <span style={{ color: "#3b82f6" }}>📅 {r.termin}</span>
                <span style={{ color: "#6b7280" }}>⚪ {r.offen}</span>
                {r.abgelehnt > 0 && <span style={{ color: "#ef4444" }}>🔴 {r.abgelehnt}</span>}
              </div>
            </div>
          );
        };
        return (
          <>
            {urgentRows.map((r) => renderCard(r, "urgent"))}
            {prioRows.map((r) => renderCard(r, "prio"))}
            {rest.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{
                  background: "#f1f5f9", color: "#334155", fontWeight: 700, fontSize: 12,
                  padding: "10px 12px", borderRadius: 10, marginBottom: 8, cursor: "pointer",
                  listStyle: "none",
                }}>
                  ▾ Weitere NVTs ({rest.length})
                </summary>
                {rest.map((r) => renderCard(r, "normal"))}
              </details>
            )}
          </>
        );
      })()}
    </div>
  );
}


// ─── Sub-Komponenten ──────────────────────────────────────────────

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

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, transition: "width 0.6s" }} />
    </div>
  );
}

function NvtStatusBar({ rows }: { rows: NvtRow[] }) {
  const [view, setView] = useState<"bar" | "donut" | "tiles">("bar");

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

  const donutData = useMemo(() => {
    const totals = { Erledigt: 0, Termin: 0, Offen: 0, Abgelehnt: 0 };
    for (const r of rows) {
      totals.Erledigt += r.erledigt;
      totals.Termin += r.termin;
      totals.Offen += r.offen;
      totals.Abgelehnt += r.abgelehnt;
    }
    return [
      { name: "Erledigt", value: totals.Erledigt, color: "#22c55e" },
      { name: "Termin", value: totals.Termin, color: "#3b82f6" },
      { name: "Offen", value: totals.Offen, color: "#9ca3af" },
      { name: "Abgelehnt", value: totals.Abgelehnt, color: "#ef4444" },
    ].filter((d) => d.value > 0);
  }, [rows]);

  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Status pro NVT</div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["bar", "donut", "tiles"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "4px 8px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 14, fontWeight: 700,
                background: view === v ? "#e20074" : "#f1f5f9",
                color: view === v ? "white" : "#64748b",
              }}
            >
              {v === "bar" ? "📊" : v === "donut" ? "🍩" : "🔲"}
            </button>
          ))}
        </div>
      </div>

      {view === "bar" && (
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
      )}

      {view === "donut" && (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={donutData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
            >
              {donutData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      )}

      {view === "tiles" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {rows.map((r) => {
            const pct = Math.round(r.pct);
            const prio = getNvtPriority(r.nvt) as PriorityLevel;
            const accent = prio === 3 ? "#dc2626" : prio === 2 ? "#f97316" : "#e5e7eb";
            const stars = priorityStars(prio);
            return (
              <div
                key={r.nvt}
                style={{
                  background: pct >= 100 ? "#dcfce7" : "white",
                  border: `2px solid ${pct >= 100 ? "#10b981" : accent}`,
                  borderRadius: 10, padding: "10px 10px",
                  transition: "all 0.3s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>{r.nvt}</div>
                  {stars && <span style={{ fontSize: 10, color: "#d97706" }}>{stars}</span>}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{r.ort} · {r.gesamt}</div>
                <ProgressBar pct={pct} color={pct >= 100 ? "#10b981" : "#22c55e"} />
                <div style={{ fontSize: 12, fontWeight: 800, color: pct >= 100 ? "#059669" : "#111", marginTop: 4 }}>
                  {pct}%
                </div>
                <div style={{ display: "flex", gap: 6, fontSize: 10, fontWeight: 600, marginTop: 4 }}>
                  <span style={{ color: "#16a34a" }}>✅{r.erledigt}</span>
                  <span style={{ color: "#3b82f6" }}>📅{r.termin}</span>
                  <span style={{ color: "#6b7280" }}>○{r.offen}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

function TeamsLive({
  contacts,
  states,
  today,
  onOpenTeamDokuOffen,
  onTeamAction,
  onOpenPlan,
}: {
  contacts: Contact[];
  states: Record<string, CallState>;
  today: string;
  onOpenTeamDokuOffen?: () => void;
  onTeamAction?: (team: "team1" | "team2", action: "auftraege" | "karte" | "doku") => void;
  onOpenPlan?: () => void;
}) {
  const teams = useMemo(() => {
    const init = () => ({ inArbeit: [] as Contact[], fertig: [] as Contact[], heute: 0 });
    const t1 = init();
    const t2 = init();
    for (const c of contacts) {
      const s = states[c.bid];
      if (!s?.team) continue;
      const bucket = s.team === "team1" ? t1 : s.team === "team2" ? t2 : null;
      if (!bucket) continue;
      if (s.team_status === "in_arbeit") bucket.inArbeit.push(c);
      if (s.team_status === "fertig") {
        bucket.fertig.push(c);
        if (isSameLocalDay(s.updated_at, today)) bucket.heute++;
      }
    }
    return { team1: t1, team2: t2 };
  }, [contacts, states, today]);

  const totals = useMemo(() => {
    let fertigHeute = 0, fotosOffen = 0, protOffen = 0;
    for (const s of Object.values(states)) {
      if (s.team_status !== "fertig") continue;
      if (isSameLocalDay(s.updated_at, today)) fertigHeute++;
      if (!s.fotos_erhalten) fotosOffen++;
      if (!s.protokoll_erhalten) protOffen++;
    }
    return { fertigHeute, fotosOffen, protOffen };
  }, [states, today]);

  const summaryAlert = totals.fotosOffen > 0 || totals.protOffen > 0;

  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const startLongPress = () => {
    if (!onOpenPlan) return;
    longPressFired.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try { navigator.vibrate(50); } catch {}
      }
      onOpenPlan();
    }, 600);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <>
      <style>{`@keyframes kal-pulse { 0%,100% { box-shadow: 0 0 0 1px #fdba74, 0 0 0 0 rgba(249,115,22,0.5);} 50% { box-shadow: 0 0 0 1px #fdba74, 0 0 0 8px rgba(249,115,22,0);} }`}</style>
      <div style={SECTION_TITLE}>👷 Teams Live</div>
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onMouseDown={startLongPress}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
      >
        <TeamCard name="Team Jozey" color="#3b82f6" data={teams.team1} onAction={onTeamAction ? (a) => onTeamAction("team1", a) : undefined} longPressFiredRef={longPressFired} />
        <TeamCard name="Team Adil" color="#7c3aed" data={teams.team2} onAction={onTeamAction ? (a) => onTeamAction("team2", a) : undefined} longPressFiredRef={longPressFired} />
      </div>
      <button
        type="button"
        onClick={summaryAlert ? onOpenTeamDokuOffen : undefined}
        style={{
          width: "100%", textAlign: "left", marginBottom: 12,
          padding: "10px 12px", borderRadius: 10,
          border: `1px solid ${summaryAlert ? "#f59e0b" : "#e5e7eb"}`,
          background: summaryAlert ? "#fffbeb" : "white",
          color: summaryAlert ? "#92400e" : "#475569",
          fontSize: 12, fontWeight: 700, cursor: summaryAlert ? "pointer" : "default",
          lineHeight: 1.5,
        }}
      >
        {summaryAlert ? "⚠️ " : ""}Gesamt heute: {totals.fertigHeute} Aufträge fertig · {totals.fotosOffen} Fotos ausstehend · {totals.protOffen} Protokolle ausstehend
      </button>
    </>
  );
}

function TeamCard({
  name,
  color,
  data,
  onAction,
  longPressFiredRef,
}: {
  name: string;
  color: string;
  data: { inArbeit: Contact[]; fertig: Contact[]; heute: number };
  onAction?: (action: "auftraege" | "karte" | "doku") => void;
  longPressFiredRef?: React.RefObject<boolean>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const n = data.inArbeit.length;
  const inArbeit = n > 0;
  const ampel = n === 0 ? { icon: "🟢", label: "Frei" } : n <= 2 ? { icon: "🟡", label: "Aktiv" } : { icon: "🔴", label: "Voll" };

  const handleClick = () => {
    if (!onAction) return;
    if (longPressFiredRef?.current) return;
    setMenuOpen((v) => !v);
  };

  return (
    <div
      role={onAction ? "button" : undefined}
      tabIndex={onAction ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (!onAction) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMenuOpen((v) => !v); }
        if (e.key === "Escape") setMenuOpen(false);
      }}
      style={{
        background: inArbeit ? "#fff7ed" : "white",
        borderRadius: 12,
        padding: 12,
        border: inArbeit ? "2px solid #f97316" : `2px solid ${color}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        boxShadow: inArbeit ? "0 0 0 1px #fdba74" : undefined,
        animation: inArbeit ? "kal-pulse 1.8s ease-in-out infinite" : undefined,
        position: "relative",
        cursor: onAction ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {inArbeit && (
        <span
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            fontSize: 11,
            fontWeight: 800,
            color: "#9a3412",
            background: "#fed7aa",
            padding: "2px 6px",
            borderRadius: 4,
            lineHeight: 1.3,
            zIndex: 2,
          }}
          aria-label="in Arbeit"
        >
          🔨 BAU
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
        <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{name}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
        {ampel.icon} {ampel.label} · {n} in Arbeit
      </div>
      {data.inArbeit.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "2px 0 0", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
          {data.inArbeit.slice(0, 3).map((c) => (
            <li key={c.bid}>• {c.strasse} {c.hnr}{c.hnr_zusatz}</li>
          ))}
          {data.inArbeit.length > 3 && <li style={{ color: "#94a3b8" }}>+{data.inArbeit.length - 3} weitere</li>}
        </ul>
      )}
      <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginTop: 4 }}>
        Heute {data.heute} erledigt
      </div>

      {menuOpen && onAction && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 40, background: "transparent" }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 8,
              right: 8,
              zIndex: 50,
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              overflow: "hidden",
            }}
          >
            {([
              { k: "auftraege", icon: "📋", label: "Aufträge anzeigen" },
              { k: "karte", icon: "🗺️", label: "Auf Karte anzeigen" },
              { k: "doku", icon: "📑", label: "Doku offen prüfen" },
            ] as const).map((it) => (
              <button
                key={it.k}
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAction(it.k); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "10px 12px", background: "white", border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  fontSize: 13, fontWeight: 600, color: "#0f172a", cursor: "pointer",
                }}
              >
                {it.icon} {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
