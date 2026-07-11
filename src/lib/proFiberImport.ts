import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

type Log = (s: string) => void;

export type DokuIssue = {
  bid: string;
  adresse: string;
  foto: "ok" | "fehlt" | "format";
  protokoll: "ok" | "fehlt" | "format";
  sharepoint: "ok" | "fehlt" | "format";
  rawFoto: string;
  rawProtokoll: string;
  rawSharepoint: string;
};

export type ImportResult = {
  contactsNew: number;
  contactsUpd: number;
  contactsOk: number;
  statesOk: number;
  statesUnmatched: number;
  errors: string[];
  dokuIssues: DokuIssue[];
};

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/** Aggressive Adress-Normalisierung: Umlaute + alle Nicht-Alphanumerisch weg.
 *  So matcht "Am Bahnhof 2 a" == "am-bahnhof-2-a" == "Am Bahnhof 2a". */
const normAddr = (strasse: string, hnr: string, hnr_z: string) => {
  const clean = (s: string) => (s ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");
  return `${clean(strasse)}|${clean(hnr)}${clean(hnr_z)}`;
};

/** Echte Pagination — PostgREST liefert max. 1000 pro Request. */
async function fetchAllContacts(): Promise<{ bid: string; strasse: string; hnr: string; hnr_zusatz: string }[]> {
  const PAGE = 1000;
  const out: { bid: string; strasse: string; hnr: string; hnr_zusatz: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("contacts")
      .select("bid,strasse,hnr,hnr_zusatz")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as { bid: string; strasse: string; hnr: string; hnr_zusatz: string }[]));
    if (data.length < PAGE) break;
  }
  return out;
}

function parseGermanDate(s: string): string | null {
  const t = (s || "").trim();
  if (!t) return null;
  const monate: Record<string, number> = {
    januar:0, jan:0,
    februar:1, feb:1,
    märz:2, maerz:2, mär:2, maer:2, mrz:2,
    april:3, apr:3,
    mai:4,
    juni:5, jun:5,
    juli:6, jul:6,
    august:7, aug:7,
    september:8, sept:8, sep:8,
    oktober:9, okt:9,
    november:10, nov:10,
    dezember:11, dez:11,
  };
  const m = t.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\.?\s*(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const mo = monate[m[2].toLowerCase().replace(/\.$/, "")];
    if (mo !== undefined) {
      const d = new Date(Date.UTC(+m[3], mo, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
      return d.toISOString();
    }
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const zustMap = (v: string): string => {
  const s = (v ?? "").trim().toLowerCase();
  if (s.includes("zugestimmt")) return "AGREED";
  if (s.includes("abgelehnt")) return "REJECTED";
  if (s.includes("offen") || s === "" || s === "initial") return "PENDING";
  return v ?? "";
};

const auskStatusMap = (v: string): string => {
  const s = (v ?? "").trim().toLowerCase();
  if (s.includes("abgeschlossen") || s.includes("erfolgt")) return "erfolgt";
  if (s.includes("plan") || s.includes("offen")) return "geplant";
  if (s.includes("initial")) return "geplant";
  return v ?? "";
};

/**
 * Pass 1: Lese Schmücke_<date>-Sheet und lege neue Objekte an / aktualisiere
 * Eigentümer-Felder (Zustimmung, Auskundung, NVT, Typ, WE/GE).
 */
async function importSchmueckeContacts(wb: XLSX.WorkBook, log: Log): Promise<{ ok: number; neu: number; upd: number }> {
  const sheetName = wb.SheetNames.find((n) => /schm[uü]cke/i.test(n));
  if (!sheetName) {
    log("⚠ Kein Schmücke-Sheet gefunden – Pass 1 übersprungen");
    return { ok: 0, neu: 0, upd: 0 };
  }
  log(`📋 Pass 1 · Property-Sheet: ${sheetName}`);
  type Row = Record<string, string>;
  const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], { defval: "", raw: false });
  log(`  ${rows.length} Zeilen gelesen`);

  const contacts = await fetchAllContacts();
  const byBid = new Set<string>();
  const addrMap = new Map<string, string>();
  for (const c of contacts) {
    byBid.add(c.bid);
    addrMap.set(normAddr(c.strasse, c.hnr, c.hnr_zusatz ?? ""), c.bid);
  }

  const payload: Record<string, unknown>[] = [];
  let neu = 0, upd = 0;
  for (const r of rows) {
    const kls = String(r["KLS ID"] ?? "").trim();
    const strasse = (r["Straße"] ?? "").trim();
    const hnr = String(r["Hausnummer"] ?? "").trim();
    const hnr_z = (r["Hausnummer Z."] ?? "").trim();
    if (!kls || !strasse || !hnr) continue;
    const addrBid = addrMap.get(`${norm(strasse)}|${norm(hnr)}|${norm(hnr_z)}`);
    const bid = addrBid ?? `KLS-${kls}`;
    if (byBid.has(bid)) upd++; else neu++;
    payload.push({
      bid,
      strasse, hnr, hnr_zusatz: hnr_z,
      plz: (r["Postleitzahl"] ?? "").trim(),
      ort: (r["Ort"] ?? "").trim(),
      typ: (r["Typ"] ?? "").trim(),
      we: Number(r["WE"] ?? 0) || 0,
      ge: Number(r["GE"] ?? 0) || 0,
      nvt: (r["NVT Gebiet"] ?? "").trim(),
      zustimmung: zustMap(r["Eigentümerentscheidung"] ?? ""),
      auskundung_erforderlich: (r["Auskundung erforderlich"] ?? "").trim().toLowerCase() === "true",
      auskundung_status: auskStatusMap(r["Auskundungs-Status"] ?? ""),
      auskundung_von: parseGermanDate(r["Auskundung Beginn"] ?? ""),
      auskundung_bis: parseGermanDate(r["Auskundung Ende"] ?? ""),
      auskundung_erfolgt: (r["Auskundung erfolgt"] ?? "").trim().toLowerCase() === "true",
      auskundung_ergebnis: (r["Auskundungs-Ergebnis"] ?? "").trim(),
      auftrag_erstellt_am: parseGermanDate(r["Erstellungsdatum"] ?? ""),
    });
  }
  log(`  → ${payload.length} Kontakte (${neu} neu · ${upd} update)`);

  let ok = 0;
  const CHUNK = 60;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const part = payload.slice(i, i + CHUNK);
    const { error } = await supabase.rpc("bulk_import_contacts", { payload: part as never });
    if (error) log(`  ⚠ Chunk ${i / CHUNK + 1}: ${error.message}`);
    else ok += part.length;
  }
  log(`  ✅ ${ok} Kontakte gespeichert`);
  return { ok, neu, upd };
}

/**
 * Pass 2: Lese "Alle GF+ HA"-Sheet (nur Projekt = An der Schmücke!) und
 * aktualisiere Status, Grabenlänge, Umsatz, Doku, Buchhaltung.
 */
async function importAlleGfStates(wb: XLSX.WorkBook, log: Log): Promise<{ ok: number; unmatched: number; dokuIssues: DokuIssue[] }> {
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("alle gf"));
  if (!sheetName) {
    log("⚠ Kein 'Alle GF+ HA'-Sheet gefunden – Pass 2 übersprungen");
    return { ok: 0, unmatched: 0, dokuIssues: [] };
  }
  log(`📊 Pass 2 · Status-Sheet: ${sheetName} (nur Projekt 'An der Schmücke')`);
  const sh = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: null, raw: true });
  const dataRows = raw.slice(4) as unknown[][];

  const statusMap: Record<string, string> = {
    erledigt: "erledigt", terminiert: "termin", "nicht erreicht": "nichtErreicht",
    SMS: "angerufen", "SMS + AB": "angerufen", "Rückruf": "angerufen", "Ruft zurück": "angerufen",
    "Klärung": "offen", Extern: "offen", Storno: "abgelehnt",
    "bereits verbaut": "erledigt", "falsche Nr": "offen",
  };
  const toDate = (v: unknown): string => {
    if (!v) return "";
    // WICHTIG: lokale Kalender-Komponenten nehmen, nicht toISOString() —
    // sonst rutscht "1.7. 00:00 lokal" per UTC-Konvertierung auf 30.6. zurück.
    if (v instanceof Date) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, "0");
      const d = String(v.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const s = String(v).trim();
    // ISO-Datum wie "2026-07-01" oder "2026-07-01T..." → direkt die ersten 10 Zeichen
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    // DE-Format wie "01.07.2026"
    const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (de) return `${de[3]}-${de[2].padStart(2,"0")}-${de[1].padStart(2,"0")}`;
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const TRUE_SET = new Set(["ja", "true", "1", "x", "yes", "y", "✓", "✔"]);
  const FALSE_SET = new Set(["", "nein", "false", "0", "no", "n", "-", "–"]);
  const classify = (v: unknown): { val: boolean; state: "ok" | "fehlt" | "format"; raw: string } => {
    if (v === null || v === undefined || v === "") return { val: false, state: "fehlt", raw: "" };
    if (typeof v === "boolean") return { val: v, state: v ? "ok" : "fehlt", raw: String(v) };
    const raw = String(v).trim();
    const s = raw.toLowerCase();
    if (TRUE_SET.has(s)) return { val: true, state: "ok", raw };
    if (FALSE_SET.has(s)) return { val: false, state: "fehlt", raw };
    return { val: false, state: "format", raw };
  };
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };
  const str = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = String(v).trim();
    if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
    return s;
  };

  const { data: contacts } = await supabase.from("contacts").select("bid,strasse,hnr,hnr_zusatz").range(0, 9999);
  const map = new Map<string, string>();
  for (const c of (contacts ?? []) as { bid: string; strasse: string; hnr: string; hnr_zusatz: string }[]) {
    map.set(`${norm(c.strasse)}|${norm(c.hnr)}|${norm(c.hnr_zusatz ?? "")}`, c.bid);
  }

  const payload: Record<string, unknown>[] = [];
  const syntheticContacts: Record<string, unknown>[] = [];
  const dokuIssues: DokuIssue[] = [];
  let unmatched = 0, skipProj = 0, skipStatus = 0, synthCreated = 0;
  const slug = (s: string) => s.toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  for (const row of dataRows) {
    const projekt = str(row[0]);
    if (!/schm[uü]cke/i.test(projekt)) { skipProj++; continue; }
    const strasse = str(row[1]);
    const nr = str(row[2]);
    const abc = str(row[3]);
    const statusRaw = str(row[5]);
    if (!strasse || !nr || !statusRaw) continue;
    const mapped = statusMap[statusRaw] ?? "";
    if (mapped !== "erledigt") { skipStatus++; continue; }
    let bid = map.get(`${norm(strasse)}|${norm(nr)}|${norm(abc)}`);
    if (!bid) {
      // Kein Contact-Match → gebaut ohne GF+ Auftrag (Telekom hat kein KLS angelegt
      // oder alten Auftrag längst gelöscht). Synthetischen Kontakt anlegen, damit
      // das Objekt in der App als "Kein GF+ Auftrag"-Klärfall auftaucht.
      bid = `OHNE-${slug(strasse)}-${nr}${abc ? "-" + slug(abc) : ""}`;
      const nvt = str(row[4]);
      syntheticContacts.push({
        bid, strasse, hnr: nr, hnr_zusatz: abc,
        plz: "", ort: "An der Schmücke",
        name: "", email: "", mobil: "", festnetz: "",
        typ: "", we: 0, ge: 0,
        zustimmung: "AGREED",
        nvt: nvt || "Schmücke",
        auskundung_erforderlich: false,
        auskundung_status: "erfolgt",
        auskundung_erfolgt: true,
        auskundung_ergebnis: "",
        auftragsquelle: "bulk",
      });
      map.set(`${norm(strasse)}|${norm(nr)}|${norm(abc)}`, bid);
      synthCreated++;
      unmatched++;
    }
    const foto = classify(row[15]);
    const proto = classify(row[16]);
    const sp = classify(row[17]);
    // Spalte L (Index 11) = GF+  → true wenn "Ja", sonst false (Nein/leer = kein Telekom-Auftrag im GF+ Portal)
    const gfPlus = classify(row[11]);
    if (foto.state !== "ok" || proto.state !== "ok" || sp.state !== "ok") {
      dokuIssues.push({
        bid,
        adresse: `${strasse} ${nr}${abc ? " " + abc : ""}`.trim(),
        foto: foto.state, protokoll: proto.state, sharepoint: sp.state,
        rawFoto: foto.raw, rawProtokoll: proto.raw, rawSharepoint: sp.raw,
      });
    }
    payload.push({
      bid, strasse, hnr: nr,
      status: "erledigt",
      erledigt_datum: toDate(row[6]),
      grabenlaenge: Math.round(num(row[8])),
      umsatz_eur: num(row[9]),
      zusatz_eur: 0,
      foto: foto.val,
      protokoll: proto.val,
      sharepoint: sp.val,
      gf_plus: gfPlus.val,
      eingereicht_am: toDate(row[19]),
      aufmass_am: toDate(row[20]),
      gutschrift_nr: str(row[21]),
      avis_am: toDate(row[22]),
      verguetet_am: toDate(row[23]),
      bemerkung: str(row[25]),
    });
  }
  const badFmt = dokuIssues.filter(i => i.foto === "format" || i.protokoll === "format" || i.sharepoint === "format").length;
  log(`  → ${payload.length} erledigte Schmücke-Zeilen · ${skipProj} andere Projekte · ${skipStatus} andere Status · ${unmatched} ohne Contact-Match (davon ${synthCreated} als synthetischer Kontakt angelegt)`);
  log(`  📋 Doku-Check: ${dokuIssues.length} unvollständig (${badFmt} Format-Fehler)`);

  // Erst synthetische Kontakte anlegen, dann call_states schreiben (FK würde sonst greifen)
  if (syntheticContacts.length > 0) {
    const CHUNK_C = 60;
    let cOk = 0;
    for (let i = 0; i < syntheticContacts.length; i += CHUNK_C) {
      const part = syntheticContacts.slice(i, i + CHUNK_C);
      const { error } = await supabase.rpc("bulk_import_contacts", { payload: part as never });
      if (error) log(`  ⚠ Synth-Kontakt Chunk: ${error.message}`);
      else cOk += part.length;
    }
    log(`  🏷️ ${cOk} synthetische "Ohne Auftrag"-Kontakte gespeichert`);
  }

  let ok = 0;
  const CHUNK = 100;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const part = payload.slice(i, i + CHUNK);
    const { error } = await supabase.rpc("bulk_import_call_states_from_excel", { payload: { rows: part } as never });
    if (error) log(`  ⚠ Chunk ${i / CHUNK + 1}: ${error.message}`);
    else ok += part.length;
  }
  log(`  ✅ ${ok} Status-Einträge aktualisiert`);
  return { ok, unmatched, dokuIssues };
}

export async function runFullProFiberImport(file: File, log: Log = () => {}): Promise<ImportResult> {
  log(`Lese ${file.name} …`);
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const errors: string[] = [];
  let c = { ok: 0, neu: 0, upd: 0 };
  let s: { ok: number; unmatched: number; dokuIssues: DokuIssue[] } = { ok: 0, unmatched: 0, dokuIssues: [] };
  try { c = await importSchmueckeContacts(wb, log); } catch (e) { errors.push(`Pass 1: ${(e as Error).message}`); }
  try { s = await importAlleGfStates(wb, log); } catch (e) { errors.push(`Pass 2: ${(e as Error).message}`); }

  return {
    contactsNew: c.neu, contactsUpd: c.upd, contactsOk: c.ok,
    statesOk: s.ok, statesUnmatched: s.unmatched, errors,
    dokuIssues: s.dokuIssues,
  };
}

