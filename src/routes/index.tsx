import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Contact, CallState, CallStatus } from "@/lib/types";
import { KalenderTab } from "@/components/KalenderTab";
import DokuTab from "@/components/DokuTab";
import KarteTab from "@/components/KarteTab";
import NvtTab from "@/components/NvtTab";
import GrabenStepper from "@/components/GrabenStepper";
import GrabenPromptSheet from "@/components/GrabenPromptSheet";
import LocalNotizTextarea from "@/components/LocalNotizTextarea";
import StreetViewImage from "@/components/StreetViewImage";
import TeamSection from "@/components/TeamSection";
import FinanzTab from "@/components/FinanzTab";
import PipelineTab from "@/components/PipelineTab";
import { isPriorityNvt, isUrgentNvt, getNvtPriority, priorityStars, type PriorityLevel } from "@/lib/priority";
import { buildRelationIndex, REASON_LABEL } from "@/lib/relatedContacts";
import * as XLSX from "xlsx";
import { runFullProFiberImport } from "@/lib/proFiberImport";

type StatusFilter = "alle" | "offen" | "erledigt" | "abgelehnt";

type FieldKey =
  | "Status"
  | "Adresse"
  | "PLZ"
  | "Ort"
  | "NVT"
  | "Name"
  | "Email"
  | "Mobil"
  | "Festnetz"
  | "Typ"
  | "WE"
  | "GE"
  | "Zustimmung"
  | "Auskundung erforderlich"
  | "Auskundung von"
  | "Auskundung bis"
  | "Termin"
  | "Termin Zeit"
  | "Erledigt am"
  | "Notiz"
  | "Klarfall"
  | "Klarfall Notiz"
  | "Grabenlänge"
  | "Team"
  | "Team Status"
  | "Umsatz EUR"
  | "Zusatz EUR"
  | "KLS-ID"
  | "Priorität";

const ALL_FIELDS: FieldKey[] = [
  "Status",
  "Adresse",
  "PLZ",
  "Ort",
  "NVT",
  "Priorität",
  "Name",
  "Email",
  "Mobil",
  "Festnetz",
  "Typ",
  "WE",
  "GE",
  "Zustimmung",
  "Auskundung erforderlich",
  "Auskundung von",
  "Auskundung bis",
  "Termin",
  "Termin Zeit",
  "Erledigt am",
  "Notiz",
  "Klarfall",
  "Klarfall Notiz",
  "Grabenlänge",
  "Team",
  "Team Status",
  "Umsatz EUR",
  "Zusatz EUR",
  "KLS-ID",
];

const DEFAULT_FIELDS: FieldKey[] = [
  "Status",
  "Adresse",
  "NVT",
  "Name",
  "Mobil",
  "Festnetz",
  "Auskundung erforderlich",
  "Termin",
];

function buildRow(c: Contact, st: CallState | undefined, fields: FieldKey[]): Record<string, unknown> {
  const adresse = `${c.strasse} ${c.hnr}${c.hnr_zusatz || ""}`.trim();
  const auskundung = c.auskundung_von || c.auskundung_bis ? "ja" : "nein";
  const status = st?.status === "erledigt" ? "erledigt" : st?.status === "abgelehnt" ? "abgelehnt" : "offen";
  const all: Record<FieldKey, unknown> = {
    Status: status,
    Adresse: adresse,
    PLZ: c.plz || "",
    Ort: c.ort || "",
    NVT: c.nvt || "",
    Priorität: getNvtPriority(c.nvt) ?? "",
    Name: c.name || "",
    Email: c.email || "",
    Mobil: c.mobil || "",
    Festnetz: c.festnetz || "",
    Typ: c.typ || "",
    WE: c.we ?? 0,
    GE: c.ge ?? 0,
    Zustimmung: c.zustimmung || "",
    "Auskundung erforderlich": auskundung,
    "Auskundung von": c.auskundung_von || "",
    "Auskundung bis": c.auskundung_bis || "",
    Termin: st?.termin_datum || "",
    "Termin Zeit": st?.termin_zeit || "",
    "Erledigt am": st?.erledigt_datum || "",
    Notiz: st?.notiz || "",
    Klarfall: st?.klarfall ? "ja" : "",
    "Klarfall Notiz": st?.klarfall_notiz || "",
    Grabenlänge: st?.grabenlaenge ?? 0,
    Team: st?.team || "",
    "Team Status": st?.team_status || "",
    "Umsatz EUR": (st as unknown as { umsatz_eur?: number })?.umsatz_eur ?? 0,
    "Zusatz EUR": (st as unknown as { zusatz_eur?: number })?.zusatz_eur ?? 0,
    "KLS-ID": c.kls_id || "",
  };
  const row: Record<string, unknown> = {};
  for (const f of fields) row[f] = all[f];
  return row;
}

type ScopeFilter = StatusFilter | "aktuell";

function exportHausanschluesseXlsx(
  contacts: Contact[],
  callStates: Record<string, CallState>,
  onlyPriority: boolean,
  statusFilter: ScopeFilter,
  fields: FieldKey[],
  filteredView?: Contact[],
) {
  let list: Contact[];
  let suffix = "";
  if (statusFilter === "aktuell" && filteredView) {
    list = filteredView;
    suffix = "_ansicht";
  } else {
    list = onlyPriority ? contacts.filter((c) => isPriorityNvt(c.nvt)) : contacts;
    if (statusFilter !== "alle") {
      list = list.filter((c) => {
        const st = callStates[c.bid]?.status;
        if (statusFilter === "erledigt") return st === "erledigt";
        if (statusFilter === "abgelehnt") return st === "abgelehnt";
        return st !== "erledigt" && st !== "abgelehnt";
      });
      suffix = `_${statusFilter}`;
    }
  }
  const rows = list.map((c) => buildRow(c, callStates[c.bid], fields));
  const ws = XLSX.utils.json_to_sheet(rows, { header: fields });
  ws["!cols"] = fields.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  const sheetName = statusFilter === "aktuell" ? "Aktuelle Ansicht" : (onlyPriority ? "Prio-Hausanschlüsse" : "Hausanschlüsse");
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // 📑 Zusatz-Blatt: Objekte ohne Eigentümerzustimmung (nur Telekom-Aufträge
  // mit Status Ausstehend/PENDING/leer – manuell/TTA-Objekte gehören in das
  // Blatt "Ohne Telekom-Auftrag").
  const ohneZust = contacts
    .filter((c) => zustimmungStatus(c.zustimmung, c.bid) === "fehlt")
    .map((c) => ({
      Adresse: `${c.strasse} ${c.hnr}${c.hnr_zusatz ?? ""}`.trim(),
      PLZ: c.plz, Ort: c.ort, NVT: c.nvt,
      Eigentümer: c.name, Mobil: c.mobil, Festnetz: c.festnetz, Email: c.email,
      Zustimmung: c.zustimmung || "—",
      Status: callStates[c.bid]?.status ?? "offen",
      "KLS-ID": c.kls_id || "",
    }));
  if (ohneZust.length) {
    const wsZ = XLSX.utils.json_to_sheet(ohneZust);
    wsZ["!cols"] = Object.keys(ohneZust[0]).map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, wsZ, "Ohne Zustimmung");
  }

  // 📑 Zusatz-Blatt: Aufträge / gebaute Objekte ohne Telekom-Exporteintrag
  // (manuell angelegte Objekte: BID-Präfix MAN-/manual-/TTA- oder Suffix -MAN).
  const ohneTelekom = contacts
    .filter((c) => isOhneTelekomAuftrag(c.bid))
    .map((c) => {
      const st = callStates[c.bid];
      return {
        Adresse: `${c.strasse} ${c.hnr}${c.hnr_zusatz ?? ""}`.trim(),
        PLZ: c.plz, Ort: c.ort, NVT: c.nvt,
        Eigentümer: c.name, Mobil: c.mobil, Festnetz: c.festnetz,
        Zustimmung: c.zustimmung || "—",
        Status: st?.status ?? "offen",
        Gebaut_am: st?.erledigt_datum ?? "",
        Grabenlänge_m: st?.grabenlaenge ?? 0,
        Notiz: st?.notiz ?? "",
        "KLS-ID": c.kls_id || "",
      };
    });
  if (ohneTelekom.length) {
    const wsT = XLSX.utils.json_to_sheet(ohneTelekom);
    wsT["!cols"] = Object.keys(ohneTelekom[0]).map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, wsT, "Ohne Telekom-Auftrag");
  }

  const date = new Date().toISOString().slice(0, 10);
  const fname = `hausanschluesse_${onlyPriority && statusFilter !== "aktuell" ? "prio_" : ""}${date}${suffix}.xlsx`;
  XLSX.writeFile(wb, fname);
}

function ImportButton() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [report, setReport] = useState<Awaited<ReturnType<typeof runFullProFiberImport>> | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    setMsg("Importiere…");
    try {
      const res = await runFullProFiberImport(f, () => {});
      const parts: string[] = [];
      if (res.contactsOk) parts.push(`${res.contactsOk} Kontakte (${res.contactsNew} neu)`);
      if (res.statesOk) parts.push(`${res.statesOk} Status`);
      if (res.statesUnmatched) parts.push(`${res.statesUnmatched} ohne Match`);
      setMsg(parts.length ? `✅ ${parts.join(" · ")}` : "✅ Fertig");
      if (res.errors.length) setMsg(`⚠ ${res.errors[0]}`);
      setReport(res);
    } catch (err) {
      setMsg(`❌ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function closeReport() {
    setReport(null);
    // Cache-busting Reload: iOS-Safari serviert sonst häufig alten JS-Bundle
    const u = new URL(window.location.href);
    u.searchParams.set("_r", String(Date.now()));
    window.location.replace(u.toString());
  }

  const badFmt = report?.dokuIssues.filter(i => i.foto === "format" || i.protokoll === "format" || i.sharepoint === "format") ?? [];
  const missing = report?.dokuIssues.filter(i => !(i.foto === "format" || i.protokoll === "format" || i.sharepoint === "format")) ?? [];
  const cell = (s: "ok" | "fehlt" | "format", raw: string) =>
    s === "ok" ? <span style={{ color: "#16a34a" }}>✓</span>
    : s === "format" ? <span style={{ color: "#dc2626" }} title={`„${raw}"`}>⚠ {raw || "?"}</span>
    : <span style={{ color: "#6b7280" }}>—</span>;

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={onFile} />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title={msg || "Pro-Fiber Database (.xlsx) importieren · nur Schmücke"}
        style={{
          fontSize: 11, background: busy ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.22)",
          borderRadius: 8, padding: "4px 8px", color: "white", border: "none", cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? "⏳" : "📥 Import"}
      </button>
      {msg && !busy && !report && (
        <span style={{ position: "absolute", top: 56, right: 8, background: "#1f2937", color: "white", fontSize: 11, padding: "6px 10px", borderRadius: 8, maxWidth: 320, zIndex: 50 }}>
          {msg}
        </span>
      )}
      {report && (
        <div onClick={closeReport} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12, maxWidth: 760, width: "100%", maxHeight: "85vh", overflow: "auto", padding: 16, color: "#111" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>📋 Import-Bericht</h3>
              <button onClick={closeReport} style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>Schließen & neu laden</button>
            </div>
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 12 }}>
              {report.contactsOk} Kontakte ({report.contactsNew} neu · {report.contactsUpd} update) · {report.statesOk} Status aktualisiert
              {report.statesUnmatched ? ` · ${report.statesUnmatched} ohne Match` : ""}
            </div>
            {report.errors.length > 0 && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 8, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
                {report.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
              </div>
            )}

            <h4 style={{ margin: "12px 0 6px", fontSize: 13, color: "#dc2626" }}>
              Format-Fehler ({badFmt.length}) – Wert konnte nicht als „Ja/Nein" gelesen werden
            </h4>
            {badFmt.length === 0 ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>Keine Format-Probleme 🎉</div>
            ) : (
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f3f4f6" }}>
                  <th style={{ textAlign: "left", padding: 4 }}>Adresse</th>
                  <th style={{ padding: 4 }}>FotoGIS</th>
                  <th style={{ padding: 4 }}>Protokoll</th>
                  <th style={{ padding: 4 }}>SharePoint</th>
                </tr></thead>
                <tbody>
                  {badFmt.map(i => (
                    <tr key={i.bid} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: 4 }}>{i.adresse}</td>
                      <td style={{ padding: 4, textAlign: "center" }}>{cell(i.foto, i.rawFoto)}</td>
                      <td style={{ padding: 4, textAlign: "center" }}>{cell(i.protokoll, i.rawProtokoll)}</td>
                      <td style={{ padding: 4, textAlign: "center" }}>{cell(i.sharepoint, i.rawSharepoint)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h4 style={{ margin: "16px 0 6px", fontSize: 13, color: "#b45309" }}>
              Doku unvollständig ({missing.length}) – fehlende FotoGIS / Protokoll / SharePoint
            </h4>
            {missing.length === 0 ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>Alle erledigten Objekte haben vollständige Doku 🎉</div>
            ) : (
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f3f4f6" }}>
                  <th style={{ textAlign: "left", padding: 4 }}>Adresse</th>
                  <th style={{ padding: 4 }}>FotoGIS</th>
                  <th style={{ padding: 4 }}>Protokoll</th>
                  <th style={{ padding: 4 }}>SharePoint</th>
                </tr></thead>
                <tbody>
                  {missing.map(i => (
                    <tr key={i.bid} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: 4 }}>{i.adresse}</td>
                      <td style={{ padding: 4, textAlign: "center" }}>{cell(i.foto, i.rawFoto)}</td>
                      <td style={{ padding: 4, textAlign: "center" }}>{cell(i.protokoll, i.rawProtokoll)}</td>
                      <td style={{ padding: 4, textAlign: "center" }}>{cell(i.sharepoint, i.rawSharepoint)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ExportMenu({
  contacts,
  callStates,
  filteredView,
}: {
  contacts: Contact[];
  callStates: Record<string, CallState>;
  filteredView?: Contact[];
}) {
  const [open, setOpen] = useState(false);
  const [onlyPriority, setOnlyPriority] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ScopeFilter>("alle");
  const [fields, setFields] = useState<FieldKey[]>(DEFAULT_FIELDS);

  const toggleField = (f: FieldKey) =>
    setFields((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...ALL_FIELDS.filter((x) => prev.includes(x) || x === f)]));

  const isAktuell = statusFilter === "aktuell";
  const baseList = onlyPriority ? contacts.filter((c) => isPriorityNvt(c.nvt)) : contacts;
  const erlCount = baseList.filter((c) => callStates[c.bid]?.status === "erledigt").length;
  const abgCount = baseList.filter((c) => callStates[c.bid]?.status === "abgelehnt").length;
  const offenCount = baseList.length - erlCount - abgCount;
  const aktuellCount = filteredView?.length ?? 0;
  const filteredCount =
    isAktuell ? aktuellCount :
    statusFilter === "alle" ? baseList.length :
    statusFilter === "erledigt" ? erlCount :
    statusFilter === "abgelehnt" ? abgCount : offenCount;

  const doExport = () => {
    if (fields.length === 0) return;
    exportHausanschluesseXlsx(contacts, callStates, onlyPriority, statusFilter, fields, filteredView);
    setOpen(false);
  };

  const radio = (val: ScopeFilter, label: string, count: number, disabled = false) => (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", padding: "4px 0", opacity: disabled ? 0.5 : 1 }}>
      <input
        type="radio"
        checked={statusFilter === val}
        onChange={() => setStatusFilter(val)}
        disabled={disabled}
      />
      {label} <span style={{ color: "#666" }}>({count})</span>
    </label>
  );

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "rgba(255,255,255,0.22)",
          color: "white",
          border: "none",
          borderRadius: 20,
          padding: "4px 12px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        ⬇ Export
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1000 }} />
          <div
            style={{
              position: "fixed",
              right: 8,
              top: 56,
              background: "white",
              color: "#111",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              width: "min(320px, calc(100vw - 16px))",
              maxHeight: "calc(100vh - 72px)",
              overflowY: "auto",
              zIndex: 1001,
            }}
          >
            <div style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, borderBottom: "1px solid #eee" }}>
              Hausanschlüsse exportieren (XLSX)
            </div>

            <div style={{ padding: "10px 12px", borderBottom: "1px solid #eee" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: isAktuell ? "not-allowed" : "pointer", opacity: isAktuell ? 0.5 : 1 }}>
                <input type="checkbox" checked={onlyPriority} disabled={isAktuell} onChange={(e) => setOnlyPriority(e.target.checked)} />
                ⭐ Nur Priorität
              </label>
            </div>

            <div style={{ padding: "10px 12px", borderBottom: "1px solid #eee" }}>
              <div style={{ fontSize: 11, color: "#666", fontWeight: 600, marginBottom: 4 }}>UMFANG</div>
              {radio("aktuell", "🔎 Aktuell gefilterte Ansicht", aktuellCount, !filteredView)}
              {radio("alle", "Beide", baseList.length)}
              {radio("offen", "Nur offene", offenCount)}
              {radio("abgelehnt", "Nur abgelehnte (Storno)", abgCount)}
              {radio("erledigt", "Nur erledigte", erlCount)}
            </div>


            <div style={{ padding: "10px 12px", borderBottom: "1px solid #eee" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>FELDER ({fields.length})</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => setFields([...ALL_FIELDS])}
                    style={{ fontSize: 11, padding: "2px 6px", border: "1px solid #ddd", background: "white", borderRadius: 4, cursor: "pointer" }}
                  >
                    Alle
                  </button>
                  <button
                    onClick={() => setFields([])}
                    style={{ fontSize: 11, padding: "2px 6px", border: "1px solid #ddd", background: "white", borderRadius: 4, cursor: "pointer" }}
                  >
                    Keine
                  </button>
                  <button
                    onClick={() => setFields([...DEFAULT_FIELDS])}
                    style={{ fontSize: 11, padding: "2px 6px", border: "1px solid #ddd", background: "white", borderRadius: 4, cursor: "pointer" }}
                  >
                    Standard
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px" }}>
                {ALL_FIELDS.map((f) => (
                  <label key={f} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={fields.includes(f)} onChange={() => toggleField(f)} />
                    {f}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ padding: 10, display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, color: "#666" }}>{filteredCount} Zeilen</div>
              <button
                onClick={doExport}
                disabled={fields.length === 0 || filteredCount === 0}
                style={{
                  background: fields.length === 0 || filteredCount === 0 ? "#ccc" : "#e20074",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: fields.length === 0 || filteredCount === 0 ? "not-allowed" : "pointer",
                }}
              >
                ⬇ Exportieren
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type TabKey = "objekte" | "karte" | "kalender" | "doku" | "dashboard" | "finanz" | "pipeline";
const TAB_TITLE: Record<TabKey, string> = {
  objekte: "🗂️ Objekte",
  karte: "🗺️ Karte",
  kalender: "📅 Kalender",
  doku: "📋 Dokumentation",
  dashboard: "🎯 Dashboard",
  finanz: "💰 Finanzen",
  pipeline: "🔗 Pipeline",
};

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Glasfaser Call-Liste · Störmer Bau" },
      {
        name: "description",
        content:
          "Mobile Call-Liste für Glasfaser-Hausanschlüsse An der Schmücke – Störmer Bau im Auftrag der Telekom.",
      },
    ],
  }),
});

// Wochentag-Codes für Slots (Mo–Sa)
const WEEK_DAYS = [
  { code: "mo", short: "Mo", dow: 1 },
  { code: "di", short: "Di", dow: 2 },
  { code: "mi", short: "Mi", dow: 3 },
  { code: "do", short: "Do", dow: 4 },
  { code: "fr", short: "Fr", dow: 5 },
  { code: "sa", short: "Sa", dow: 6 },
];

// ISO-Datum (yyyy-mm-dd) lokal, ohne UTC-Offset-Probleme
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Montag der Woche zu einem Datum
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay(); // 0=So..6=Sa
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

// Liefert die sechs Termin-Tage (Mo–Sa) der Woche, in der weekStart (Mo) liegt
function getWeekSlots(weekStart: Date) {
  return WEEK_DAYS.map(({ code, short, dow }) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + (dow - 1)); // Mo=1 → Mo=+0, ..., Sa=+5
    const iso = toIsoDate(d);
    const label = `${short} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
    return { code, day: label, date: iso, vm: `${code}-vm`, nm: `${code}-nm` };
  });
}

function relativeDayLabel(dateIso: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateIso + "T00:00:00");
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === 2) return "Übermorgen";
  return null;
}

const SLOT_LABEL: Record<string, string> = {
  "mo-vm": "Mo VM", "mo-nm": "Mo NM",
  "di-vm": "Di VM", "di-nm": "Di NM",
  "mi-vm": "Mi VM", "mi-nm": "Mi NM",
  "do-vm": "Do VM", "do-nm": "Do NM",
  "fr-vm": "Fr VM", "fr-nm": "Fr NM",
  "sa-vm": "Sa VM", "sa-nm": "Sa NM",
};

// Formatiert "di-vm" + Datum + optionale Uhrzeit → "Di 28.04. VM ab 16:30"
function fmtSlotDate(slot: string, dateIso: string | null, zeit?: string): string {
  const half = slot.endsWith("-vm") ? "VM" : slot.endsWith("-nm") ? "NM" : "";
  const z = zeit && zeit.trim() ? ` ab ${zeit.trim()}` : "";
  if (dateIso) {
    const d = new Date(dateIso + "T00:00:00");
    const wk = ["So","Mo","Di","Mi","Do","Fr","Sa"][d.getDay()];
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    return `${wk} ${dd}.${mm}. ${half}${z}`.trim();
  }
  return `${SLOT_LABEL[slot] ?? slot}${z}`;
}

// 30-Min-Slots 07:00–20:00
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 7; h <= 20; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    }
  }
  return out;
})();

type Ort = "Heldrungen" | "Oldisleben";
const NVT_ORT: Record<string, Ort> = {
  "2V8007": "Heldrungen", "2V8008": "Heldrungen", "2V8009": "Heldrungen",
  "2V8010": "Heldrungen", "2V8011": "Heldrungen", "2V8012": "Heldrungen",
  "2V8013": "Heldrungen", "2V8014": "Heldrungen", "2V8015": "Heldrungen",
  "2V8016": "Heldrungen", "2V8017": "Heldrungen", "2V8018": "Heldrungen",
  "2V8019": "Heldrungen", "2V8020": "Heldrungen", "2V8021": "Heldrungen",
  "2V8031": "Oldisleben", "2V8032": "Oldisleben", "2V8033": "Oldisleben",
  "2V8034": "Oldisleben", "2V8035": "Oldisleben", "2V8036": "Oldisleben",
  "2V8037": "Oldisleben", "2V8038": "Oldisleben", "2V8039": "Oldisleben",
  "2V8041": "Oldisleben", "2V8042": "Oldisleben", "2V8043": "Oldisleben",
};
const ortOf = (nvt: string): Ort | null => NVT_ORT[nvt] ?? null;


const STATUS_META: Record<CallStatus, { label: string; dot: string }> = {
  offen:         { label: "Offen",          dot: "#9ca3af" },
  angerufen:     { label: "Angerufen",      dot: "#facc15" },
  termin:        { label: "✅ Termin",       dot: "#3b82f6" },
  nichtErreicht: { label: "Nicht erreicht", dot: "#fb923c" },
  abgelehnt:     { label: "Abgelehnt",      dot: "#ef4444" },
  erledigt:      { label: "✓ Erledigt",     dot: "#22c55e" },
};

const cardBorder = (st: CallStatus) =>
  ({ termin: "#3b82f6", abgelehnt: "#ef4444", nichtErreicht: "#fb923c", angerufen: "#facc15", erledigt: "#22c55e", offen: "#e5e7eb" }[st]);
const cardBg = (st: CallStatus) =>
  ({ termin: "#eff6ff", abgelehnt: "#fff5f5", nichtErreicht: "#fffbf0", erledigt: "#f0fff6" } as Record<string, string>)[st] || "white";

const lastName = (name: string) => name.trim().split(/\s+/).pop() || name;

function fmtAuskundung(von: string | null, bis: string | null): string | null {
  if (!von) return null;
  try {
    const d = new Date(von);
    const datum = d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    const t1 = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    if (bis) {
      const t2 = new Date(bis).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      return `${datum} · ${t1}–${t2}`;
    }
    return `${datum} · ${t1}`;
  } catch {
    return von;
  }
}

// Erkennt manuell/extern angelegte Objekte (kein Telekom-Auftrag)
function isOhneTelekomAuftrag(bid: string): boolean {
  return /^(MAN-|manual-|TTA-)/i.test(bid) || /-MAN$/i.test(bid);
}

// "ok" = AGREED/Zugestimmt/ja; "fehlt" nur bei echten Telekom-Aufträgen mit
// Status ausstehend/pending/leer; "na" = manuelle/TTA-Objekte (kein Auftrag,
// werden separat in "Ohne Telekom-Auftrag" geführt).
function zustimmungStatus(z: string | null | undefined, bid?: string): "ok" | "fehlt" | "na" {
  const v = (z ?? "").trim().toLowerCase();
  if (v === "agreed" || v === "zugestimmt" || v === "ja") return "ok";
  if (bid && isOhneTelekomAuftrag(bid)) return "na";
  if (v === "" || v === "ausstehend" || v === "pending" || v === "initial" || v === "offen") return "fehlt";
  return "na";
}

function auskundungInfo(c: Contact): {
  required: boolean;
  done: boolean;
  status: string;
  ergebnis: string;
  plan: string | null;
} {
  return {
    required: !!c.auskundung_erforderlich,
    done: !!c.auskundung_erfolgt,
    status: c.auskundung_status ?? "",
    ergebnis: c.auskundung_ergebnis ?? "",
    plan: fmtAuskundung(c.auskundung_von, c.auskundung_bis),
  };
}

function Index() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [states, setStates] = useState<Record<string, CallState>>({});
  const [loading, setLoading] = useState(true);
  const relations = useMemo(() => buildRelationIndex(contacts), [contacts]);
  const contactByBid = useMemo(() => {
    const m: Record<string, Contact> = {};
    for (const c of contacts) m[c.bid] = c;
    return m;
  }, [contacts]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<Set<string>>(new Set());
  const [teamFilter, setTeamFilter] = useState<"alle" | "team1" | "team2" | "dokuOffen">("alle");
  const [ortSel, setOrtSel] = useState<"alle" | Ort>("alle");
  const [streetSel, setStreetSel] = useState<Set<string>>(new Set());
  const [nvtSel, setNvtSel] = useState<Set<string>>(new Set());
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<0 | 1 | 2 | 3 | "alle">("alle");
  const [streetSort, setStreetSort] = useState<"az" | "count">("az");
  const [nvtSort, setNvtSort] = useState<"az" | "count">("az");
  const [listSort, setListSort] = useState<"strasse" | "erstellt_asc" | "erstellt_desc">("strasse");
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [flash, setFlash] = useState<"saving" | "saved" | "error" | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [kalenderFocusDate, setKalenderFocusDate] = useState<string | null>(null);
  const [longPressContact, setLongPressContact] = useState<Contact | null>(null);
  const [grabenPromptFor, setGrabenPromptFor] = useState<{ contact: Contact; prev: CallState | undefined } | null>(null);
  const [dokuFocusBid, setDokuFocusBid] = useState<string | null>(null);
  const [focusBid, setFocusBid] = useState<string | null>(null);
  const [pinnedBid, setPinnedBid] = useState<string | null>(null);
  const [mapFocusBid, setMapFocusBid] = useState<string | null>(null);

  function openContactOnMap(bid: string) {
    setMapFocusBid(bid);
    setActiveTab("karte");
  }

  function openContactInDoku(bid: string) {
    setDokuFocusBid(bid);
    setActiveTab("doku");
    setExpanded(bid);
    window.setTimeout(() => {
      const el = document.getElementById(`doku-card-${bid}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  }

  function openContactInList(bid: string) {
    setFocusBid(bid);
    setExpanded(bid);
    setActiveTab("objekte");
    window.setTimeout(() => {
      const el = document.getElementById(`card-${bid}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  }
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  function startLongPress(c: Contact) {
    longPressFired.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try { navigator.vibrate(50); } catch {}
      }
      setLongPressContact(c);
    }, 500);
  }
  function cancelLongPress() {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [headerHeight, setHeaderHeight] = useState(72);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const slotDays = useMemo(() => getWeekSlots(weekStart), [weekStart]);
  const weekRangeLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 5); // Mo + 5 = Sa
    const f = (d: Date) => `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.`;
    return `${f(weekStart)} – ${f(end)}`;
  }, [weekStart]);
  const flashTimer = useRef<number | null>(null);

  // Initial load
  const [haPreis, setHaPreis] = useState<number>(390);
  // BIDs erledigter Objekte, die NICHT im Telekom GF+ Portal sind (doku_states.gf_plus = false)
  const [ohneGfPlus, setOhneGfPlus] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: cs, error: e1 }, { data: ss, error: e2 }, { data: zl }, { data: doku }] = await Promise.all([
        supabase.from("contacts").select("*").order("strasse").order("hnr"),
        supabase.from("call_states").select("*"),
        supabase.from("umsatz_ziele").select("*").eq("scope", "ha_preis").maybeSingle(),
        supabase.from("doku_states").select("bid,gf_plus").eq("gf_plus", false),
      ]);
      if (cancelled) return;
      if (e1 || e2) {
        console.error("Load error", e1 || e2);
        setLoading(false);
        return;
      }
      setContacts((cs as Contact[]) || []);
      const map: Record<string, CallState> = {};
      (ss as CallState[] | null)?.forEach((s) => (map[s.bid] = s));
      setStates(map);
      setOhneGfPlus(new Set(((doku as { bid: string }[] | null) ?? []).map((d) => d.bid)));
      const p = Number((zl as { ziel_eur?: number } | null)?.ziel_eur);
      if (isFinite(p) && p > 0) setHaPreis(p);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime: gf_plus-Set live halten
  useEffect(() => {
    const ch = supabase
      .channel("doku_states_gfplus")
      .on("postgres_changes", { event: "*", schema: "public", table: "doku_states" }, (payload) => {
        const row = (payload.new ?? payload.old) as { bid: string; gf_plus: boolean } | null;
        if (!row?.bid) return;
        setOhneGfPlus((prev) => {
          const next = new Set(prev);
          if (payload.eventType === "DELETE") next.delete(row.bid);
          else if (row.gf_plus === false) next.add(row.bid);
          else next.delete(row.bid);
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(Math.ceil(el.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // Realtime sync
  useEffect(() => {
    const ch = supabase
      .channel("call_states_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_states" }, (payload) => {
        const row = (payload.new ?? payload.old) as CallState;
        if (!row?.bid) return;
        setStates((prev) => {
          if (payload.eventType === "DELETE") {
            const { [row.bid]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [row.bid]: row };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  function showFlash(kind: "saving" | "saved" | "error") {
    setFlash(kind);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    if (kind !== "saving") {
      flashTimer.current = window.setTimeout(() => setFlash(null), 1400);
    }
  }

  
  async function patch(bid: string, changes: Partial<Pick<CallState, "status" | "termin_slot" | "notiz" | "termin_datum" | "termin_zeit" | "klarfall" | "klarfall_notiz" | "grabenlaenge" | "team" | "team_status" | "fotos_erhalten" | "protokoll_erhalten" | "priority_override" | "erledigt_datum" | "umsatz_eur" | "zusatz_eur">>) {
    const prev = states[bid];
    // Auto-Fill beim Wechsel auf "erledigt": Datum + Umsatz-Pauschale
    const becomingErledigt = changes.status === "erledigt" && prev?.status !== "erledigt";
    if (becomingErledigt) {
      if (changes.erledigt_datum === undefined) {
        changes.erledigt_datum = prev?.termin_datum || toIsoDate(new Date());
      }
      if (changes.umsatz_eur === undefined && (!prev?.umsatz_eur || prev.umsatz_eur === 0)) {
        changes.umsatz_eur = haPreis;
      }
    }
    const optimistic: CallState = {
      bid,
      status: changes.status ?? prev?.status ?? "offen",
      termin_slot: changes.termin_slot ?? prev?.termin_slot ?? "",
      termin_datum: changes.termin_datum !== undefined ? changes.termin_datum : (prev?.termin_datum ?? null),
      termin_zeit: changes.termin_zeit !== undefined ? changes.termin_zeit : (prev?.termin_zeit ?? ""),
      notiz: changes.notiz ?? prev?.notiz ?? "",
      klarfall: changes.klarfall !== undefined ? changes.klarfall : (prev?.klarfall ?? false),
      klarfall_notiz: changes.klarfall_notiz !== undefined ? changes.klarfall_notiz : (prev?.klarfall_notiz ?? ""),
      grabenlaenge: changes.grabenlaenge !== undefined ? changes.grabenlaenge : (prev?.grabenlaenge ?? 0),
      team: changes.team !== undefined ? changes.team : (prev?.team ?? ""),
      team_status: changes.team_status !== undefined ? changes.team_status : (prev?.team_status ?? ""),
      fotos_erhalten: changes.fotos_erhalten !== undefined ? changes.fotos_erhalten : (prev?.fotos_erhalten ?? false),
      protokoll_erhalten: changes.protokoll_erhalten !== undefined ? changes.protokoll_erhalten : (prev?.protokoll_erhalten ?? false),
      priority_override: changes.priority_override !== undefined ? changes.priority_override : (prev?.priority_override ?? null),
      erledigt_datum: changes.erledigt_datum !== undefined ? changes.erledigt_datum : (prev?.erledigt_datum ?? null),
      umsatz_eur: changes.umsatz_eur !== undefined ? changes.umsatz_eur : (prev?.umsatz_eur ?? 0),
      zusatz_eur: changes.zusatz_eur !== undefined ? changes.zusatz_eur : (prev?.zusatz_eur ?? 0),
      updated_at: new Date().toISOString(),
    };
    setStates((s) => ({ ...s, [bid]: optimistic }));
    showFlash("saving");
    const { error } = await supabase
      .from("call_states")
      .upsert(
        {
          bid,
          status: optimistic.status,
          termin_slot: optimistic.termin_slot,
          termin_datum: optimistic.termin_datum,
          termin_zeit: optimistic.termin_zeit,
          notiz: optimistic.notiz,
          klarfall: optimistic.klarfall,
          klarfall_notiz: optimistic.klarfall_notiz,
          grabenlaenge: optimistic.grabenlaenge,
          team: optimistic.team,
          team_status: optimistic.team_status,
          fotos_erhalten: optimistic.fotos_erhalten,
          protokoll_erhalten: optimistic.protokoll_erhalten,
          priority_override: optimistic.priority_override,
          erledigt_datum: optimistic.erledigt_datum,
          umsatz_eur: optimistic.umsatz_eur,
          zusatz_eur: optimistic.zusatz_eur,
        },
        { onConflict: "bid" }
      );
    if (error) {
      console.error("Save failed", error);
      setStates((s) => (prev ? { ...s, [bid]: prev } : Object.fromEntries(Object.entries(s).filter(([k]) => k !== bid))));
      showFlash("error");
    } else {
      showFlash("saved");
    }
  }

  async function patchContact(bid: string, changes: Partial<Pick<Contact, "anschluss_typ">>) {
    // Optimistisch aktualisieren
    setContacts((cs) => cs.map((c) => (c.bid === bid ? { ...c, ...changes } : c)));
    showFlash("saving");
    const { error } = await supabase
      .from("contacts")
      .update(changes as never)
      .eq("bid", bid);
    if (error) {
      console.error("patchContact failed", error);
      showFlash("error");
    } else {
      showFlash("saved");
    }
  }

  const ortContacts = useMemo(
    () => ortSel === "alle" ? contacts : contacts.filter((c) => ortOf(c.nvt) === ortSel),
    [contacts, ortSel]
  );

  // Wenn Ort wechselt: NVT-Auswahl bereinigen
  useEffect(() => {
    if (nvtSel.size === 0) return;
    const valid = new Set(ortContacts.map((c) => c.nvt));
    let changed = false;
    const next = new Set<string>();
    nvtSel.forEach((n) => { if (valid.has(n)) next.add(n); else changed = true; });
    if (changed) setNvtSel(next);
  }, [ortContacts, nvtSel]);

  const ortCounts = useMemo(() => {
    let h = 0, o = 0;
    contacts.forEach((c) => {
      const x = ortOf(c.nvt);
      if (x === "Heldrungen") h++;
      else if (x === "Oldisleben") o++;
    });
    return { Heldrungen: h, Oldisleben: o };
  }, [contacts]);

  const nvts = useMemo(() => {
    const counts = new Map<string, number>();
    ortContacts.forEach((c) => {
      if (!c.nvt) return;
      counts.set(c.nvt, (counts.get(c.nvt) ?? 0) + 1);
    });
    const arr = Array.from(counts.entries());
    if (nvtSort === "count") {
      arr.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"));
    } else {
      arr.sort((a, b) => a[0].localeCompare(b[0], "de"));
    }
    return arr;
  }, [ortContacts, nvtSort]);

  const streets = useMemo(() => {
    const src = nvtSel.size === 0 ? ortContacts : ortContacts.filter((c) => nvtSel.has(c.nvt));
    const counts = new Map<string, number>();
    src.forEach((c) => counts.set(c.strasse, (counts.get(c.strasse) ?? 0) + 1));
    const arr = Array.from(counts.entries());
    if (streetSort === "count") {
      arr.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"));
    } else {
      arr.sort((a, b) => a[0].localeCompare(b[0], "de"));
    }
    return arr;
  }, [ortContacts, nvtSel, streetSort]);

  // Wenn ausgewählte Straßen nicht mehr in den verfügbaren stecken (NVT geändert), bereinigen
  useEffect(() => {
    if (streetSel.size === 0) return;
    const valid = new Set(streets.map(([s]) => s));
    let changed = false;
    const next = new Set<string>();
    streetSel.forEach((s) => { if (valid.has(s)) next.add(s); else changed = true; });
    if (changed) setStreetSel(next);
  }, [streets, streetSel]);

  const filtered = useMemo(() => {
    if (focusBid) {
      const only = contacts.find((c) => c.bid === focusBid);
      return only ? [only] : [];
    }
    const q = search.trim().toLowerCase();
    const list = contacts.filter((c) => {
      const st = (states[c.bid]?.status ?? "offen") as CallStatus;
      const kf = !!states[c.bid]?.klarfall;
      // AND-Constraints (engen das Ergebnis ein, statt mit anderen Chips ODER-verknüpft zu sein)
      if (filter.has("nurGE") && !(c.ge > 0)) return false;
      if (filter.has("offen") && !(st !== "erledigt" && st !== "abgelehnt")) return false;
      const orFilters = new Set(filter);
      orFilters.delete("nurGE");
      orFilters.delete("offen");
      orFilters.delete("neuTelekom20");
      if (orFilters.size > 0) {
        let matchesAny = false;
        if (orFilters.has("klarfall") && kf) matchesAny = true;
        if (orFilters.has("dokuOffen")) {
          const cs = states[c.bid];
          const fertig = cs?.team_status === "fertig";
          const offen = !cs?.fotos_erhalten || !cs?.protokoll_erhalten;
          if (fertig && offen) matchesAny = true;
        }
        if (orFilters.has("kurzKandidat") && states[c.bid]?.kurz_kandidat) matchesAny = true;
        if (orFilters.has("kurzAnschluss") && c.anschluss_typ === "kurz") matchesAny = true;
        if (orFilters.has("langAnschluss") && c.anschluss_typ === "lang") matchesAny = true;
        if (orFilters.has("bulk") && c.auftragsquelle === "bulk") matchesAny = true;
        if (orFilters.has("termin") && st === "termin") matchesAny = true;
        if (orFilters.has("erledigt") && st === "erledigt") matchesAny = true;
        if (orFilters.has("abgelehnt") && st === "abgelehnt") matchesAny = true;
        if (orFilters.has("angerufen") && st === "angerufen") matchesAny = true;
        if (orFilters.has("nichtErreicht") && st === "nichtErreicht") matchesAny = true;
        if (orFilters.has("terminVergangen") && st === "termin") {
          const today = new Date().toISOString().slice(0, 10);
          const d = states[c.bid]?.termin_datum ?? "";
          if (d && d < today) matchesAny = true;
        }
        if (orFilters.has("ohneZustimmung") && zustimmungStatus(c.zustimmung, c.bid) === "fehlt") matchesAny = true;
        if (orFilters.has("erlOhneZustimmung") && st === "erledigt" && zustimmungStatus(c.zustimmung, c.bid) === "fehlt") matchesAny = true;
        if (orFilters.has("erlOhneAuftrag") && st === "erledigt" && ohneGfPlus.has(c.bid)) matchesAny = true;
        if (orFilters.has("imBauHeute")) {
          const today = new Date().toISOString().slice(0, 10);
          const cs = states[c.bid];
          if (cs && ((cs.termin_datum === today && !!cs.team) || cs.erledigt_datum === today)) matchesAny = true;
        }
        if (orFilters.has("auskundungErledigt") && c.auskundung_erfolgt) matchesAny = true;
        if (!matchesAny) return false;
      }
      if (teamFilter === "team1" && states[c.bid]?.team !== "team1") return false;
      if (teamFilter === "team2" && states[c.bid]?.team !== "team2") return false;
      if (teamFilter === "dokuOffen") {
        const cs2 = states[c.bid];
        const fertig2 = cs2?.team_status === "fertig";
        const offen2 = !cs2?.fotos_erhalten || !cs2?.protokoll_erhalten;
        if (!(fertig2 && offen2)) return false;
      }
      if (ortSel !== "alle" && ortOf(c.nvt) !== ortSel) return false;
      if (nvtSel.size > 0 && !nvtSel.has(c.nvt)) return false;
      if (urgentOnly && !isUrgentNvt(c.nvt)) return false;
      if (priorityOnly && !isPriorityNvt(c.nvt)) return false;
      if (priorityFilter !== "alle") {
        const effectivePrio = states[c.bid]?.priority_override ?? getNvtPriority(c.nvt);
        if (effectivePrio !== priorityFilter) return false;
      }
      if (streetSel.size > 0 && !streetSel.has(c.strasse)) return false;
      if (q.length >= 3) {
        const digits = q.replace(/\D/g, "");
        const phones = `${c.mobil} ${c.festnetz}`;
        const phoneDigits = phones.replace(/\D/g, "");
        const hay = `${c.name} ${c.strasse} ${c.hnr}${c.hnr_zusatz} ${c.hnr} ${c.hnr_zusatz} ${c.nvt} ${phones}`.toLowerCase();
        const matchesText = hay.includes(q);
        const matchesPhone = digits.length >= 3 && phoneDigits.includes(digits);
        if (!matchesText && !matchesPhone) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      // Filter "neuTelekom20": nach Erstellungsdatum absteigend
      if (filter.has("neuTelekom20")) {
        const da = (a.auftrag_erstellt_am ?? "").toString();
        const db = (b.auftrag_erstellt_am ?? "").toString();
        if (da !== db) return db.localeCompare(da);
        return 0;
      }
      // Bei Filter "Termin": nach Termin-Datum sortieren, jüngste zuerst
      if (filter.size === 1 && filter.has("termin")) {
        const da = states[a.bid]?.termin_datum ?? "";
        const db = states[b.bid]?.termin_datum ?? "";
        // leere Daten ans Ende
        if (da && !db) return -1;
        if (!da && db) return 1;
        if (da !== db) return db.localeCompare(da); // desc
        const za = states[a.bid]?.termin_zeit ?? "";
        const zb = states[b.bid]?.termin_zeit ?? "";
        if (za !== zb) return zb.localeCompare(za);
      }
      if (listSort === "erstellt_asc") {
        const da = (a.auftrag_erstellt_am ?? "").toString();
        const db = (b.auftrag_erstellt_am ?? "").toString();
        if (da !== db) return da.localeCompare(db);
      }
      if (listSort === "erstellt_desc") {
        const da = (a.auftrag_erstellt_am ?? "").toString();
        const db = (b.auftrag_erstellt_am ?? "").toString();
        if (da !== db) return db.localeCompare(da);
      }
      // Stabil nach Straße / HNR / Zusatz — kein Pin nach oben beim Anrufen
      const s = a.strasse.localeCompare(b.strasse, "de");
      if (s !== 0) return s;
      const na = parseInt(a.hnr, 10);
      const nb = parseInt(b.hnr, 10);
      const ai = Number.isNaN(na) ? Number.MAX_SAFE_INTEGER : na;
      const bi = Number.isNaN(nb) ? Number.MAX_SAFE_INTEGER : nb;
      if (ai !== bi) return ai - bi;
      return (a.hnr_zusatz ?? "").localeCompare(b.hnr_zusatz ?? "", "de");
    }).slice(0, filter.has("neuTelekom20") ? 20 : Infinity);
  }, [contacts, states, filter, teamFilter, ortSel, nvtSel, streetSel, search, priorityOnly, urgentOnly, priorityFilter, focusBid, pinnedBid, listSort]);

  const appointments = useMemo(() => {
    const slotOrder = ["mo-vm","mo-nm","di-vm","di-nm","mi-vm","mi-nm","do-vm","do-nm","fr-vm","fr-nm","sa-vm","sa-nm"];
    return contacts
      .filter((c) => (states[c.bid]?.status ?? "offen") === "termin")
      .sort((a, b) => {
        const da = states[a.bid]?.termin_datum ?? "9999-12-31";
        const db = states[b.bid]?.termin_datum ?? "9999-12-31";
        if (da !== db) return da.localeCompare(db);
        const sa = states[a.bid]?.termin_slot ?? "";
        const sb = states[b.bid]?.termin_slot ?? "";
        const ia = slotOrder.indexOf(sa); const ib = slotOrder.indexOf(sb);
        if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        const s = a.strasse.localeCompare(b.strasse, "de");
        if (s !== 0) return s;
        return (parseInt(a.hnr,10)||0) - (parseInt(b.hnr,10)||0);
      });
  }, [contacts, states]);

  function shareAppointmentsWhatsApp() {
    // Nur künftige Termine ab heute (basierend auf konkretem Datum)
    const todayIso = toIsoDate(new Date());
    const futureAppts = appointments.filter((c) => {
      const d = states[c.bid]?.termin_datum;
      return !!d && d >= todayIso;
    });

    if (futureAppts.length === 0) {
      alert("Keine künftigen Termine.");
      return;
    }
    const lines: string[] = [];
    lines.push("📅 *Glasfaser-Termine · An der Schmücke*");
    lines.push("_Störmer Bau i.A. Telekom_");
    lines.push("");

    // Gruppiert nach Datum + Slot + Zeit
    const grouped: Record<string, Contact[]> = {};
    futureAppts.forEach((c) => {
      const cs = states[c.bid];
      const key = `${cs?.termin_datum ?? ""}|${cs?.termin_slot ?? ""}|${cs?.termin_zeit ?? ""}`;
      (grouped[key] = grouped[key] || []).push(c);
    });

    Object.keys(grouped).sort().forEach((key) => {
      const [date, slot, zeit] = key.split("|");
      lines.push(`🗓 *${fmtSlotDate(slot, date || null, zeit)}*`);
      grouped[key].forEach((c) => {
        const cs = states[c.bid];
        lines.push(`• *${c.strasse} ${c.hnr}${c.hnr_zusatz}* — ${c.name}`);
        const meta = [c.typ, c.we ? `${c.we} WE` : "", c.ge ? `${c.ge} GE` : ""].filter(Boolean).join(" · ");
        if (meta) lines.push(`  🏠 ${meta}`);
        lines.push(`  📍 ${c.plz} ${c.ort}`);
        if (c.mobil) lines.push(`  📱 ${c.mobil}`);
        if (c.festnetz && c.festnetz !== c.mobil) lines.push(`  ☎️ ${c.festnetz}`);
        if (c.nvt?.trim()) lines.push(`  🔌 NVT: ${c.nvt.trim()}`);
        const auskInfo = fmtAuskundung(c.auskundung_von, c.auskundung_bis);
        if (auskInfo) lines.push(`  🔍 Auskundung: ${auskInfo}`);
        if (cs?.notiz?.trim()) lines.push(`  📝 ${cs.notiz.trim()}`);
        lines.push("");
      });
    });

    lines.push(`_Gesamt: ${futureAppts.length} Termin${futureAppts.length === 1 ? "" : "e"} (ab heute)_`);

    const text = lines.join("\n");
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  function shareSingleCustomer(c: Contact) {
    const cs = states[c.bid];
    const slot = cs?.termin_slot ?? "";
    const slotLabel = slot ? fmtSlotDate(slot, cs?.termin_datum ?? null, cs?.termin_zeit) : "—";
    const lines = [
      `Guten Tag Herr/Frau ${lastName(c.name)},`,
      ``,
      `vielen Dank für das nette Telefonat. Hiermit bestätigen wir Ihren Termin für den Glasfaser-Hausanschluss:`,
      ``,
      `📅 *Termin:* ${slotLabel}`,
      `📍 *Adresse:* ${c.strasse} ${c.hnr}${c.hnr_zusatz}, ${c.plz} ${c.ort}`,
      ``,
      `Vormittagstermine ab 7:30 Uhr · Nachmittagstermine ab 13:00 Uhr.`,
      `Bitte sorgen Sie dafür, dass eine erwachsene Person zu Hause ist und der Hauseingang sowie ggf. der Keller zugänglich sind.`,
      ``,
      `Bei Fragen oder Änderungen melden Sie sich gerne kurz zurück.`,
      ``,
      `Mit freundlichen Grüßen`,
      `Störmer Bau – im Auftrag der Telekom`,
    ];
    const text = lines.join("\n");
    const phone = (c.mobil || c.festnetz || "").replace(/[^\d+]/g, "");
    const url = phone
      ? `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  function shareSingleInternal(c: Contact) {
    const cs = states[c.bid];
    const slot = cs?.termin_slot ?? "";
    const slotLabel = slot ? fmtSlotDate(slot, cs?.termin_datum ?? null, cs?.termin_zeit) : "—";
    const meta = [c.typ, c.we ? `${c.we} WE` : "", c.ge ? `${c.ge} GE` : ""].filter(Boolean).join(" · ");
    const lines: string[] = [];
    lines.push(`📅 *Neuer Termin · Hausanschluss*`);
    lines.push("");
    lines.push(`🗓 *${slotLabel}*`);
    lines.push("");
    lines.push(`📍 *${c.strasse} ${c.hnr}${c.hnr_zusatz},`);
    lines.push(`${c.plz} ${c.ort}*`);
    lines.push("");
    if (c.name?.trim()) lines.push(`👤 ${c.name.trim()}`);
    if (meta) lines.push(`🏠 ${meta}`);
    if (c.nvt?.trim()) lines.push(`🔌 NVT: ${c.nvt.trim()}`);
    if (c.mobil) lines.push(`📱 ${c.mobil}`);
    if (c.festnetz && c.festnetz !== c.mobil) lines.push(`☎️ ${c.festnetz}`);
    const auskInfo = fmtAuskundung(c.auskundung_von, c.auskundung_bis);
    if (auskInfo) lines.push(`🔍 Auskundung: ${auskInfo}`);
    if (cs?.notiz?.trim()) lines.push(`📝 ${cs.notiz.trim()}`);
    const text = lines.join("\n");
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  const counts = useMemo(() => {
    const c: Record<CallStatus, number> = {
      offen: 0, angerufen: 0, termin: 0, nichtErreicht: 0, abgelehnt: 0, erledigt: 0,
    };
    contacts.forEach((x) => {
      const st = (states[x.bid]?.status ?? "offen") as CallStatus;
      c[st]++;
    });
    return c;
  }, [contacts, states]);

  const klarfallCount = useMemo(
    () => contacts.reduce((n, c) => n + (states[c.bid]?.klarfall ? 1 : 0), 0),
    [contacts, states],
  );

  const terminVergangenCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return contacts.reduce((n, c) => {
      const cs = states[c.bid];
      if (!cs || cs.status !== "termin") return n;
      const d = cs.termin_datum ?? "";
      return n + (d && d < today ? 1 : 0);
    }, 0);
  }, [contacts, states]);
  const kurzKandidatCount = useMemo(
    () => contacts.reduce((n, c) => n + (states[c.bid]?.kurz_kandidat ? 1 : 0), 0),
    [contacts, states],
  );

  const kurzAnschlussCount = useMemo(
    () => contacts.reduce((n, c) => n + (c.anschluss_typ === "kurz" ? 1 : 0), 0),
    [contacts],
  );
  const langAnschlussCount = useMemo(
    () => contacts.reduce((n, c) => n + (c.anschluss_typ === "lang" ? 1 : 0), 0),
    [contacts],
  );
  const bulkCount = useMemo(
    () => contacts.reduce((n, c) => n + (c.auftragsquelle === "bulk" ? 1 : 0), 0),
    [contacts],
  );
  const bulkStats = useMemo(() => {
    const bulkBids = contacts.filter(c => c.auftragsquelle === "bulk").map(c => c.bid);
    let erledigt = 0, termin = 0, offen = 0, abgelehnt = 0;
    for (const bid of bulkBids) {
      const s = states[bid];
      const st = s?.status ?? "offen";
      if (st === "erledigt") erledigt++;
      else if (st === "termin") termin++;
      else if (st === "abgelehnt") abgelehnt++;
      else offen++;
    }
    const total = bulkBids.length;
    return { total, erledigt, termin, offen, abgelehnt, pct: total > 0 ? Math.round((erledigt / total) * 100) : 0 };
  }, [contacts, states]);



  const ohneZustimmungCount = useMemo(
    () => contacts.reduce((n, c) => n + (zustimmungStatus(c.zustimmung, c.bid) === "fehlt" ? 1 : 0), 0),
    [contacts],
  );

  const gewerbeCount = useMemo(
    () => contacts.reduce((n, c) => n + (c.ge > 0 ? 1 : 0), 0),
    [contacts],
  );

  const auskundungErledigtCount = useMemo(
    () => contacts.reduce((n, c) => n + (c.auskundung_erfolgt ? 1 : 0), 0),
    [contacts],
  );

  const erlOhneZustimmungCount = useMemo(
    () => contacts.reduce((n, c) => {
      const st = states[c.bid]?.status;
      if (st !== "erledigt") return n;
      return n + (zustimmungStatus(c.zustimmung, c.bid) === "fehlt" ? 1 : 0);
    }, 0),
    [contacts, states],
  );

  const erlOhneAuftragCount = useMemo(
    () => contacts.reduce((n, c) => {
      const st = states[c.bid]?.status;
      if (st !== "erledigt") return n;
      return n + (ohneGfPlus.has(c.bid) ? 1 : 0);
    }, 0),
    [contacts, states, ohneGfPlus],
  );

  const imBauHeuteCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return contacts.reduce((n, c) => {
      const cs = states[c.bid];
      if (!cs) return n;
      const bautHeute = (cs.termin_datum === today && !!cs.team) || cs.erledigt_datum === today;
      return n + (bautHeute ? 1 : 0);
    }, 0);
  }, [contacts, states]);


  return (
    <div style={{ fontFamily: "system-ui,-apple-system,sans-serif", maxWidth: 480, margin: "0 auto", background: "#f2f2f7", minHeight: "100dvh", paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box" }}>
      {/* HEADER */}
      <div ref={headerRef} style={{ background: "#e20074", color: "white", padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ fontSize: 11, opacity: 0.75, letterSpacing: 0.3 }}>An der Schmücke · Glasfaser · Störmer Bau · ☁️ Cloud-Sync</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{TAB_TITLE[activeTab]}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {flash === "saving" && <span style={{ fontSize: 11, background: "rgba(255,255,255,0.22)", borderRadius: 8, padding: "2px 8px" }}>⏳ Speichern…</span>}
            {flash === "saved" && <span style={{ fontSize: 11, background: "rgba(255,255,255,0.22)", borderRadius: 8, padding: "2px 8px" }}>☁️ gespeichert</span>}
            {flash === "error" && <span style={{ fontSize: 11, background: "#dc2626", borderRadius: 8, padding: "2px 8px" }}>⚠️ Fehler</span>}
            <a href="/calls" title="Kurz-Objekte abtelefonieren" style={{ fontSize: 11, background: "rgba(255,255,255,0.22)", borderRadius: 8, padding: "4px 8px", color: "white", textDecoration: "none" }}>📞 Kurz</a>
            <a href="/admin" title="Admin / Import" style={{ fontSize: 11, background: "rgba(255,255,255,0.22)", borderRadius: 8, padding: "4px 8px", color: "white", textDecoration: "none" }}>⚙️</a>
            <ImportButton />
            <ExportMenu contacts={contacts} callStates={states} filteredView={filtered} />

          </div>
        </div>
      </div>

      {activeTab === "karte" && (
        <div style={{ position: "relative", height: `calc(100dvh - ${headerHeight}px - 56px - env(safe-area-inset-bottom, 0px))`, minHeight: 240 }}>
          <KarteTab
            contacts={contacts}
            states={states}
            onOpenContact={openContactInList}
            focusBid={mapFocusBid}
            onFocusConsumed={() => setMapFocusBid(null)}
            relations={relations}
          />
        </div>
      )}

      {activeTab === "kalender" && (
        <KalenderTab
          contacts={contacts}
          states={states}
          onOpenContact={openContactInList}
          onPatchTime={(bid, time) => patch(bid, { termin_zeit: time })}
          patch={patch}
          onSwitchToDoku={openContactInDoku}
          onShowOnMap={openContactOnMap}
          focusDate={kalenderFocusDate}
          onClearFocusDate={() => setKalenderFocusDate(null)}
        />
      )}

      {activeTab === "doku" && (
        <DokuTab
          contacts={contacts}
          callStates={states}
          focusBid={dokuFocusBid}
          onClearFocus={() => setDokuFocusBid(null)}
        />
      )}

      {activeTab === "dashboard" && (
        <>
        {bulkStats.total > 0 && (
          <div style={{
            margin: "10px 12px 0", padding: 12, borderRadius: 12,
            background: "linear-gradient(135deg,#fef3c7,#fde68a)",
            border: "1px solid #f59e0b",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#78350f" }}>
                📦 Telekom Bulk-Aufträge
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                {bulkStats.erledigt} / {bulkStats.total} erledigt ({bulkStats.pct}%)
              </div>
            </div>
            <div style={{
              height: 10, borderRadius: 999, background: "rgba(255,255,255,0.6)",
              overflow: "hidden", display: "flex",
            }}>
              {bulkStats.total > 0 && <>
                <div style={{ width: `${(bulkStats.erledigt / bulkStats.total) * 100}%`, background: "#16a34a" }} title={`${bulkStats.erledigt} erledigt`} />
                <div style={{ width: `${(bulkStats.termin / bulkStats.total) * 100}%`, background: "#3b82f6" }} title={`${bulkStats.termin} Termin`} />
                <div style={{ width: `${(bulkStats.abgelehnt / bulkStats.total) * 100}%`, background: "#ef4444" }} title={`${bulkStats.abgelehnt} abgelehnt`} />
              </>}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11, color: "#78350f", flexWrap: "wrap" }}>
              <span>✅ {bulkStats.erledigt} erledigt</span>
              <span>📅 {bulkStats.termin} Termin</span>
              <span>⏳ {bulkStats.offen} offen</span>
              {bulkStats.abgelehnt > 0 && <span>❌ {bulkStats.abgelehnt} abgelehnt</span>}
              <button
                onClick={() => { setFilter(new Set()); /* orFilters */ setActiveTab("objekte"); }}
                style={{
                  marginLeft: "auto", padding: "3px 10px", borderRadius: 999,
                  border: "1px solid #b45309", background: "white", color: "#92400e",
                  fontWeight: 700, fontSize: 11, cursor: "pointer",
                }}
              >Alle anzeigen →</button>
            </div>
          </div>
        )}
        <NvtTab
          contacts={contacts}
          states={states}
          onOpenKlarfaelle={() => { setFilter(new Set(["klarfall"])); setActiveTab("objekte"); }}
          onOpenAuskundungHeute={() => { setActiveTab("objekte"); }}
          onOpenTeamDokuOffen={() => { setFilter(new Set(["dokuOffen"])); setActiveTab("objekte"); }}
          onOpenDoku={() => { setActiveTab("doku"); }}
          onOpenNeuTelekom20={() => { setFilter(new Set(["neuTelekom20"])); setActiveTab("objekte"); }}
          onOpenContact={(bid) => openContactInList(bid)}

          onTeamAction={(team, action) => {
            setTeamFilter(team);
            if (action === "auftraege") { setFilter(new Set()); setActiveTab("objekte"); }
            else if (action === "karte") { setActiveTab("karte"); }
            else if (action === "doku") { setFilter(new Set(["dokuOffen"])); setActiveTab("objekte"); }
          }}
          onPickKalenderDate={(dateISO) => { setKalenderFocusDate(dateISO); setActiveTab("kalender"); }}
          onOpenPlan={() => setShowPlan(true)}
        />
      )}

      {activeTab === "finanz" && <FinanzTab />}

      {activeTab === "pipeline" && <PipelineTab contacts={contacts} states={states} />}

      {activeTab === "objekte" && (<>
      {/* SEARCH + FILTER */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ position: "relative", width: "100%" }}>
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Mind. 3 Zeichen suchen…"
            style={{
              fontSize: "16px", // prevents iOS zoom - DO NOT change this
              width: "100%",
              borderRadius: 8,
              border: "1px solid #ddd",
              padding: "8px 36px 8px 10px",
              boxSizing: "border-box",
            }}
          />
          {search && (
            <button
              type="button"
              aria-label="Suche löschen"
              onClick={() => {
                setSearch("");
                searchInputRef.current?.blur();
              }}
              style={{
                position: "absolute",
                top: "50%",
                right: 6,
                transform: "translateY(-50%)",
                width: 26,
                height: 26,
                borderRadius: 999,
                border: "none",
                background: "#e5e7eb",
                color: "#475569",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
          <button
            onClick={() => setListSort((s) => s === "strasse" ? "erstellt_desc" : s === "erstellt_desc" ? "erstellt_asc" : "strasse")}
            title="Sortierung umschalten"
            style={sortBtn()}
          >{listSort === "strasse" ? "📍 Straße" : listSort === "erstellt_desc" ? "📅 Erstellt ↓" : "📅 Erstellt ↑"}</button>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
          {(["alle", "Heldrungen", "Oldisleben"] as const).map((o) => {
            const active = ortSel === o;
            const label = o === "alle"
              ? `Alle Orte (${ortCounts.Heldrungen + ortCounts.Oldisleben})`
              : `${o} (${ortCounts[o]})`;
            return (
              <button key={o} onClick={() => setOrtSel(o)} style={chip(active, "#7c3aed")}>
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
          <button
            onClick={() => setNvtSort((s) => (s === "az" ? "count" : "az"))}
            title="Sortierung umschalten"
            style={sortBtn()}
          >{nvtSort === "az" ? "A–Z" : "▦ Anzahl"}</button>
          <button
            onClick={() => { setUrgentOnly((v) => !v); if (!urgentOnly) setPriorityOnly(false); }}
            title="Nur höchste Priorität (2V8031–2V8034)"
            style={chip(urgentOnly, "#dc2626")}
          >🔴 Höchste Prio</button>
          <button
            onClick={() => { setPriorityOnly((v) => !v); if (!priorityOnly) setUrgentOnly(false); }}
            title="Alle Priorität-NVTs"
            style={chip(priorityOnly, "#f97316")}
          >🔥 Priorität</button>
          <button
            onClick={() => { setNvtSel(new Set()); setPriorityOnly(false); setUrgentOnly(false); }}
            style={chip(nvtSel.size === 0 && !priorityOnly && !urgentOnly, "#0891b2")}
          >Alle NVTs</button>
          {nvts.map(([n, count]) => {
            const urgent = isUrgentNvt(n);
            const prio = isPriorityNvt(n);
            return (
              <button
                key={n}
                onClick={() => setNvtSel((prev) => {
                  const next = new Set(prev);
                  if (next.has(n)) next.delete(n); else next.add(n);
                  return next;
                })}
                style={chip(nvtSel.has(n), urgent ? "#dc2626" : prio ? "#f97316" : "#0891b2")}
              >{urgent ? "🔴 " : prio ? "🔥 " : ""}{n} <span style={{ opacity: 0.7, fontWeight: 500 }}>({count})</span></button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
          <button
            onClick={() => setStreetSort((s) => (s === "az" ? "count" : "az"))}
            title="Sortierung umschalten"
            style={sortBtn()}
          >{streetSort === "az" ? "A–Z" : "▦ Anzahl"}</button>
          <button
            onClick={() => setStreetSel(new Set())}
            style={chip(streetSel.size === 0, "#e20074")}
          >Alle Straßen</button>
          {streets.map(([s, count]) => (
            <button
              key={s}
              onClick={() => setStreetSel((prev) => {
                const next = new Set(prev);
                if (next.has(s)) next.delete(s); else next.add(s);
                return next;
              })}
              style={chip(streetSel.has(s), "#e20074")}
            >{s} <span style={{ opacity: 0.7, fontWeight: 500 }}>({count})</span></button>
          ))}
        </div>
        {/* Priorität-Filter */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
          {([
            { val: "alle" as const, label: "Alle Prio" },
            { val: 3 as const, label: "⭐⭐⭐" },
            { val: 2 as const, label: "⭐⭐" },
            { val: 1 as const, label: "⭐" },
            { val: 0 as const, label: "Keine" },
          ]).map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setPriorityFilter(val)}
              style={{
                padding: "6px 12px", borderRadius: 999, whiteSpace: "nowrap",
                border: `1px solid ${priorityFilter === val ? "#d97706" : "#e5e7eb"}`,
                background: priorityFilter === val ? "#d97706" : "#fff",
                color: priorityFilter === val ? "#fff" : "#475569",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
          {(["alle", "offen", "termin", "terminVergangen", "erledigt", "abgelehnt", "klarfall", "kurzKandidat", "kurzAnschluss", "langAnschluss", "bulk", "angerufen", "nichtErreicht", "ohneZustimmung", "erlOhneZustimmung", "erlOhneAuftrag", "imBauHeute", "nurGE", "auskundungErledigt"] as const).map((f) => {
            const secondary = f === "klarfall" || f === "kurzKandidat" || f === "kurzAnschluss" || f === "langAnschluss" || f === "bulk" || f === "angerufen" || f === "nichtErreicht" || f === "terminVergangen" || f === "ohneZustimmung" || f === "erlOhneZustimmung" || f === "erlOhneAuftrag" || f === "imBauHeute" || f === "nurGE" || f === "auskundungErledigt";
            const isActive = f === "alle" ? filter.size === 0 : filter.has(f);
            const baseStyle = (f === "klarfall" || f === "terminVergangen") ? klarfallPill(isActive) : pill(isActive);
            const style = secondary
              ? { ...baseStyle, fontSize: 11, borderColor: isActive ? (baseStyle as React.CSSProperties).borderColor : "#e5e7eb" }
              : baseStyle;
            const label =
              f === "alle" ? "Alle"
              : f === "klarfall" ? `⚠️ Klärfall (${klarfallCount})`
              : f === "kurzKandidat" ? `📞 Kurz (${kurzKandidatCount})`
              : f === "kurzAnschluss" ? `🟢 Kurz <10m (${kurzAnschlussCount})`
              : f === "langAnschluss" ? `🟠 Lang ≥10m (${langAnschlussCount})`
              : f === "bulk" ? `📦 Bulk (${bulkCount})`
              : f === "terminVergangen" ? `⏰ Überfällig (${terminVergangenCount})`
              : f === "ohneZustimmung" ? `🚫 Ohne Zustimmung (${ohneZustimmungCount})`
              : f === "nurGE" ? `🏢 GE (${gewerbeCount})`
              : f === "auskundungErledigt" ? `✓ Auskundung erledigt (${auskundungErledigtCount})`
              : f === "erlOhneZustimmung" ? `📝 Erl. ohne Zustimmung (${erlOhneZustimmungCount})`
              : f === "erlOhneAuftrag" ? `📄 Erl. ohne Auftrag (${erlOhneAuftragCount})`
              : f === "imBauHeute" ? `🚧 Im Bau heute (${imBauHeuteCount})`
              : f === "offen" ? "Ausstehend"
              : f === "termin" ? `✅ ${STATUS_META.termin.label}`
              : f === "erledigt" ? `✓ ${STATUS_META.erledigt.label}`
              : STATUS_META[f as CallStatus].label;
            return (
              <button key={f} onClick={() => {
                if (f === "alle") {
                  setFilter(new Set());
                } else {
                  setFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(f)) next.delete(f); else next.add(f);
                    return next;
                  });
                }
              }} style={style}>{label}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
          {([
            { k: "alle", label: "Alle Teams", color: "#64748b" },
            { k: "team1", label: "👷 Team Jozey", color: "#3b82f6" },
            { k: "team2", label: "👷 Team Adil", color: "#7c3aed" },
            { k: "dokuOffen", label: "⚠️ Doku ausstehend", color: "#f59e0b" },
          ] as const).map((tf) => {
            const active = teamFilter === tf.k;
            return (
              <button
                key={tf.k}
                onClick={() => setTeamFilter(tf.k)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${active ? tf.color : "#e5e7eb"}`,
                  background: active ? tf.color : "#fff",
                  color: active ? "#fff" : "#475569",
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >{tf.label}</button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setFilter(new Set());
              setTeamFilter("alle");
              setOrtSel("alle");
              setStreetSel(new Set());
              setNvtSel(new Set());
              setPriorityOnly(false);
              setUrgentOnly(false);
              setPriorityFilter("alle");
              setSearch("");
            }}
            title="Alle Filter zurücksetzen"
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #ef4444",
              background: "#fff",
              color: "#dc2626",
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: "nowrap",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >↺ Reset</button>
        </div>
      </div>

      {focusBid && (
        <div style={{ margin: "8px 12px 4px", padding: "8px 12px", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#78350f", fontWeight: 600 }}>🔍 Nur 1 Objekt angezeigt</span>
          <button
            onClick={() => setFocusBid(null)}
            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #f59e0b", background: "#fff", color: "#92400e", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >Filter aufheben</button>
        </div>
      )}

      <div style={{ padding: "6px 14px 2px", fontSize: 11, color: "#aaa", display: "flex", justifyContent: "space-between" }}>
        <span>{filtered.length} von {contacts.length} Objekten</span>
        {!loading && <span>{counts.angerufen + counts.termin + counts.nichtErreicht + counts.abgelehnt + counts.erledigt} bearbeitet</span>}
      </div>

      {loading && <div style={{ padding: 24, textAlign: "center", color: "#888" }}>Lade Daten aus der Cloud…</div>}

      {/* CARDS */}
      <div style={{ padding: "2px 10px 100px" }}>
        {filtered.map((c) => {
          const cs = states[c.bid];
          const st = (cs?.status ?? "offen") as CallStatus;
          const appt = cs?.termin_slot ?? "";
          const apptDate = cs?.termin_datum ?? null;
          const note = cs?.notiz ?? "";
          const open = expanded === c.bid;
          const kf = !!cs?.klarfall;
          return (
            <div key={c.bid} id={`card-${c.bid}`} style={{
              background: kf ? "#fffbeb" : cardBg(st),
              borderRadius: 11,
              marginBottom: 8,
              border: kf ? "2px solid #f59e0b" : `2px solid ${cardBorder(st)}`,
              boxShadow: open ? "0 6px 20px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.07)",
              overflow: "hidden",
              position: "relative",
            }}>
              {kf && (<div style={{ position: "absolute", top: 4, right: 22, fontSize: 14, zIndex: 1 }} title="Klärfall">⚠️</div>)}
              <div
                onClick={(e) => {
                  if (longPressFired.current) { longPressFired.current = false; return; }
                  const willOpen = !open;
                  setExpanded(open ? null : c.bid);
                  if (willOpen) {
                    const cardEl = e.currentTarget.parentElement as HTMLElement | null;
                    const topBefore = cardEl?.getBoundingClientRect().top ?? 0;
                    window.setTimeout(() => {
                      if (!cardEl) return;
                      const topAfter = cardEl.getBoundingClientRect().top;
                      window.scrollBy({ top: topAfter - topBefore, behavior: "auto" });
                    }, 0);
                  }
                }}
                onTouchStart={() => startLongPress(c)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                onTouchCancel={cancelLongPress}
                onMouseDown={() => startLongPress(c)}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
                <div style={{ width: 11, height: 11, borderRadius: "50%", flexShrink: 0, background: STATUS_META[st].dot }} />
                {(() => {
                  const prio = (cs?.priority_override ?? getNvtPriority(c.nvt)) as PriorityLevel;
                  const stars = priorityStars(prio);
                  return stars ? (
                    <span style={{ fontSize: 10, color: "#d97706", fontWeight: 700, flexShrink: 0 }}>{stars}</span>
                  ) : null;
                })()}
                {cs?.team && (
                  <div style={{
                    flexShrink: 0, padding: "2px 6px", borderRadius: 6, fontSize: 10, fontWeight: 800, color: "white",
                    background: cs.team === "team1" ? "#3b82f6" : cs.team === "team2" ? "#7c3aed" : "#94a3b8",
                  }}>{cs.team === "team1" ? "TH" : cs.team === "team2" ? "TA" : "T"}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                    <span>{c.strasse} {c.hnr}{c.hnr_zusatz}</span>
                    {c.auftragsquelle === "bulk" && (
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                        padding: "2px 7px", borderRadius: 999,
                        background: "#fef3c7", color: "#92400e", textTransform: "uppercase",
                      }}>
                        Bulk
                      </span>
                    )}
                    <span style={{ fontWeight: 400, fontSize: 12, color: "#888" }}>
                      {c.typ}{c.we ? ` · ${c.we} WE` : ""}{c.ge ? ` · ${c.ge} GE` : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#444", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                    {c.nvt && <span style={{ color: "#9ca3af", fontWeight: 500, marginLeft: 6, fontSize: 11 }}>· {c.nvt}{ortOf(c.nvt) ? ` · ${ortOf(c.nvt)}` : ""}{c.auftrag_erstellt_am ? ` · 📅 ${new Date(c.auftrag_erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}` : ""}</span>}
                  </div>
                  {cs?.team && cs?.team_status && (
                    <div style={{ fontSize: 11, color: cs.team === "team1" ? "#3b82f6" : "#7c3aed", fontWeight: 700, marginTop: 2 }}>
                      👷 {cs.team === "team1" ? "Team Jozey" : "Team Adil"} · {cs.team_status === "zugewiesen" ? "Zugewiesen" : cs.team_status === "in_arbeit" ? "In Arbeit" : "Fertig"}
                    </div>
                  )}
                  {appt && <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 700, marginTop: 2 }}>🗓 {fmtSlotDate(appt, apptDate, cs?.termin_zeit)}</div>}
                  {(() => {
                    const zSt = zustimmungStatus(c.zustimmung, c.bid);
                    const ai = auskundungInfo(c);
                    return (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        {zSt === "fehlt" && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: "white", background: "#dc2626", padding: "2px 7px", borderRadius: 6, letterSpacing: 0.3 }}>
                            ⚠ KEINE ZUSTIMMUNG
                          </span>
                        )}
                        {ai.required && !ai.done && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: "white", background: "#ea580c", padding: "2px 7px", borderRadius: 6, letterSpacing: 0.3 }}>
                            🔍 AUSKUNDUNG NÖTIG{ai.plan ? ` · ${ai.plan}` : ""}
                          </span>
                        )}
                        {ai.required && ai.done && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#065f46", background: "#d1fae5", padding: "2px 7px", borderRadius: 6 }}>
                            ✓ Auskundung erfolgt
                          </span>
                        )}
                        {!ai.required && ai.plan && (
                          <span style={{ fontSize: 11, color: "#0891b2", fontWeight: 700 }}>🔍 Auskundung: {ai.plan}</span>
                        )}
                        {c.anschluss_typ === "kurz" && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: "white", background: "#16a34a", padding: "2px 7px", borderRadius: 6, letterSpacing: 0.3 }}>
                            🟢 KURZ &lt;10m
                          </span>
                        )}
                        {c.anschluss_typ === "lang" && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: "white", background: "#ea580c", padding: "2px 7px", borderRadius: 6, letterSpacing: 0.3 }}>
                            🟠 LANG ≥10m
                          </span>
                        )}
                      </div>
                    );
                  })()}

                </div>
                {relations[c.bid]?.length ? (
                  <div
                    onClick={(e) => { e.stopPropagation(); setExpanded(c.bid); }}
                    title={`${relations[c.bid].length} verknüpfte(s) Objekt(e)`}
                    style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed", background: "#ede9fe", padding: "3px 7px", borderRadius: 8, whiteSpace: "nowrap" }}
                  >🔗 {relations[c.bid].length}</div>
                ) : null}
                <div style={{ color: "#bbb", fontSize: 14 }}>{open ? "▲" : "▼"}</div>
              </div>

              {open && (
                <div style={{ borderTop: "1px solid #eee", padding: "12px 12px 14px" }}>
                  {relations[c.bid]?.length ? (
                    <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: "#6d28d9", letterSpacing: 1, marginBottom: 6 }}>
                        🔗 VERKNÜPFTE OBJEKTE ({relations[c.bid].length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {relations[c.bid].map((rel) => {
                          const rc = contactByBid[rel.bid];
                          if (!rc) return null;
                          const rst = (states[rel.bid]?.status ?? "offen") as CallStatus;
                          return (
                            <button
                              key={rel.bid}
                              onClick={(e) => { e.stopPropagation(); openContactInList(rel.bid); }}
                              style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", textAlign: "left", cursor: "pointer", width: "100%" }}
                            >
                              <span style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_META[rst].dot, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {rc.strasse} {rc.hnr}{rc.hnr_zusatz}
                                  <span style={{ fontWeight: 400, color: "#64748b", marginLeft: 6, fontSize: 11 }}>{rc.typ}</span>
                                </div>
                                <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rc.name}</div>
                              </div>
                              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                                {rel.reasons.map((r) => (
                                  <span key={r} style={{ fontSize: 9, fontWeight: 800, color: "#6d28d9", background: "#ede9fe", padding: "2px 5px", borderRadius: 4, letterSpacing: 0.3 }}>{REASON_LABEL[r]}</span>
                                ))}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <StreetViewImage
                    strasse={c.strasse}
                    hnr={c.hnr}
                    hnr_zusatz={c.hnr_zusatz}
                    plz={c.plz}
                    ort={c.ort}
                  />
                  {/* Anschluss-Typ (Schätzung Grabenlänge) */}
                  <div style={{ margin: "10px 0 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#475569", letterSpacing: 1, marginBottom: 6 }}>
                      ⛏️ ANSCHLUSS-LÄNGE (SCHÄTZUNG)
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {([
                        { v: "kurz", label: "🟢 Kurz\n<10 m", bg: "#16a34a", bgIn: "#f0fdf4", fg: "#166534" },
                        { v: "lang", label: "🟠 Lang\n≥10 m", bg: "#ea580c", bgIn: "#fff7ed", fg: "#9a3412" },
                      ] as const).map((opt) => {
                        const active = c.anschluss_typ === opt.v;
                        return (
                          <button
                            key={opt.v}
                            onClick={() => patchContact(c.bid, { anschluss_typ: active ? null : opt.v })}
                            style={{
                              padding: "10px 6px",
                              borderRadius: 8,
                              border: `2px solid ${active ? opt.bg : "#e2e8f0"}`,
                              background: active ? opt.bg : opt.bgIn,
                              color: active ? "#fff" : opt.fg,
                              fontSize: 13,
                              fontWeight: 800,
                              lineHeight: 1.25,
                              whiteSpace: "pre-line",
                              cursor: "pointer",
                            }}
                          >{opt.label}</button>
                        );
                      })}
                    </div>
                    {c.anschluss_typ && (
                      <div style={{ marginTop: 6, textAlign: "center", fontSize: 11, color: "#64748b" }}>
                        Erneut klicken = zurücksetzen
                      </div>
                    )}
                  </div>
                  {(() => {
                    const zSt = zustimmungStatus(c.zustimmung, c.bid);
                    const ai = auskundungInfo(c);
                    const showZ = zSt === "fehlt";
                    const showA = ai.required;
                    if (!showZ && !showA) return null;
                    return (
                      <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        {showZ && (
                          <div style={{ background: "#fee2e2", border: "2px solid #dc2626", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 11, fontWeight: 900, color: "#991b1b", letterSpacing: 1, marginBottom: 2 }}>
                              ⚠ KEINE EIGENTÜMER-ZUSTIMMUNG
                            </div>
                            <div style={{ fontSize: 12, color: "#7f1d1d" }}>
                              Status laut Datenbank: <strong>{c.zustimmung || "(leer)"}</strong>. Bau ohne Zustimmung nicht möglich.
                            </div>
                          </div>
                        )}
                        {showA && (
                          <div style={{ background: ai.done ? "#d1fae5" : "#ffedd5", border: `2px solid ${ai.done ? "#059669" : "#ea580c"}`, borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 11, fontWeight: 900, color: ai.done ? "#065f46" : "#9a3412", letterSpacing: 1, marginBottom: 2 }}>
                              🔍 AUSKUNDUNG {ai.done ? "ERFOLGT" : "ERFORDERLICH"}
                            </div>
                            <div style={{ fontSize: 12, color: ai.done ? "#065f46" : "#7c2d12", lineHeight: 1.5 }}>
                              {ai.status && <div>Status: <strong>{ai.status}</strong></div>}
                              {ai.plan && <div>Termin: <strong>{ai.plan}</strong></div>}
                              {ai.ergebnis && <div>Ergebnis: <strong>{ai.ergebnis}</strong></div>}
                              {!ai.status && !ai.plan && !ai.ergebnis && (
                                <div>{ai.done ? "Auskundung wurde durchgeführt." : "Auskundung muss noch durchgeführt werden."}</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <details style={{ background: "#eef2ff", borderRadius: 9, padding: "9px 12px", marginBottom: 12, fontSize: 13, lineHeight: 1.7, color: "#1e293b" }}>
                    <summary style={{ fontSize: 9, fontWeight: 800, color: "#6366f1", letterSpacing: 1.2, cursor: "pointer", listStyle: "none" }}>LEITFADEN ▾</summary>
                    <div style={{ marginTop: 6 }}>
                      „Guten Tag Herr/Frau <strong>{lastName(c.name)}</strong>, hier ist Störmer Bau im Auftrag der Telekom.<br />
                      Wir sind aktuell in der <strong>{c.strasse}</strong> und setzen die Glasfaser-Hausanschlüsse um.<br />
                      Passt es Ihnen <strong>diese Woche</strong> – <strong>vormittags ab 7:30 Uhr</strong> oder <strong>nachmittags ab 13 Uhr</strong>?"
                    </div>
                  </details>

                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {c.mobil && (
                      <a href={`tel:${c.mobil}`} onClick={() => { setPinnedBid(c.bid); if (st === "offen") patch(c.bid, { status: "angerufen" }); }}
                        style={{ flex: 1, background: "#e20074", color: "white", borderRadius: 9, padding: "11px 6px", textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: 14, display: "block" }}>
                        📱 Mobil<br /><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{c.mobil}</span>
                      </a>
                    )}
                    {c.festnetz && c.festnetz !== c.mobil && (
                      <a href={`tel:${c.festnetz}`} onClick={() => { setPinnedBid(c.bid); if (st === "offen") patch(c.bid, { status: "angerufen" }); }}
                        style={{ flex: 1, background: "#1f2937", color: "white", borderRadius: 9, padding: "11px 6px", textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: 14, display: "block" }}>
                        ☎️ Festnetz<br /><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{c.festnetz}</span>
                      </a>
                    )}
                  </div>

                  {c.mobil && (
                    <a
                      href={`https://wa.me/${c.mobil.replace(/[^\d]/g, "").replace(/^0/, "49")}?text=${encodeURIComponent(
                        `Guten Tag Herr/Frau ${lastName(c.name)},\n\nhier ist Störmer Bau im Auftrag der Telekom. Wir haben versucht Sie telefonisch zu erreichen bezüglich Ihres Glasfaser-Hausanschlusses in der ${c.strasse} ${c.hnr}${c.hnr_zusatz}.\n\nBitte melden Sie sich kurz zurück, damit wir zeitnah einen Termin vereinbaren können.\n\nVielen Dank!`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => { if (st === "offen" || st === "angerufen") patch(c.bid, { status: "nichtErreicht" }); }}
                      style={{ display: "block", background: "#25D366", color: "white", borderRadius: 9, padding: "10px 6px", textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: 13, marginBottom: 10 }}
                    >
                      💬 WhatsApp · Rückruf-Bitte senden
                    </a>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
                    {(["nichtErreicht", "abgelehnt", "erledigt"] as const).map((s) => (
                      <button key={s} onClick={() => {
                        const prev = states[c.bid];
                        const erlDate = prev?.termin_datum || toIsoDate(new Date());
                        patch(c.bid, {
                          status: s,
                          ...(s === "erledigt" ? { termin_slot: "", termin_datum: null, termin_zeit: "", erledigt_datum: erlDate } : {}),
                        });
                        if (s === "erledigt") setGrabenPromptFor({ contact: c, prev });
                      }}
                        style={statusBtn(st === s)}>{STATUS_META[s].label}</button>
                    ))}
                  </div>

                  <TeamSection contact={c} cs={cs} onPatch={(changes) => patch(c.bid, changes)} />

                  {/* ── Priorität-Override ── */}
                  {(() => {
                    const nvtPrio = getNvtPriority(c.nvt) as PriorityLevel;
                    const override = cs?.priority_override;
                    const effectivePrio = override != null ? override : nvtPrio;
                    return (
                      <div style={{ marginBottom: 10, padding: "8px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: "#475569", letterSpacing: 1, marginBottom: 6 }}>
                          ⭐ PRIORITÄT {override != null ? "(manuell)" : `(NVT: ${priorityStars(nvtPrio) || "keine"})`}
                        </div>
                        <div style={{ display: "flex", gap: 5 }}>
                          {([
                            { val: null, label: "NVT" },
                            { val: 0, label: "—" },
                            { val: 1, label: "⭐" },
                            { val: 2, label: "⭐⭐" },
                            { val: 3, label: "⭐⭐⭐" },
                          ] as { val: number | null; label: string }[]).map(({ val, label }) => {
                            const active = val === null
                              ? override == null
                              : override === val;
                            return (
                              <button
                                key={val ?? "nvt"}
                                onClick={() => patch(c.bid, { priority_override: val } as Parameters<typeof patch>[1])}
                                style={{
                                  flex: 1, padding: "6px 2px", borderRadius: 6, border: "none", cursor: "pointer",
                                  fontSize: 11, fontWeight: 700,
                                  background: active ? "#d97706" : "#f1f5f9",
                                  color: active ? "white" : "#64748b",
                                }}
                              >{label}</button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ marginBottom: 12, padding: "8px 10px", background: kf ? "#fef3c7" : "#fffbeb", border: `1px solid ${kf ? "#f59e0b" : "#fde68a"}`, borderRadius: 9 }}>
                    <button
                      type="button"
                      onClick={() => patch(c.bid, { klarfall: !kf })}
                      style={{
                        width: "100%", padding: "8px 10px", borderRadius: 7,
                        border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
                        background: kf ? "#f59e0b" : "white",
                        color: kf ? "white" : "#92400e",
                        marginBottom: kf ? 8 : 0,
                      }}
                    >
                      ⚠️ Klärfall {kf ? "aktiv" : "markieren"}
                    </button>
                    {kf && (
                      <LocalNotizTextarea
                        value={cs?.klarfall_notiz ?? ""}
                        onSave={(v) => patch(c.bid, { klarfall_notiz: v })}
                        resyncKey={`kf:${c.bid}`}
                        placeholder="Klärfall-Notiz: Was ist zu klären?"
                        borderColor="#f59e0b"
                        background="white"
                      />
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#888", letterSpacing: 1 }}>TERMIN</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {appt && (
                        <button
                          onClick={(e) => { e.stopPropagation(); patch(c.bid, { status: "offen", termin_slot: "", termin_datum: null, termin_zeit: "", team_status: "" }); }}
                          style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: "#dc2626" }}
                          title="Termin löschen"
                        >
                          🗑 Löschen
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setWeekStart((d) => { const x = new Date(d); x.setDate(d.getDate() - 7); return x; }); }}
                        style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#475569" }}>‹</button>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", minWidth: 105, textAlign: "center" }}>{weekRangeLabel}</span>
                      <button onClick={(e) => { e.stopPropagation(); setWeekStart((d) => { const x = new Date(d); x.setDate(d.getDate() + 7); return x; }); }}
                        style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#475569" }}>›</button>
                      <button onClick={(e) => { e.stopPropagation(); setWeekStart(mondayOf(new Date())); }}
                        style={{ background: "#e0f2fe", border: "none", borderRadius: 6, padding: "3px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer", color: "#0891b2", marginLeft: 2 }}>Heute</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
                    {slotDays.map(({ day, date, vm, nm }) => {
                      const rel = relativeDayLabel(date);
                      return (
                        <div key={date} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 62, fontSize: 12, fontWeight: 600, color: "#555", flexShrink: 0, lineHeight: 1.1 }}>
                            <div>{day}</div>
                            {rel && <div style={{ fontSize: 9, fontWeight: 500, color: "#0891b2", marginTop: 1 }}>{rel}</div>}
                          </div>
                          {[[vm, "☀️ Vorm."], [nm, "🌤 Nachm."]].map(([key, lbl]) => (
                            <button key={key} onClick={() => { setPinnedBid(c.bid); patch(c.bid, { termin_slot: key, termin_datum: date, status: "termin" }); }}
                              style={slotBtn(appt === key && apptDate === date)}>{lbl}</button>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  {appt && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 10px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>⏰ Frühestens ab</span>
                      <select
                        value={cs?.termin_zeit ?? ""}
                        onChange={(e) => patch(c.bid, { termin_zeit: e.target.value })}
                        style={{ flex: 1, padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "white", color: "#1e293b" }}
                      >
                        <option value="">— keine Vorgabe —</option>
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t} Uhr</option>
                        ))}
                      </select>
                      {cs?.termin_zeit && (
                        <button onClick={() => patch(c.bid, { termin_zeit: "" })}
                          style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 16, cursor: "pointer", padding: "0 4px" }}
                          title="Zeit entfernen">✕</button>
                      )}
                    </div>
                  )}

                  <LocalNotizTextarea
                    value={note}
                    onSave={(v) => patch(c.bid, { notiz: v })}
                    resyncKey={`note:${c.bid}`}
                    placeholder="Notiz…"
                  />

                  <GrabenStepper
                    value={cs?.grabenlaenge ?? 0}
                    onChange={(v) => patch(c.bid, { grabenlaenge: v })}
                  />

                  {st === "termin" && appt && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: "#888", letterSpacing: 1, marginBottom: 6 }}>TERMIN TEILEN</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <button
                          onClick={() => shareSingleCustomer(c)}
                          style={{ background: "#25D366", color: "white", border: "none", borderRadius: 8, padding: "9px 6px", fontSize: 12, fontWeight: 700, cursor: "pointer", lineHeight: 1.2 }}
                          title="Terminbestätigung an Kunde senden"
                        >
                          💬 Kunde<br /><span style={{ fontSize: 9, fontWeight: 500, opacity: 0.9 }}>Bestätigung</span>
                        </button>
                        <button
                          onClick={() => shareSingleInternal(c)}
                          style={{ background: "#128C7E", color: "white", border: "none", borderRadius: 8, padding: "9px 6px", fontSize: 12, fontWeight: 700, cursor: "pointer", lineHeight: 1.2 }}
                          title="Termin-Info an Kollegen senden"
                        >
                          💬 Intern<br /><span style={{ fontSize: 9, fontWeight: 500, opacity: 0.9 }}>Kollegen-Info</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: 9, color: "#bbb", marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                    <span>KLS-ID {c.kls_id || "—"}</span>
                    {cs?.updated_at && <span>geändert: {new Date(cs.updated_at).toLocaleString("de-DE")}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 30, textAlign: "center", color: "#999", fontSize: 13 }}>Keine Objekte mit diesen Filtern.</div>
        )}
      </div>
      </>)}

      {grabenPromptFor && (
        <GrabenPromptSheet
          title={`${grabenPromptFor.contact.strasse} ${grabenPromptFor.contact.hnr}${grabenPromptFor.contact.hnr_zusatz}`}
          subtitle={grabenPromptFor.contact.name}
          initial={states[grabenPromptFor.contact.bid]?.grabenlaenge ?? 0}
          onSave={(v) => {
            patch(grabenPromptFor.contact.bid, { grabenlaenge: v });
            setGrabenPromptFor(null);
          }}
          onSkip={() => setGrabenPromptFor(null)}
          onUndo={() => {
            const prev = grabenPromptFor.prev;
            patch(grabenPromptFor.contact.bid, {
              status: prev?.status && prev.status !== "erledigt" ? prev.status : "offen",
              termin_slot: prev?.termin_slot ?? "",
              termin_datum: prev?.termin_datum ?? null,
              termin_zeit: prev?.termin_zeit ?? "",
              grabenlaenge: prev?.grabenlaenge ?? 0,
            });
            setGrabenPromptFor(null);
          }}
        />
      )}

      {/* LONG-PRESS ACTION SHEET */}
      {longPressContact && (
        <div
          onClick={() => setLongPressContact(null)}
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 56, background: "rgba(0,0,0,0.5)",
            zIndex: 500, display: "flex", justifyContent: "center", alignItems: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", width: "100%", maxWidth: 480,
              borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16,
              display: "flex", flexDirection: "column", gap: 10,
              animation: "slideUp 0.2s ease-out",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
              📍 {longPressContact.strasse} {longPressContact.hnr}{longPressContact.hnr_zusatz} — {longPressContact.name}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
              Was möchtest du anzeigen?
            </div>
            <button
              type="button"
              onClick={() => {
                const c = longPressContact;
                setFocusBid(null);
                setFilter(new Set());
                setSearch("");
                setPriorityOnly(false);
                setUrgentOnly(false);
                setNvtSel(new Set());
                const ort = ortOf(c.nvt);
                if (ort) setOrtSel(ort);
                setStreetSel(new Set([c.strasse]));
                setLongPressContact(null);
              }}
              style={{ background: "#f1f5f9", border: "none", borderRadius: 10, padding: "14px 12px", fontSize: 15, fontWeight: 600, color: "#0f172a", textAlign: "left", cursor: "pointer" }}
            >
              🏘️ Nur diese Straße: {longPressContact.strasse}
            </button>
            <button
              type="button"
              onClick={() => {
                const c = longPressContact;
                setFocusBid(null);
                setFilter(new Set());
                setSearch("");
                setPriorityOnly(false);
                setUrgentOnly(false);
                setStreetSel(new Set());
                const ort = ortOf(c.nvt);
                if (ort) setOrtSel(ort);
                setNvtSel(new Set([c.nvt]));
                setLongPressContact(null);
              }}
              style={{ background: "#f1f5f9", border: "none", borderRadius: 10, padding: "14px 12px", fontSize: 15, fontWeight: 600, color: "#0f172a", textAlign: "left", cursor: "pointer" }}
            >
              📡 Nur dieser NVT: {longPressContact.nvt}
            </button>
            <button
              type="button"
              onClick={() => {
                const c = longPressContact;
                setLongPressContact(null);
                openContactOnMap(c.bid);
              }}
              style={{ background: "#f1f5f9", border: "none", borderRadius: 10, padding: "14px 12px", fontSize: 15, fontWeight: 600, color: "#0f172a", textAlign: "left", cursor: "pointer" }}
            >
              🗺️ Auf Karte anzeigen
            </button>
            <button
              type="button"
              onClick={() => setLongPressContact(null)}
              style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 12px", fontSize: 15, fontWeight: 600, color: "#ef4444", cursor: "pointer", marginTop: 4 }}
            >
              ❌ Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* TERMIN-PLAN OVERLAY */}
      {showPlan && (
        <div
          onClick={() => setShowPlan(false)}
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 56, background: "rgba(0,0,0,0.55)",
            zIndex: 500, display: "flex", justifyContent: "center", alignItems: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#f8fafc", width: "100%", maxWidth: 480, maxHeight: "92vh",
              borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}
          >
            <div style={{ background: "#e20074", color: "white", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>Wochenplan · Glasfaser</div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>📅 {appointments.length} Termin{appointments.length === 1 ? "" : "e"}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={shareAppointmentsWhatsApp} disabled={appointments.length === 0}
                  style={{ background: "#25D366", color: "white", border: "none", borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 700, cursor: appointments.length ? "pointer" : "not-allowed", opacity: appointments.length ? 1 : 0.5 }}>
                  💬 Teilen
                </button>
                <button onClick={() => setShowPlan(false)}
                  style={{ background: "rgba(255,255,255,0.22)", color: "white", border: "none", borderRadius: 8, padding: "7px 11px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  ✕
                </button>
              </div>
            </div>

            <div style={{ overflowY: "auto", padding: "10px 12px 24px", flex: 1 }}>
              {(() => {
                const ausk = contacts
                  .filter((c) => !!c.auskundung_von)
                  .sort((a, b) => (a.auskundung_von ?? "").localeCompare(b.auskundung_von ?? ""));
                if (ausk.length === 0) return null;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0891b2", padding: "4px 4px 6px", borderBottom: "2px solid #0891b2", marginBottom: 7, display: "flex", justifyContent: "space-between" }}>
                      <span>🔍 Auskundungs-Termine</span>
                      <span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>{ausk.length}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {ausk.map((c) => {
                        const info = fmtAuskundung(c.auskundung_von, c.auskundung_bis);
                        return (
                          <div key={c.bid}
                            onClick={() => { setShowPlan(false); setExpanded(c.bid); }}
                            style={{ background: "white", borderRadius: 8, padding: "7px 9px", cursor: "pointer", borderLeft: "3px solid #0891b2", border: "1px solid #e0f2fe" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#0891b2" }}>{info}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginTop: 1 }}>
                              {c.strasse} {c.hnr}{c.hnr_zusatz}
                              <span style={{ fontWeight: 400, color: "#888", marginLeft: 5, fontSize: 11 }}>
                                {c.typ}{c.we ? ` · ${c.we} WE` : ""}{c.ge ? ` · ${c.ge} GE` : ""}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {appointments.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "#888", fontSize: 13 }}>
                  Noch keine Termine vereinbart.
                </div>
              ) : (
                (() => {
                  // Gruppiere alle Termine nach Datum (Termine ohne Datum am Ende)
                  const byDate: Record<string, Contact[]> = {};
                  appointments.forEach((c) => {
                    const key = states[c.bid]?.termin_datum ?? "ohne-datum";
                    (byDate[key] = byDate[key] || []).push(c);
                  });
                  const dateKeys = Object.keys(byDate).sort((a, b) => {
                    if (a === "ohne-datum") return 1;
                    if (b === "ohne-datum") return -1;
                    return a.localeCompare(b);
                  });
                  return dateKeys.map((dateKey) => {
                    const dayAppts = byDate[dateKey];
                    let dayLabel: string;
                    let rel: string | null = null;
                    if (dateKey === "ohne-datum") {
                      dayLabel = "Ohne Datum";
                    } else {
                      const d = new Date(dateKey + "T00:00:00");
                      const wk = ["So","Mo","Di","Mi","Do","Fr","Sa"][d.getDay()];
                      dayLabel = `${wk} ${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
                      rel = relativeDayLabel(dateKey);
                    }
                    return (
                      <div key={dateKey} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#e20074", padding: "4px 4px 6px", borderBottom: "2px solid #e20074", marginBottom: 7, display: "flex", justifyContent: "space-between" }}>
                          <span>🗓 {dayLabel}{rel ? ` · ${rel}` : ""}</span>
                          <span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>{dayAppts.length} Termin{dayAppts.length === 1 ? "" : "e"}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {[{ suffix: "-vm", lbl: "☀️ Vormittag", color: "#fbbf24" }, { suffix: "-nm", lbl: "🌤 Nachmittag", color: "#60a5fa" }].map(({ suffix, lbl, color }) => {
                            const slotAppts = dayAppts.filter((c) => (states[c.bid]?.termin_slot ?? "").endsWith(suffix));
                            return (
                              <div key={suffix} style={{ background: "white", borderRadius: 9, border: `1.5px solid ${slotAppts.length ? color : "#e5e7eb"}`, padding: 8, minHeight: 60 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: slotAppts.length ? color : "#bbb", letterSpacing: 0.4, marginBottom: 6 }}>{lbl}</div>
                                {slotAppts.length === 0 ? (
                                  <div style={{ fontSize: 11, color: "#ccc", fontStyle: "italic" }}>—</div>
                                ) : (
                                  slotAppts.map((c) => {
                                    const cs = states[c.bid];
                                    return (
                                      <div key={c.bid}
                                        onClick={() => { setShowPlan(false); setExpanded(c.bid); }}
                                        style={{ background: "#f0fff6", borderRadius: 6, padding: "6px 7px", marginBottom: 4, cursor: "pointer", borderLeft: "3px solid #22c55e" }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: "#15803d", lineHeight: 1.25 }}>
                                          {c.strasse} {c.hnr}{c.hnr_zusatz}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#444", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {c.name}
                                        </div>
                                        <div style={{ fontSize: 10, color: "#777", marginTop: 1 }}>
                                          {c.typ}{c.we ? ` · ${c.we} WE` : ""}{c.ge ? ` · ${c.ge} GE` : ""}
                                        </div>
                                        {cs?.termin_zeit && (
                                          <div style={{ fontSize: 11, color: "#0891b2", fontWeight: 800, marginTop: 2 }}>
                                            ⏰ ab {cs.termin_zeit} Uhr
                                          </div>
                                        )}
                                        {c.mobil && (
                                          <a href={`tel:${c.mobil}`} onClick={(e) => e.stopPropagation()}
                                            style={{ display: "inline-block", marginTop: 4, fontSize: 10, color: "#e20074", fontWeight: 700, textDecoration: "none" }}>
                                            📱 {c.mobil}
                                          </a>
                                        )}
                                        {cs?.notiz?.trim() && (
                                          <div style={{ fontSize: 10, color: "#666", marginTop: 3, fontStyle: "italic", borderTop: "1px dashed #d4d4d8", paddingTop: 3 }}>
                                            📝 {cs.notiz.trim()}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            );
                        })}
                      </div>
                    </div>
                  );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM BAR (only on call tab) */}
      {activeTab === "objekte" && (
        <div style={{
          position: "fixed", bottom: 56, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 480, background: "white", borderTop: "1px solid #e5e7eb",
          padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
          zIndex: 900,
        }}>
          <div style={{ fontSize: 10, color: "#999", flexShrink: 0 }}>
            {counts.nichtErreicht}n.e · {counts.abgelehnt}abg · {counts.erledigt}erl
          </div>
          <button
            onClick={() => setShowPlan(true)}
            disabled={appointments.length === 0}
            style={{
              background: appointments.length ? "#e20074" : "#d1d5db",
              color: "white", border: "none", borderRadius: 9,
              padding: "8px 12px", fontSize: 12, fontWeight: 700,
              cursor: appointments.length ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
            title="Termine als Wochenplan anzeigen"
          >
            📅 Plan ({appointments.length})
          </button>
          <button
            onClick={shareAppointmentsWhatsApp}
            disabled={appointments.length === 0}
            style={{
              background: appointments.length ? "#25D366" : "#d1d5db",
              color: "white", border: "none", borderRadius: 9,
              padding: "8px 12px", fontSize: 12, fontWeight: 700,
              cursor: appointments.length ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
            title="Alle Termine per WhatsApp teilen"
          >
            💬 WA
          </button>
          <div style={{ fontWeight: 800, fontSize: 13, color: counts.termin >= 4 ? "#16a34a" : "#e20074", flexShrink: 0 }}>
            {counts.termin}✓
          </div>
        </div>
      )}

      {/* TAB NAV */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480,
        background: "white", borderTop: "1px solid #e5e7eb",
        display: "flex", zIndex: 9999, height: "calc(56px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)", boxSizing: "border-box",
      }}>
        {([
          ["objekte", "🗂️", "Objekte"],
          ["doku", "📋", "Doku"],
          ["__center__", "", ""],
          ["kalender", "📅", "Kalender"],
          ["karte", "🗺️", "Karte"],
        ] as const).map(([key, icon, label]) => {
          if (key === "__center__") {
            return <div key="spacer" style={{ flex: 1 }} />;
          }
          const active = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key as TabKey)}
              style={{
                flex: 1, background: "white", border: "none",
                borderTop: `3px solid ${active ? "#e20074" : "transparent"}`,
                padding: "6px 4px 8px", cursor: "pointer",
                color: active ? "#e20074" : "#9ca3af",
                fontWeight: active ? 700 : 500, fontSize: 10,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}
            >
              <span style={{ fontSize: 22 }}>{icon}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={() => setActiveTab("dashboard")}
        aria-label="Dashboard"
        style={{
          position: "fixed",
          bottom: "calc(56px + env(safe-area-inset-bottom, 0px) - 30px + 12px)",
          left: "50%", transform: "translateX(-50%)",
          width: 60, height: 60, borderRadius: "50%",
          background: activeTab === "dashboard" ? "#16a34a" : "#22c55e", border: "none", cursor: "pointer",
          boxShadow: "0 4px 16px rgba(34,197,94,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, color: "white", fontSize: 28, lineHeight: 1,
        }}
      >
        🎯
      </button>
      <button
        onClick={() => setActiveTab("finanz")}
        aria-label="Finanzen"
        style={{
          position: "fixed",
          bottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 8px)",
          right: 14,
          width: 56, height: 56, borderRadius: "50%",
          background: activeTab === "finanz"
            ? "linear-gradient(135deg, #b8005c, #7a003d)"
            : "linear-gradient(135deg, #e20074, #b8005c)",
          border: "none", cursor: "pointer",
          boxShadow: "0 4px 16px rgba(226,0,116,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, color: "white", fontSize: 24, lineHeight: 1,
        }}
      >
        💰
      </button>
      <button
        onClick={() => setActiveTab("pipeline")}
        aria-label="Pipeline"
        style={{
          position: "fixed",
          bottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 8px)",
          left: 14,
          width: 56, height: 56, borderRadius: "50%",
          background: activeTab === "pipeline"
            ? "linear-gradient(135deg, #1e3a8a, #0c4a6e)"
            : "linear-gradient(135deg, #3b82f6, #0ea5e9)",
          border: "none", cursor: "pointer",
          boxShadow: "0 4px 16px rgba(59,130,246,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, color: "white", fontSize: 24, lineHeight: 1,
        }}
      >
        🔗
      </button>
    </div>
  );
}

const chip = (active: boolean, color: string): React.CSSProperties => ({
  padding: "4px 13px", borderRadius: 16, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  background: active ? color : "#f0f0f0", color: active ? "white" : "#444",
});

const sortBtn = (): React.CSSProperties => ({
  padding: "4px 9px", borderRadius: 16, border: "1px solid #d4d4d8", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  background: "white", color: "#52525b", flexShrink: 0,
});

const pill = (active: boolean): React.CSSProperties => ({
  padding: "3px 10px", borderRadius: 14, border: "1px solid #ddd", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
  background: active ? "#222" : "white", color: active ? "white" : "#555",
});

const klarfallPill = (active: boolean): React.CSSProperties => ({
  padding: "3px 10px", borderRadius: 14, border: `1px solid ${active ? "#f59e0b" : "#fcd34d"}`,
  fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 700,
  background: active ? "#f59e0b" : "#fffbeb", color: active ? "white" : "#92400e",
});

const statusBtn = (active: boolean): React.CSSProperties => ({
  padding: "7px 4px", borderRadius: 8, border: "1px solid #ddd", fontSize: 12, cursor: "pointer",
  background: active ? "#374151" : "white", color: active ? "white" : "#555", fontWeight: active ? 700 : 400,
});

const slotBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 12, cursor: "pointer", fontWeight: active ? 700 : 400,
  border: `1.5px solid ${active ? "#22c55e" : "#ddd"}`,
  background: active ? "#22c55e" : "white",
  color: active ? "white" : "#444",
});
