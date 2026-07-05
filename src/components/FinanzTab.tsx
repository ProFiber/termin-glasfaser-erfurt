import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getNvtPriority } from "@/lib/priority";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";

type FinRow = {
  bid: string;
  status: string;
  umsatz_eur: number | string;
  zusatz_eur: number | string;
  grabenlaenge: number;
  erledigt_datum: string | null;
  aufmass_am: string | null;
  gutschrift_nr: string;
  avis_am: string | null;
  verguetet_am: string | null;
  team: string;
};

type Ziel = {
  scope: string;
  ziel_eur: number;
  arbeitstage_pro_monat: number;
  saturday_buffer: boolean;
};

const EUR = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const EUR2 = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

// Arbeitstage Mo–Fr in einem Monat (Samstag = Puffer, also nicht im Soll)
function workdaysInMonth(year: number, month: number, saturdayBuffer: boolean) {
  let count = 0;
  const last = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const dow = new Date(year, month, day).getDay();
    if (dow === 0) continue; // Sonntag
    if (dow === 6 && saturdayBuffer) continue; // Samstag = Puffer
    count++;
  }
  return count;
}

function workdaysPassedInMonth(now: Date, saturdayBuffer: boolean) {
  let count = 0;
  for (let day = 1; day <= now.getDate(); day++) {
    const dow = new Date(now.getFullYear(), now.getMonth(), day).getDay();
    if (dow === 0) continue;
    if (dow === 6 && saturdayBuffer) continue;
    count++;
  }
  return count;
}

function saturdaysRemainingInMonth(now: Date) {
  let count = 0;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  for (let day = now.getDate() + 1; day <= last; day++) {
    if (new Date(now.getFullYear(), now.getMonth(), day).getDay() === 6) count++;
  }
  return count;
}

function saturdayDatesRemaining(now: Date): Date[] {
  const list: Date[] = [];
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  for (let day = now.getDate() + 1; day <= last; day++) {
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    if (d.getDay() === 6) list.push(d);
  }
  return list;
}

export default function FinanzTab() {
  const [rows, setRows] = useState<FinRow[]>([]);
  const [ziel, setZiel] = useState<Ziel | null>(null);
  const [haPreis, setHaPreis] = useState<number>(1200);
  const [haProTag, setHaProTag] = useState<number>(4);
  const [loading, setLoading] = useState(true);
  const [editingZiel, setEditingZiel] = useState(false);
  const [zielInput, setZielInput] = useState("70000");
  const [haPreisInput, setHaPreisInput] = useState("1200");
  const [haProTagInput, setHaProTagInput] = useState("4");
  const [haAnzahlInput, setHaAnzahlInput] = useState("58");


  const [showPrevHeute, setShowPrevHeute] = useState(false);
  const [showPrevWoche, setShowPrevWoche] = useState(false);
  const [showPrevMonat, setShowPrevMonat] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  async function exportPDF() {
    setExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 14;
      let y = margin;
      const today = new Date();
      const datumStr = today.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
      const uhrzeit = today.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      const ensureSpace = (need: number) => { if (y + need > pageH - margin) { pdf.addPage(); y = margin; } };

      // Titel
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); pdf.setTextColor(20);
      pdf.text("Finanzübersicht", margin, y); y += 7;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(90);
      pdf.text(`Stand: ${datumStr}, ${uhrzeit} Uhr`, margin, y); y += 8;
      pdf.setDrawColor(15, 23, 42); pdf.setLineWidth(0.8);
      pdf.line(margin, y, pageW - margin, y); y += 8;

      // KPI-Kacheln (Heute / Woche / Monat)
      const tileW = (pageW - margin * 2 - 8) / 3;
      const tileH = 30;
      const drawTile = (x: number, title: string, big: string, sub: string, tempo: string, color: [number, number, number]) => {
        pdf.setFillColor(248, 250, 252); pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.3);
        pdf.roundedRect(x, y, tileW, tileH, 2, 2, "FD");
        pdf.setFillColor(...color); pdf.rect(x, y, 2.5, tileH, "F");
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(110);
        pdf.text(title, x + 5, y + 5);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.setTextColor(15, 23, 42);
        pdf.text(big, x + 5, y + 13);
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(110);
        pdf.text(sub, x + 5, y + 19);
        if (tempo) {
          pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(70);
          pdf.text(tempo, x + 5, y + 26);
        }
      };
      drawTile(margin, "Heute", `${data.countHeute} HA`, `${data.meterHeute} m · ${Math.round(data.umsatzHeute).toLocaleString("de-DE")} €`, "", [34, 197, 94]);
      drawTile(margin + tileW + 4, "Diese Woche", `${data.countWoche} HA`, `${data.meterWoche} m · ${Math.round(data.umsatzWoche).toLocaleString("de-DE")} €`, data.tatsaechlicheWocheTage > 0 ? `Ø ${data.haProArbeitstagWoche.toFixed(1)} HA/Tag  (${data.tatsaechlicheWocheTage} Tage gearbeitet)` : "", [59, 130, 246]);
      drawTile(margin + (tileW + 4) * 2, "Dieser Monat", `${data.countMonat} HA`, `${data.meterMonat} m · ${Math.round(data.umsatzMonat).toLocaleString("de-DE")} €`, data.tatsaechlicheMonatTage > 0 ? `Ø ${data.haProArbeitstagMonat.toFixed(1)} HA/Tag  (${data.tatsaechlicheMonatTage} Tage gearbeitet)` : "", [226, 0, 116]);
      y += tileH + 8;

      // Ziel-Block
      ensureSpace(40);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(20);
      pdf.text("Monatsziel", margin, y); y += 6;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(50);
      pdf.text(`Ziel: ${Math.round(data.zielMonat).toLocaleString("de-DE")} €  ·  Ist: ${Math.round(data.umsatzMonat).toLocaleString("de-DE")} €  ·  Fortschritt: ${data.fortschritt.toFixed(1)}%`, margin, y); y += 5;
      pdf.text(`Soll-Ist: ${data.sollIst >= 0 ? "+" : ""}${Math.round(data.sollIst).toLocaleString("de-DE")} €  ·  Arbeitstage Rest: ${data.arbeitstageRest}  ·  Samstage Puffer: ${data.samstageRest}`, margin, y); y += 5;
      pdf.text(`Benötigt ab jetzt: ${data.benoetigtProTagHa.toFixed(1)} HA/Tag  (${Math.round(data.benoetigtProTagEur).toLocaleString("de-DE")} €/Tag)`, margin, y); y += 6;
      // Fortschrittsbalken
      const barW = pageW - margin * 2;
      pdf.setFillColor(240, 240, 240); pdf.rect(margin, y, barW, 5, "F");
      pdf.setFillColor(34, 197, 94); pdf.rect(margin, y, (barW * Math.min(100, data.fortschritt)) / 100, 5, "F");
      y += 10;

      // Samstag-Szenarien
      if (data.samstagSzenarien.length > 0) {
        ensureSpace(15 + data.samstagSzenarien.length * 5);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(20);
        pdf.text("Samstag-Szenarien", margin, y); y += 5;
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(60);
        data.samstagSzenarien.forEach((s) => {
          pdf.text(`+ ${s.anzahl} Samstag (${s.label}): ${s.haProTag.toFixed(1)} HA/Tag  ·  ${Math.round(s.eurProTag).toLocaleString("de-DE")} €/Tag`, margin, y);
          y += 5;
        });
        y += 4;
      }

      // Pipeline
      ensureSpace(40);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(20);
      pdf.text("Pipeline (Buchhaltung)", margin, y); y += 6;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(50);
      const p = data.pipeline;
      pdf.text(`Auftragsvolumen: ${Math.round(p.auftragsvolumen).toLocaleString("de-DE")} €  ·  Vergütet: ${Math.round(p.verguetet).toLocaleString("de-DE")} €  ·  Offen: ${Math.round(p.offeneBetraege).toLocaleString("de-DE")} €`, margin, y); y += 6;
      const rows2: Array<[string, number, number]> = [
        ["Aufmaß offen", p.aufmassOffen.count, p.aufmassOffen.eur],
        ["Gutschrift offen", p.gutschriftOffen.count, p.gutschriftOffen.eur],
        ["Avis offen", p.avisOffen.count, p.avisOffen.eur],
        ["Vergütung offen", p.verguetetOffen.count, p.verguetetOffen.eur],
      ];
      pdf.setFontSize(9);
      rows2.forEach(([label, c, eur]) => {
        ensureSpace(5);
        pdf.text(`${label}:`, margin, y);
        pdf.text(`${c} HA  ·  ${Math.round(eur).toLocaleString("de-DE")} €`, margin + 50, y);
        y += 5;
      });

      // Footer
      const totalPages = pdf.getNumberOfPages();
      for (let pg = 1; pg <= totalPages; pg++) {
        pdf.setPage(pg);
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(140);
        pdf.text(`Finanzübersicht · ${datumStr} · Seite ${pg}/${totalPages}`, margin, pageH - 6);
      }

      const fn = `Finanzen_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}.pdf`;
      pdf.save(fn);
    } catch (e) {
      console.error("PDF Export Fehler", e);
      alert("PDF-Export fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setExporting(false);
    }
  }

  async function exportBauleiterPDF() {
    setExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      // Daten holen
      const [{ data: contacts }, { data: states }, { data: doku }] = await Promise.all([
        supabase.from("contacts").select("bid,strasse,hnr,hnr_zusatz,nvt,ort,zustimmung,auskundung_erforderlich,auskundung_erfolgt"),
        supabase
          .from("call_states")
          .select("bid,status,team,team_status,termin_datum,erledigt_datum,grabenlaenge,klarfall,klarfall_notiz,pruefung_status,pruefung_nachforderung,pruefung_notiz,avis_am,verguetet_am"),
        supabase.from("doku_states").select("bid,foto,protokoll"),
      ]);

      type C = { bid: string; strasse: string; hnr: string; hnr_zusatz: string; nvt: string; ort: string; zustimmung: string; auskundung_erforderlich: boolean; auskundung_erfolgt: boolean };
      type S = {
        bid: string; status: string; team: string; team_status: string;
        termin_datum: string | null; erledigt_datum: string | null;
        grabenlaenge: number; klarfall: boolean; klarfall_notiz: string;
        pruefung_status: string | null; pruefung_nachforderung: string[] | null; pruefung_notiz: string | null;
        avis_am: string | null; verguetet_am: string | null;
      };
      type D = { bid: string; foto: boolean; protokoll: boolean };
      const stateMap = new Map<string, S>();
      ((states as S[]) || []).forEach((s) => stateMap.set(s.bid, s));
      const contactMap = new Map<string, C>();
      ((contacts as C[]) || []).forEach((c) => contactMap.set(c.bid, c));
      const dokuMap = new Map<string, D>();
      ((doku as D[]) || []).forEach((d) => dokuMap.set(d.bid, d));


      const klass = (s?: S): "erledigt" | "in_arbeit" | "offen" => {
        if (!s) return "offen";
        if (s.status === "erledigt") return "erledigt";
        if ((s.team && s.team.trim()) || (s.team_status && s.team_status.trim()) || s.termin_datum) return "in_arbeit";
        return "offen";
      };

      // Gruppierung nach NVT
      const nvtMap = new Map<string, { offen: number; in_arbeit: number; erledigt: number; total: number }>();
      ((contacts as C[]) || []).forEach((c) => {
        const nvt = (c.nvt || "ohne NVT").trim() || "ohne NVT";
        const k = klass(stateMap.get(c.bid));
        const cur = nvtMap.get(nvt) || { offen: 0, in_arbeit: 0, erledigt: 0, total: 0 };
        cur[k]++; cur.total++;
        nvtMap.set(nvt, cur);
      });
      const nvtList = Array.from(nvtMap.entries())
        .map(([nvt, v]) => ({ nvt, ...v, pct: v.total > 0 ? (v.erledigt / v.total) * 100 : 0, prio: getNvtPriority(nvt) }))
        // Priorität DESC, dann NVT alphabetisch
        .sort((a, b) => (b.prio - a.prio) || a.nvt.localeCompare(b.nvt));

      // Diese Woche erledigt
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const weekStart = startOfWeek(today);
      const wsIso = toIso(weekStart);
      const wocheErledigt = ((states as S[]) || [])
        .filter((s) => s.status === "erledigt" && s.erledigt_datum && s.erledigt_datum >= wsIso)
        .map((s) => {
          const c = contactMap.get(s.bid);
          const adr = c ? `${c.strasse} ${c.hnr}${c.hnr_zusatz || ""}`.trim() : s.bid;
          const nvt = c?.nvt || "—";
          return { datum: s.erledigt_datum!, adresse: adr, nvt, graben: Number(s.grabenlaenge || 0), prio: getNvtPriority(nvt) };
        })
        .sort((a, b) => a.datum.localeCompare(b.datum));

      // Klärfälle — manuell (klarfall=true) UND 5 System-Kategorien
      function kategorienFuer(s: S, c: C | undefined): string[] {
        const out: string[] = [];
        if (s.status === "erledigt") {
          if (c?.auskundung_erforderlich && !c.auskundung_erfolgt) out.push("🚫 Ohne Auskundung");
          const d = dokuMap.get(s.bid);
          if (!d?.foto) out.push("📸 Foto fehlt");
          if (!d?.protokoll) out.push("📄 Protokoll fehlt");
          const z = (c?.zustimmung || "").trim().toLowerCase();
          if (!z || z === "nein" || z === "offen") out.push("✍️ Zustimmung fehlt");
          if (s.pruefung_status === "nachforderung") out.push("⚠️ Nachforderung AG");
        }
        if (s.klarfall) out.push("🔧 Manuell");
        return out;
      }

      const klaerfaelle = ((states as S[]) || [])
        .map((s) => {
          const c = contactMap.get(s.bid);
          const kats = kategorienFuer(s, c);
          if (kats.length === 0) return null;
          const adr = c ? `${c.strasse} ${c.hnr}${c.hnr_zusatz || ""}`.trim() : s.bid;
          const nvt = c?.nvt || "—";
          const bauDatum = s.erledigt_datum;
          const tage = bauDatum ? Math.max(0, Math.round((today.getTime() - new Date(bauDatum).getTime()) / 86400000)) : null;
          const notiz = [s.klarfall_notiz, s.pruefung_notiz].filter(Boolean).join(" · ");
          return { adresse: adr, nvt, notiz, bauDatum, tage, prio: getNvtPriority(nvt), kats };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => {
          if (a.bauDatum && b.bauDatum) return a.bauDatum.localeCompare(b.bauDatum);
          if (a.bauDatum) return -1;
          if (b.bauDatum) return 1;
          return 0;
        });
      const aeltesterKlarfall = klaerfaelle.find((k) => k.tage != null)?.tage ?? null;


      // Gesamt
      const totals = nvtList.reduce(
        (a, n) => ({ offen: a.offen + n.offen, in_arbeit: a.in_arbeit + n.in_arbeit, erledigt: a.erledigt + n.erledigt, total: a.total + n.total }),
        { offen: 0, in_arbeit: 0, erledigt: 0, total: 0 },
      );
      const gesPct = totals.total > 0 ? (totals.erledigt / totals.total) * 100 : 0;

      // PDF aufbauen
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 14;
      let y = margin;

      const datumStr = today.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
      const uhrzeit = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

      const ensureSpace = (need: number) => { if (y + need > pageH - margin) { pdf.addPage(); y = margin; } };

      // Titel
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); pdf.setTextColor(20);
      pdf.text("Bauleiter-Bericht", margin, y); y += 7;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(90);
      pdf.text(`Projekt: An der Schmücke · Stand: ${datumStr}, ${uhrzeit} Uhr`, margin, y); y += 8;
      pdf.setDrawColor(226, 0, 116); pdf.setLineWidth(0.8);
      pdf.line(margin, y, pageW - margin, y); y += 8;

      // KPI-Kacheln
      const tileW = (pageW - margin * 2 - 9) / 4;
      const tileH = 24;
      const drawKpi = (x: number, label: string, big: string, sub: string, color: [number, number, number]) => {
        pdf.setFillColor(248, 250, 252); pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.3);
        pdf.roundedRect(x, y, tileW, tileH, 2, 2, "FD");
        pdf.setFillColor(...color); pdf.rect(x, y, 2.5, tileH, "F");
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(110);
        pdf.text(label, x + 5, y + 5);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(15, 23, 42);
        pdf.text(big, x + 5, y + 13);
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(110);
        pdf.text(sub, x + 5, y + 19);
      };
      drawKpi(margin + (tileW + 3) * 0, "Erledigt", `${totals.erledigt}`, `${gesPct.toFixed(1)}% von ${totals.total}`, [34, 197, 94]);
      drawKpi(margin + (tileW + 3) * 1, "In Arbeit", `${totals.in_arbeit}`, `HA aktiv`, [59, 130, 246]);
      drawKpi(margin + (tileW + 3) * 2, "Offen", `${totals.offen}`, `noch zu bauen`, [148, 163, 184]);
      drawKpi(
        margin + (tileW + 3) * 3, "Klärfälle", `${klaerfaelle.length}`,
        aeltesterKlarfall != null ? `ältester: ${aeltesterKlarfall} Tage` : "—",
        [234, 88, 12],
      );
      y += tileH + 6;

      // Gesamt-Fortschrittsbalken
      ensureSpace(14);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(90);
      pdf.text(`Gesamtfortschritt: ${totals.erledigt} / ${totals.total} HA  (${gesPct.toFixed(1)}%)`, margin, y); y += 3;
      const fbarW = pageW - margin * 2;
      pdf.setFillColor(240, 240, 240); pdf.rect(margin, y, fbarW, 5, "F");
      pdf.setFillColor(34, 197, 94); pdf.rect(margin, y, (fbarW * Math.min(100, gesPct)) / 100, 5, "F");
      y += 10;

      // NVT-Übersicht
      ensureSpace(20);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(20);
      pdf.text("Status-Übersicht je NVT", margin, y); y += 2;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(120);
      pdf.text("Sortiert nach Priorität (⭐⭐⭐ = höchste)", margin, y + 4); y += 8;

      const colX = { prio: margin, nvt: margin + 20, ges: margin + 48, off: margin + 70, arb: margin + 92, erl: margin + 116, pct: margin + 142, bar: margin + 158 };
      pdf.setFontSize(9); pdf.setTextColor(110); pdf.setFont("helvetica", "bold");
      pdf.text("Prio", colX.prio, y);
      pdf.text("NVT", colX.nvt, y);
      pdf.text("Gesamt", colX.ges, y);
      pdf.text("Offen", colX.off, y);
      pdf.text("In Arbeit", colX.arb, y);
      pdf.text("Erledigt", colX.erl, y);
      pdf.text("%", colX.pct, y);
      pdf.text("Fortschritt", colX.bar, y);
      y += 2;
      pdf.setDrawColor(200); pdf.setLineWidth(0.2);
      pdf.line(margin, y, pageW - margin, y); y += 3;

      pdf.setFont("helvetica", "normal"); pdf.setTextColor(30);
      nvtList.forEach((n) => {
        ensureSpace(7);
        // Hintergrund-Hervorhebung Prio 3
        if (n.prio === 3) {
          pdf.setFillColor(253, 232, 244);
          pdf.rect(margin - 1, y - 4, pageW - margin * 2 + 2, 6, "F");
        } else if (n.prio === 2) {
          pdf.setFillColor(254, 243, 226);
          pdf.rect(margin - 1, y - 4, pageW - margin * 2 + 2, 6, "F");
        }
        const stars = n.prio > 0 ? "*".repeat(n.prio) : "-";
        if (n.prio === 3) { pdf.setTextColor(226, 0, 116); pdf.setFont("helvetica", "bold"); }
        else if (n.prio === 2) { pdf.setTextColor(234, 88, 12); pdf.setFont("helvetica", "bold"); }
        else { pdf.setTextColor(150); pdf.setFont("helvetica", "normal"); }
        pdf.text(stars, colX.prio, y);
        pdf.setFont("helvetica", n.prio >= 2 ? "bold" : "normal"); pdf.setTextColor(30);
        pdf.text(n.nvt, colX.nvt, y);
        pdf.setFont("helvetica", "normal");
        pdf.text(String(n.total), colX.ges, y);
        pdf.text(String(n.offen), colX.off, y);
        pdf.text(String(n.in_arbeit), colX.arb, y);
        pdf.text(String(n.erledigt), colX.erl, y);
        pdf.text(`${n.pct.toFixed(0)}%`, colX.pct, y);
        const barW = pageW - margin - colX.bar;
        pdf.setFillColor(240, 240, 240);
        pdf.rect(colX.bar, y - 3, barW, 3, "F");
        pdf.setFillColor(34, 197, 94);
        pdf.rect(colX.bar, y - 3, (barW * Math.min(100, n.pct)) / 100, 3, "F");
        y += 6;
      });
      y += 6;

      // Klärfälle
      ensureSpace(20);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(234, 88, 12);
      pdf.text(`⚠ Klärfälle (${klaerfaelle.length})`, margin, y); y += 6;
      pdf.setTextColor(20);

      if (klaerfaelle.length === 0) {
        pdf.setFont("helvetica", "italic"); pdf.setFontSize(10); pdf.setTextColor(140);
        pdf.text("Aktuell keine offenen Klärfälle.", margin, y); y += 8;
      } else {
        klaerfaelle.forEach((k) => {
          ensureSpace(14);
          const stars = k.prio > 0 ? " " + "*".repeat(k.prio) : "";
          pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(20);
          pdf.text(`${k.adresse}  ·  ${k.nvt}${stars}`, margin, y); y += 4;
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(110);
          const bauStr = k.bauDatum
            ? `Gebaut am ${new Date(k.bauDatum).toLocaleDateString("de-DE")}${k.tage != null ? ` · seit ${k.tage} Tagen offen` : ""}`
            : "Bau-Datum unbekannt";
          pdf.text(bauStr, margin, y); y += 4;
          // Kategorien-Zeile (ASCII-only für jsPDF: Emojis fallen weg)
          const katsAscii = k.kats.map((s) => s.replace(/[^\x20-\x7E]/g, "").trim()).filter(Boolean).join(", ");
          if (katsAscii) {
            pdf.setTextColor(200, 60, 40); pdf.setFont("helvetica", "bold");
            const kl = pdf.splitTextToSize(`Blocker: ${katsAscii}`, pageW - margin * 2);
            kl.forEach((line: string) => { ensureSpace(4); pdf.text(line, margin, y); y += 4; });
            pdf.setFont("helvetica", "normal"); pdf.setTextColor(110);
          }

          if (k.notiz) {
            pdf.setTextColor(60);
            const lines = pdf.splitTextToSize(`Notiz: ${k.notiz}`, pageW - margin * 2);
            lines.forEach((line: string) => { ensureSpace(4); pdf.text(line, margin, y); y += 4; });
          }
          pdf.setDrawColor(230); pdf.setLineWidth(0.2);
          pdf.line(margin, y, pageW - margin, y); y += 4;
        });
        y += 2;
      }

      // Diese Woche erledigt
      ensureSpace(20);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(20);
      const kw = getWeek(today);
      pdf.text(`Diese Woche erledigt (KW ${kw})`, margin, y); y += 6;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(90);
      const summeMeter = wocheErledigt.reduce((s, r) => s + r.graben, 0);
      pdf.text(`${wocheErledigt.length} HA · ${summeMeter} m Graben`, margin, y); y += 6;

      if (wocheErledigt.length === 0) {
        pdf.setFont("helvetica", "italic"); pdf.setTextColor(140);
        pdf.text("Diese Woche wurden noch keine Hausanschlüsse abgeschlossen.", margin, y);
        y += 6;
      } else {
        const wX = { dat: margin, adr: margin + 22, nvt: margin + 120, gra: margin + 160 };
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(110);
        pdf.text("Datum", wX.dat, y);
        pdf.text("Adresse", wX.adr, y);
        pdf.text("NVT", wX.nvt, y);
        pdf.text("Graben", wX.gra, y);
        y += 2;
        pdf.setDrawColor(200); pdf.line(margin, y, pageW - margin, y); y += 3;
        pdf.setFont("helvetica", "normal"); pdf.setTextColor(30);
        wocheErledigt.forEach((r) => {
          ensureSpace(6);
          const d = new Date(r.datum);
          const dStr = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
          pdf.text(dStr, wX.dat, y);
          const adr = r.adresse.length > 52 ? r.adresse.slice(0, 50) + "…" : r.adresse;
          pdf.text(adr, wX.adr, y);
          const stars = r.prio > 0 ? " " + "*".repeat(r.prio) : "";
          pdf.text(`${r.nvt}${stars}`, wX.nvt, y);
          pdf.text(`${r.graben} m`, wX.gra, y);
          y += 5;
        });
      }

      // Footer
      const totalPages = pdf.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(140);
        pdf.text(`Bauleiter-Bericht · ${datumStr} · Seite ${p}/${totalPages}`, margin, pageH - 6);
      }

      const fn = `Bauleiter-Bericht_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}.pdf`;
      pdf.save(fn);

      // Alle im Bericht enthaltenen erledigten HAs automatisch als "eingereicht" markieren
      const bidsEinreichen = ((states as S[]) || [])
        .filter((s) => s.status === "erledigt" && (s.pruefung_status ?? "offen") === "offen" && !s.avis_am)
        .map((s) => s.bid);
      if (bidsEinreichen.length > 0) {
        const { error } = await supabase.rpc("mark_eingereicht", { bids: bidsEinreichen });
        if (error) console.warn("mark_eingereicht fehlgeschlagen", error);
      }

    } catch (e) {
      console.error("Bauleiter-PDF Fehler", e);
      alert("Export fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    (async () => {
      const [{ data: cs }, { data: zList }] = await Promise.all([
        supabase
          .from("call_states")
          .select("bid,status,umsatz_eur,zusatz_eur,grabenlaenge,erledigt_datum,aufmass_am,gutschrift_nr,avis_am,verguetet_am,team"),
        supabase.from("umsatz_ziele").select("*"),
      ]);
      setRows((cs as FinRow[]) || []);
      const zMonat = (zList as Ziel[] | null)?.find((z) => z.scope === "monat");
      const zHa = (zList as Ziel[] | null)?.find((z) => z.scope === "ha_preis");
      const zHaTag = (zList as Ziel[] | null)?.find((z) => z.scope === "ha_pro_tag");
      if (zMonat) { setZiel(zMonat); setZielInput(String(zMonat.ziel_eur)); }
      if (zHa) { setHaPreis(Number(zHa.ziel_eur)); setHaPreisInput(String(zHa.ziel_eur)); }
      if (zHaTag) { setHaProTag(Number(zHaTag.ziel_eur)); setHaProTagInput(String(zHaTag.ziel_eur)); }
      const zielEur = zMonat ? Number(zMonat.ziel_eur) : 70000;
      const preisEur = zHa ? Number(zHa.ziel_eur) : 1200;
      setHaAnzahlInput(preisEur > 0 ? String(Math.round(zielEur / preisEur)) : "0");

      setLoading(false);
    })();



    const ch = supabase
      .channel("finanz_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_states" }, (payload) => {
        const r = (payload.new ?? payload.old) as FinRow;
        if (!r?.bid) return;
        setRows((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((x) => x.bid !== r.bid);
          const ex = prev.findIndex((x) => x.bid === r.bid);
          if (ex >= 0) {
            const copy = [...prev]; copy[ex] = r; return copy;
          }
          return [...prev, r];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const data = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = toIso(today);
    const weekStart = startOfWeek(today);
    const weekStartIso = toIso(weekStart);
    const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(weekStart.getDate() - 7);
    const prevWeekStartIso = toIso(prevWeekStart);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartIso = toIso(monthStart);
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthStartIso = toIso(prevMonthStart);
    const prevMonthEndIso = monthStartIso; // exclusive

    const erledigte = rows.filter((r) => r.status === "erledigt" && r.erledigt_datum);
    const sumUmsatz = (rs: FinRow[]) =>
      rs.reduce((s, r) => {
        const real = Number(r.umsatz_eur || 0) + Number(r.zusatz_eur || 0);
        return s + (real > 0 ? real : haPreis);
      }, 0);
    const sumMeter = (rs: FinRow[]) =>
      rs.reduce((s, r) => s + Number(r.grabenlaenge || 0), 0);

    const heute = erledigte.filter((r) => r.erledigt_datum === todayIso);
    // Letzter Arbeitstag = größtes erledigt_datum vor heute (aus tatsächlichen Daten)
    const vergangeneDaten = Array.from(new Set(
      erledigte.filter((r) => r.erledigt_datum! < todayIso).map((r) => r.erledigt_datum!)
    )).sort();
    const letzterArbeitstagIso = vergangeneDaten.length > 0 ? vergangeneDaten[vergangeneDaten.length - 1] : null;
    const letzterArbeitstag = letzterArbeitstagIso
      ? erledigte.filter((r) => r.erledigt_datum === letzterArbeitstagIso)
      : [];
    const woche = erledigte.filter((r) => r.erledigt_datum! >= weekStartIso);
    const vorwoche = erledigte.filter((r) => r.erledigt_datum! >= prevWeekStartIso && r.erledigt_datum! < weekStartIso);
    const monat = erledigte.filter((r) => r.erledigt_datum! >= monthStartIso);
    const vormonat = erledigte.filter((r) => r.erledigt_datum! >= prevMonthStartIso && r.erledigt_datum! < prevMonthEndIso);

    // Labels
    const kwHeute = getWeek(today);
    const kwVor = getWeek(prevWeekStart);
    const monatLabel = today.toLocaleString("de-DE", { month: "long" });
    const vormonatLabel = prevMonthStart.toLocaleString("de-DE", { month: "long" });
    const letzterArbeitstagLabel = letzterArbeitstagIso
      ? (() => {
          const [y, m, d] = letzterArbeitstagIso.split("-").map(Number);
          const dt = new Date(y, m - 1, d);
          const wd = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][dt.getDay()];
          return `${wd} ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
        })()
      : "—";


    // Tatsächliche Arbeitstage = Tage mit mindestens 1 erledigtem HA
    const uniqueDays = (rs: FinRow[]) => new Set(rs.map((r) => r.erledigt_datum)).size;
    const tatsaechlicheWocheTage = uniqueDays(woche);
    const tatsaechlicheMonatTage = uniqueDays(monat);
    const tatsaechlicheVorwocheTage = uniqueDays(vorwoche);
    const tatsaechlicheVormonatTage = uniqueDays(vormonat);
    const haProArbeitstagWoche = tatsaechlicheWocheTage > 0 ? woche.length / tatsaechlicheWocheTage : 0;
    const haProArbeitstagMonat = tatsaechlicheMonatTage > 0 ? monat.length / tatsaechlicheMonatTage : 0;
    const haProArbeitstagVorwoche = tatsaechlicheVorwocheTage > 0 ? vorwoche.length / tatsaechlicheVorwocheTage : 0;
    const haProArbeitstagVormonat = tatsaechlicheVormonatTage > 0 ? vormonat.length / tatsaechlicheVormonatTage : 0;

    // Pipeline-Stände (Buchhaltung)
    const fertig = rows.filter((r) => r.status === "erledigt");
    const aufmassOffen = fertig.filter((r) => !r.aufmass_am);
    const gutschriftOffen = fertig.filter((r) => r.aufmass_am && !r.gutschrift_nr);
    const avisOffen = fertig.filter((r) => r.gutschrift_nr && !r.avis_am);
    const verguetetOffen = fertig.filter((r) => r.avis_am && !r.verguetet_am);
    const verguetet = fertig.filter((r) => r.verguetet_am);

    // Trend: letzte 30 Tage
    const trend: { tag: string; label: string; eur: number; meter: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const iso = toIso(d);
      const dayRows = erledigte.filter((r) => r.erledigt_datum === iso);
      trend.push({
        tag: iso,
        label: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`,
        eur: sumUmsatz(dayRows),
        meter: sumMeter(dayRows),
      });
    }

    // Pro Woche der letzten 12 Wochen
    const trendWoche: { label: string; eur: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const ws = new Date(weekStart); ws.setDate(weekStart.getDate() - i * 7);
      const we = new Date(ws); we.setDate(ws.getDate() + 7);
      const wsIso = toIso(ws), weIso = toIso(we);
      const wkRows = erledigte.filter((r) => r.erledigt_datum! >= wsIso && r.erledigt_datum! < weIso);
      trendWoche.push({
        label: `KW${getWeek(ws)}`,
        eur: sumUmsatz(wkRows),
      });
    }

    // Team-Vergleich (Monat)
    const teamMap = new Map<string, number>();
    for (const r of monat) {
      const t = (r.team || "ohne Team").trim() || "ohne Team";
      teamMap.set(t, (teamMap.get(t) || 0) + Number(r.umsatz_eur || 0) + Number(r.zusatz_eur || 0));
    }
    const teamData = Array.from(teamMap.entries())
      .map(([name, eur]) => ({ name, eur }))
      .sort((a, b) => b.eur - a.eur);

    // Ziele
    const zielMonat = ziel?.ziel_eur ?? 70_000;
    const satBuffer = ziel?.saturday_buffer ?? true;
    const arbeitstageMonat = workdaysInMonth(today.getFullYear(), today.getMonth(), satBuffer);
    const arbeitstagePassed = workdaysPassedInMonth(today, satBuffer);
    const samstageRest = saturdaysRemainingInMonth(today);
    const samstageDates = saturdayDatesRemaining(today);
    const tagesziel = zielMonat / arbeitstageMonat;
    const wochenziel = tagesziel * 5; // Mo-Fr
    const sollHeute = tagesziel * arbeitstagePassed;
    const umsatzMonat = sumUmsatz(monat);
    const umsatzWoche = sumUmsatz(woche);
    const umsatzHeute = sumUmsatz(heute);
    const fortschritt = (umsatzMonat / zielMonat) * 100;
    const arbeitstageRest = Math.max(0, arbeitstageMonat - arbeitstagePassed);
    const fehlendEur = Math.max(0, zielMonat - umsatzMonat);
    const benoetigtProTagEur = arbeitstageRest > 0 ? fehlendEur / arbeitstageRest : 0;
    const benoetigtProTagHa = haPreis > 0 ? benoetigtProTagEur / haPreis : 0;
    const sollIst = umsatzMonat - sollHeute; // positiv = über Soll
    // HA-Ziele
    const haZielMonat = haPreis > 0 ? zielMonat / haPreis : 0;
    const haTagesziel = haPreis > 0 ? tagesziel / haPreis : 0;
    const haWochenziel = haTagesziel * 5;
    const haSollHeute = haTagesziel * arbeitstagePassed;
    const haSollIst = monat.length - haSollHeute;

    // Samstag-Szenarien: nutze 0..N der verbleibenden Samstage als Zusatz-Arbeitstage
    const samstagSzenarien = samstageDates.map((d, i) => {
      const extra = i + 1;
      const tageGesamt = arbeitstageRest + extra;
      const eurProTag = tageGesamt > 0 ? fehlendEur / tageGesamt : 0;
      const haProTag = haPreis > 0 ? eurProTag / haPreis : 0;
      return {
        datum: d,
        label: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`,
        anzahl: extra,
        tageGesamt,
        eurProTag,
        haProTag,
      };
    });

    const auftragsvolumen = sumUmsatz(fertig);
    const offeneBetraege = auftragsvolumen - sumUmsatz(verguetet);

    return {
      umsatzHeute, umsatzWoche, umsatzMonat,
      meterHeute: sumMeter(heute), meterWoche: sumMeter(woche), meterMonat: sumMeter(monat),
      countHeute: heute.length, countWoche: woche.length, countMonat: monat.length,
      // Vergleichswerte (Vorperiode)
      umsatzGestern: sumUmsatz(letzterArbeitstag), meterGestern: sumMeter(letzterArbeitstag), countGestern: letzterArbeitstag.length,
      letzterArbeitstagLabel, kwHeute, kwVor, monatLabel, vormonatLabel,

      umsatzVorwoche: sumUmsatz(vorwoche), meterVorwoche: sumMeter(vorwoche), countVorwoche: vorwoche.length,
      umsatzVormonat: sumUmsatz(vormonat), meterVormonat: sumMeter(vormonat), countVormonat: vormonat.length,
      // Tatsächliche Arbeitstage / Tempo
      tatsaechlicheWocheTage, tatsaechlicheMonatTage,
      tatsaechlicheVorwocheTage, tatsaechlicheVormonatTage,
      haProArbeitstagWoche, haProArbeitstagMonat,
      haProArbeitstagVorwoche, haProArbeitstagVormonat,
      zielMonat, tagesziel, wochenziel, sollHeute, fortschritt, sollIst,
      haZielMonat, haTagesziel, haWochenziel, haSollHeute, haSollIst,
      arbeitstageMonat, arbeitstagePassed, satBuffer, samstageRest,
      arbeitstageRest, benoetigtProTagEur, benoetigtProTagHa,
      samstagSzenarien,
      pipeline: {
        auftragsvolumen,
        verguetet: sumUmsatz(verguetet),
        offeneBetraege,
        aufmassOffen: { count: aufmassOffen.length, eur: sumUmsatz(aufmassOffen) },
        gutschriftOffen: { count: gutschriftOffen.length, eur: sumUmsatz(gutschriftOffen) },
        avisOffen: { count: avisOffen.length, eur: sumUmsatz(avisOffen) },
        verguetetOffen: { count: verguetetOffen.length, eur: sumUmsatz(verguetetOffen) },
      },
      trend, trendWoche, teamData,
    };
  }, [rows, ziel, haPreis]);


  async function saveZiel() {
    const vInput = parseFloat(zielInput.replace(/[^\d.]/g, ""));
    const p = parseFloat(haPreisInput.replace(/[^\d.]/g, ""));
    const hpt = parseFloat(haProTagInput.replace(/[^\d.]/g, ""));

    // Effektiver HA-Preis (neu oder alt)
    const effHaPreis = isFinite(p) && p > 0 ? p : haPreis;
    const satBuffer = ziel?.saturday_buffer ?? true;
    const today = new Date();
    const arbeitstageMonat = workdaysInMonth(today.getFullYear(), today.getMonth(), satBuffer);

    // Wenn HA/Tag angegeben → Monatsziel daraus ableiten (überschreibt manuelle Eingabe)
    let v = vInput;
    if (isFinite(hpt) && hpt > 0) {
      v = hpt * arbeitstageMonat * effHaPreis;
      await supabase.from("umsatz_ziele").upsert({
        scope: "ha_pro_tag", ziel_eur: hpt, arbeitstage_pro_monat: arbeitstageMonat, saturday_buffer: satBuffer,
      }, { onConflict: "scope" });
      setHaProTag(hpt);
      setZielInput(String(Math.round(v)));
    }

    if (isFinite(v) && v > 0) {
      await supabase.from("umsatz_ziele").upsert({
        scope: "monat", ziel_eur: v, arbeitstage_pro_monat: ziel?.arbeitstage_pro_monat ?? 22,
        saturday_buffer: satBuffer,
      }, { onConflict: "scope" });
      setZiel({ ...(ziel ?? { scope: "monat", arbeitstage_pro_monat: 22, saturday_buffer: true }), ziel_eur: v });
    }
    if (isFinite(p) && p > 0) {
      await supabase.from("umsatz_ziele").upsert({
        scope: "ha_preis", ziel_eur: p, arbeitstage_pro_monat: 22, saturday_buffer: true,
      }, { onConflict: "scope" });
      setHaPreis(p);
    }
    setEditingZiel(false);
  }



  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Lade Finanzdaten…</div>;
  }

  const overUnder = data.sollIst >= 0;

  return (
    <div style={{ padding: "12px 12px 80px", background: "#f7f8fa", minHeight: "100%" }}>
      {/* Export-Leiste (wird beim PDF-Export ausgeblendet) */}
      <div data-no-export style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <button
          onClick={exportBauleiterPDF}
          disabled={exporting}
          style={{
            background: exporting ? "#94a3b8" : "#e20074",
            color: "white", border: "none", borderRadius: 8,
            padding: "8px 14px", fontSize: 12, fontWeight: 700,
            cursor: exporting ? "wait" : "pointer",
            boxShadow: "0 2px 6px rgba(226,0,116,0.25)",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          🏗️ Bauleiter-Bericht
        </button>
        <button
          onClick={exportPDF}
          disabled={exporting}
          style={{
            background: exporting ? "#94a3b8" : "#0f172a",
            color: "white", border: "none", borderRadius: 8,
            padding: "8px 14px", fontSize: 12, fontWeight: 700,
            cursor: exporting ? "wait" : "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          {exporting ? "⏳ Erzeuge PDF…" : "📄 Finanz-PDF"}
        </button>
      </div>

      <div ref={exportRef}>
      {/* Hero: Monatsziel */}
      <div style={{
        background: "linear-gradient(135deg, #e20074 0%, #b8005c 100%)",
        color: "white", borderRadius: 14, padding: 16, marginBottom: 12,
        boxShadow: "0 4px 14px rgba(226,0,116,0.25)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.5 }}>Monatsziel</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>{EUR(data.umsatzMonat)}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              von {EUR(data.zielMonat)} ({data.fortschritt.toFixed(1)}%) · {data.countMonat} / {Math.round(data.haZielMonat)} HA
            </div>
          </div>
          <button
            onClick={() => setEditingZiel(true)}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", borderRadius: 8, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}
          >
            ⚙ Ziel
          </button>
        </div>
        {/* Progress */}
        <div style={{ height: 12, background: "rgba(255,255,255,0.2)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
          <div style={{
            width: `${Math.min(100, data.fortschritt)}%`,
            height: "100%",
            background: "linear-gradient(90deg, #fbbf24, #fde047)",
            transition: "width 0.4s",
          }} />
          {/* Soll-Marker */}
          <div style={{
            position: "absolute", top: -2, bottom: -2,
            left: `${Math.min(100, (data.sollHeute / data.zielMonat) * 100)}%`,
            width: 2, background: "white", boxShadow: "0 0 4px rgba(0,0,0,0.4)",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, opacity: 0.9 }}>
          <span>Soll heute: {EUR(data.sollHeute)} · {Math.round(data.haSollHeute)} HA</span>
          <span style={{ fontWeight: 700 }}>
            {overUnder ? "▲" : "▼"} {EUR(Math.abs(data.sollIst))} · {Math.abs(data.haSollIst).toFixed(1)} HA {overUnder ? "über" : "unter"} Soll
          </span>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, opacity: 0.7 }}>
          {data.arbeitstagePassed}/{data.arbeitstageMonat} Arbeitstage · {data.satBuffer ? `Sa = Puffer (${data.samstageRest} übrig)` : "Sa zählt"} · Pauschale {EUR(haPreis)}/HA
        </div>
      </div>

      {/* On-Time Banner */}
      <div style={{
        background: overUnder ? "#dcfce7" : "#fee2e2",
        color: overUnder ? "#166534" : "#991b1b",
        borderLeft: `4px solid ${overUnder ? "#22c55e" : "#ef4444"}`,
        borderRadius: 10, padding: "10px 12px", marginBottom: 12,
        fontSize: 13, fontWeight: 700,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            {overUnder
              ? `✅ On Time – wir liegen ${EUR(Math.abs(data.sollIst))} vor dem Plan`
              : `⚠️ Hinten dran – uns fehlen ${EUR(Math.abs(data.sollIst))} zum Tagessoll`}
          </span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>
            {Math.abs(data.haSollIst).toFixed(1)} HA {overUnder ? "Vorsprung" : "Rückstand"}
          </span>
        </div>
        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, opacity: 0.95, borderTop: `1px solid ${overUnder ? "#86efac" : "#fecaca"}`, paddingTop: 6 }}>
          📈 Benötigt ab jetzt: <b>{data.benoetigtProTagHa.toFixed(1)} HA/Tag</b> ({EUR(data.benoetigtProTagEur)}) · noch {data.arbeitstageRest} Arbeitstage
        </div>
        {data.samstagSzenarien.length > 0 && (
          <div style={{ marginTop: 8, borderTop: `1px solid ${overUnder ? "#86efac" : "#fecaca"}`, paddingTop: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.9, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
              🗓️ Samstags-Puffer aktivieren
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {data.samstagSzenarien.map((s) => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, background: "rgba(255,255,255,0.12)", borderRadius: 6, padding: "5px 8px" }}>
                  <span style={{ fontWeight: 600 }}>
                    +{s.anzahl} Sa {s.anzahl === 1 ? `(${s.label})` : `(bis ${s.label})`}
                  </span>
                  <span>
                    <b>{s.haProTag.toFixed(1)} HA/Tag</b> · {EUR(s.eurProTag)} · {s.tageGesamt} Tage
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editingZiel && (
        <div style={{ background: "white", borderRadius: 10, padding: 12, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ziele anpassen</div>
          <label style={{ fontSize: 11, color: "#475569", display: "block", marginBottom: 8 }}>
            Ø Hausanschlüsse pro Tag (Team-Ziel)
            <input
              type="number"
              step="0.1"
              value={haProTagInput}
              onChange={(e) => setHaProTagInput(e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 16 }}
            />
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
              Monatsziel wird automatisch berechnet: HA/Tag × Arbeitstage × Pauschale
            </div>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: "#475569" }}>
              Monatsziel (€)
              <input
                type="number"
                value={zielInput}
                onChange={(e) => setZielInput(e.target.value)}
                style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 16 }}
              />
            </label>
            <label style={{ fontSize: 11, color: "#475569" }}>
              Pauschale pro HA (€)
              <input
                type="number"
                value={haPreisInput}
                onChange={(e) => setHaPreisInput(e.target.value)}
                style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 16 }}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveZiel} style={{ flex: 1, padding: "8px 14px", background: "#22c55e", color: "white", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
              Speichern
            </button>
            <button onClick={() => setEditingZiel(false)} style={{ padding: "8px 12px", background: "#f3f4f6", border: "none", borderRadius: 8, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* KPI-Cards: Heute / Woche / Monat (mit Vorperiode-Vergleich) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <KpiCard
          title="Heute" prevTitle={`Letzter AT · ${data.letzterArbeitstagLabel}`} showPrev={showPrevHeute} onToggle={() => setShowPrevHeute((v) => !v)}
          eur={data.umsatzHeute} meter={data.meterHeute} count={data.countHeute}
          prevEur={data.umsatzGestern} prevMeter={data.meterGestern} prevCount={data.countGestern}
          ziel={data.tagesziel} haZiel={data.haTagesziel} color="#3b82f6"
        />
        <KpiCard
          title={`Woche · KW ${data.kwHeute}`} prevTitle={`Vorwoche · KW ${data.kwVor}`} showPrev={showPrevWoche} onToggle={() => setShowPrevWoche((v) => !v)}
          eur={data.umsatzWoche} meter={data.meterWoche} count={data.countWoche}
          prevEur={data.umsatzVorwoche} prevMeter={data.meterVorwoche} prevCount={data.countVorwoche}
          ziel={data.wochenziel} haZiel={data.haWochenziel} color="#8b5cf6"
          workdays={data.tatsaechlicheWocheTage}
          prevWorkdays={data.tatsaechlicheVorwocheTage}
          haPerWorkday={data.haProArbeitstagWoche}
          prevHaPerWorkday={data.haProArbeitstagVorwoche}
        />
        <KpiCard
          title={`Monat · ${data.monatLabel}`} prevTitle={`Vormonat · ${data.vormonatLabel}`} showPrev={showPrevMonat} onToggle={() => setShowPrevMonat((v) => !v)}
          eur={data.umsatzMonat} meter={data.meterMonat} count={data.countMonat}
          prevEur={data.umsatzVormonat} prevMeter={data.meterVormonat} prevCount={data.countVormonat}
          ziel={data.zielMonat} haZiel={data.haZielMonat} color="#22c55e"
          workdays={data.tatsaechlicheMonatTage}
          prevWorkdays={data.tatsaechlicheVormonatTage}
          haPerWorkday={data.haProArbeitstagMonat}
          prevHaPerWorkday={data.haProArbeitstagVormonat}
        />

      </div>


      {/* Trend Tage */}
      <Card title="Umsatz pro Tag (30 Tage)">
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={data.trend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={3} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                formatter={(v: number) => EUR(v)}
                labelFormatter={(l) => `Tag ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="eur" fill="#e20074" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Trend Wochen */}
      <Card title="Umsatz pro Woche (12 Wochen)">
        <div style={{ height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={data.trendWoche} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => EUR(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="eur" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Buchhaltungs-Pipeline */}
      <Card title="Buchhaltungs-Pipeline">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <PipelineStep label="Auftragsvolumen" eur={data.pipeline.auftragsvolumen} color="#6366f1" />
          <PipelineStep label="Vergütet" eur={data.pipeline.verguetet} color="#22c55e" />
          <PipelineStep label="Aufmaß offen" eur={data.pipeline.aufmassOffen.eur} count={data.pipeline.aufmassOffen.count} color="#fb923c" />
          <PipelineStep label="Gutschrift offen" eur={data.pipeline.gutschriftOffen.eur} count={data.pipeline.gutschriftOffen.count} color="#f59e0b" />
          <PipelineStep label="AVIS offen" eur={data.pipeline.avisOffen.eur} count={data.pipeline.avisOffen.count} color="#3b82f6" />
          <PipelineStep label="Zahlung offen" eur={data.pipeline.verguetetOffen.eur} count={data.pipeline.verguetetOffen.count} color="#ef4444" />
        </div>
        <div style={{ marginTop: 10, padding: 10, background: "#fef3c7", borderRadius: 8, fontSize: 12, color: "#78350f", fontWeight: 600 }}>
          💰 Offene Beträge gesamt: <span style={{ fontSize: 15 }}>{EUR2(data.pipeline.offeneBetraege)}</span>
        </div>
      </Card>

      {/* Team-Vergleich */}
      {data.teamData.length > 0 && (
        <Card title="Team-Vergleich (Monat)">
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.teamData}
                  dataKey="eur"
                  nameKey="name"
                  cx="50%" cy="50%"
                  outerRadius={65}
                  label={(e: { name: string; eur: number }) => `${e.name}: ${EUR(e.eur)}`}
                  labelLine={false}
                  fontSize={10}
                >
                  {data.teamData.map((_, i) => (
                    <Cell key={i} fill={["#e20074","#3b82f6","#22c55e","#fb923c","#8b5cf6","#94a3b8"][i % 6]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => EUR(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Footer-Hinweis */}
      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 10, marginTop: 16 }}>
        Live-Daten · Samstag = Puffertag
      </div>
      </div>
    </div>
  );
}

function KpiCard({
  title, eur, ziel, haZiel, meter, count, color,
  prevTitle, showPrev, onToggle, prevEur, prevMeter, prevCount,
  workdays, prevWorkdays, haPerWorkday, prevHaPerWorkday,
}: {
  title: string; eur: number; ziel: number; haZiel: number; meter: number; count: number; color: string;
  prevTitle: string; showPrev: boolean; onToggle: () => void;
  prevEur: number; prevMeter: number; prevCount: number;
  workdays?: number; prevWorkdays?: number;
  haPerWorkday?: number; prevHaPerWorkday?: number;
}) {
  const dispEur = showPrev ? prevEur : eur;
  const dispCount = showPrev ? prevCount : count;
  const dispMeter = showPrev ? prevMeter : meter;
  const dispWorkdays = showPrev ? prevWorkdays : workdays;
  const dispHaPerWorkday = showPrev ? prevHaPerWorkday : haPerWorkday;
  const pct = ziel > 0 ? (dispEur / ziel) * 100 : 0;
  const dispTitle = showPrev ? prevTitle : title;
  const hasWorkdayInfo = dispWorkdays != null && dispWorkdays > 0 && dispHaPerWorkday != null;
  return (
    <div style={{ background: "white", borderRadius: 10, padding: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: showPrev ? "#9333ea" : "#6b7280", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.3 }}>{dispTitle}</div>
        <button
          onClick={onToggle}
          title={showPrev ? `Zurück zu ${title}` : `Zeige ${prevTitle}`}
          style={{
            background: showPrev ? "#9333ea" : "#f3f4f6",
            color: showPrev ? "white" : "#6b7280",
            border: "none", borderRadius: 4, padding: "1px 5px",
            fontSize: 9, fontWeight: 700, cursor: "pointer", lineHeight: 1.2,
          }}
        >
          {showPrev ? "↻" : "⟲"}
        </button>
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color, marginTop: 2, lineHeight: 1.1 }}>{EUR(dispEur)}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginTop: 2 }}>{dispCount} <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>HA</span></div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>Ziel {EUR(ziel)} · {haZiel.toFixed(1)} HA</div>
      <div style={{ height: 4, background: "#f3f4f6", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color }} />
      </div>
      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4, textAlign: "right" }}>{dispMeter} m Graben</div>
      {hasWorkdayInfo && (
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #f3f4f6", fontSize: 10, color: "#475569", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Ø <b>{dispHaPerWorkday!.toFixed(1)} HA</b>/Tag</span>
          <span style={{ color: "#9ca3af" }}>{dispWorkdays} Arbeitst{dispWorkdays === 1 ? "ag" : "age"}</span>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 10, padding: 12, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function PipelineStep({ label, eur, count, color }: { label: string; eur: number; count?: number; color: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>
      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>{EUR(eur)}</div>
      {count !== undefined && <div style={{ fontSize: 10, color: "#9ca3af" }}>{count} HA</div>}
    </div>
  );
}

function getWeek(d: Date) {
  const date = new Date(d.valueOf());
  const dayNum = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayNum + 3);
  const firstThursday = date.valueOf();
  date.setMonth(0, 1);
  if (date.getDay() !== 4) date.setMonth(0, 1 + ((4 - date.getDay()) + 7) % 7);
  return 1 + Math.ceil((firstThursday - date.valueOf()) / 604800000);
}
