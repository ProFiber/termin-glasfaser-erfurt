import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { Contact } from "@/lib/types";

export const Route = createFileRoute("/admin")({
  component: Admin,
  head: () => ({
    meta: [{ title: "Admin · Call-Liste" }, { name: "robots", content: "noindex" }],
  }),
});

function Admin() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const append = (s: string) => setLog((l) => [...l, s]);

  async function importContacts() {
    setBusy(true);
    setLog([]);
    try {
      append("Lade contacts-seed.json…");
      const res = await fetch("/contacts-seed.json");
      const records = (await res.json()) as Contact[];
      append(`${records.length} Kontakte aus Datei gelesen`);
      const chunkSize = 60;
      let total = 0;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { data, error } = await supabase.rpc("bulk_import_contacts", {
          payload: chunk as never,
        });
        if (error) {
          append(`❌ Fehler bei Chunk ${i / chunkSize + 1}: ${error.message}`);
          break;
        }
        total += (data as number) ?? 0;
        append(`✓ Chunk ${i / chunkSize + 1}/${Math.ceil(records.length / chunkSize)} – kumuliert: ${total} Zeilen`);
      }
      append(`✅ Fertig. Insgesamt ${total} Eintrag-Inserts/Updates.`);
    } catch (e) {
      append(`❌ Fehler: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function applyMarkings() {
    setBusy(true);
    append("Setze Status für genannte Hauptstr.-Objekte…");
    // Find by Hauptstr. + house number
    const { data: hs, error } = await supabase
      .from("contacts")
      .select("bid,hnr,hnr_zusatz,name")
      .eq("strasse", "Hauptstr.");
    if (error) { append(`❌ ${error.message}`); setBusy(false); return; }

    const erledigtNumbers = ["3", "15", "17", "46", "47"];
    const terminBid_9 = (hs as Contact[]).find((c) => c.hnr === "9");
    const erledigtBids = (hs as Contact[])
      .filter((c) => erledigtNumbers.includes(c.hnr))
      .map((c) => c.bid);

    append(`Erledigt: ${erledigtBids.length} Treffer`);
    for (const bid of erledigtBids) {
      const { error: e } = await supabase
        .from("call_states")
        .upsert({ bid, status: "erledigt" as const, termin_slot: "", notiz: "" }, { onConflict: "bid" });
      if (e) append(`  ⚠ ${bid}: ${e.message}`);
      else append(`  ✓ ${bid} erledigt`);
    }

    if (terminBid_9) {
      const { error: e } = await supabase
        .from("call_states")
        .upsert(
          { bid: terminBid_9.bid, status: "termin" as const, termin_slot: "mi-vm", notiz: "" },
          { onConflict: "bid" }
        );
      if (e) append(`  ⚠ Hauptstr. 9: ${e.message}`);
      else append(`  ✓ Hauptstr. 9 → Mi 22.04. Vormittag`);
    } else {
      append("  ⚠ Hauptstr. 9 nicht gefunden – erst Kontakte importieren");
    }
    append("✅ Markierungen gesetzt.");
    setBusy(false);
  }

  async function migrateSchmueckeErledigt() {
    setBusy(true);
    setLog([]);
    append("Lade schmuecke-erledigt.json…");
    try {
      const res = await fetch("/schmuecke-erledigt.json");
      const rows = (await res.json()) as { strasse: string; hnr: string; hnr_zusatz: string }[];
      append(`${rows.length} Zeilen aus Excel geladen`);

      const { data: contacts, error: cErr } = await supabase
        .from("contacts")
        .select("bid,strasse,hnr,hnr_zusatz")
        .range(0, 9999);
      if (cErr) { append(`❌ ${cErr.message}`); setBusy(false); return; }
      append(`${contacts?.length ?? 0} Kontakte geladen`);

      const key = (s: string, h: string, z: string) =>
        `${(s ?? "").trim().toLowerCase()}|${(h ?? "").trim().toLowerCase()}|${(z ?? "").trim().toLowerCase()}`;
      const map = new Map<string, string>();
      for (const c of contacts as { bid: string; strasse: string; hnr: string; hnr_zusatz: string }[]) {
        map.set(key(c.strasse, c.hnr, c.hnr_zusatz ?? ""), c.bid);
      }

      const matchedBids: string[] = [];
      const missing: typeof rows = [];
      for (const r of rows) {
        const bid = map.get(key(r.strasse, r.hnr, r.hnr_zusatz));
        if (bid) matchedBids.push(bid);
        else missing.push(r);
      }
      append(`✓ ${matchedBids.length} Treffer · ${missing.length} ohne Match`);
      if (missing.length) {
        append("Fehlende (max 10):");
        for (const m of missing.slice(0, 10)) {
          append(`  • ${m.strasse} ${m.hnr}${m.hnr_zusatz ? " " + m.hnr_zusatz : ""}`);
        }
      }

      let ok = 0, fail = 0;
      for (let i = 0; i < matchedBids.length; i += 50) {
        const chunk = matchedBids.slice(i, i + 50);
        const { data: existing } = await supabase
          .from("call_states")
          .select("bid,termin_slot,termin_datum,termin_zeit,notiz")
          .in("bid", chunk);
        const existingMap = new Map((existing ?? []).map((e) => [e.bid, e]));
        const payload = chunk.map((bid) => {
          const e = existingMap.get(bid);
          return {
            bid,
            status: "erledigt" as const,
            termin_slot: e?.termin_slot ?? "",
            termin_datum: e?.termin_datum ?? null,
            termin_zeit: e?.termin_zeit ?? "",
            notiz: e?.notiz ?? "",
          };
        });
        const { error } = await supabase.from("call_states").upsert(payload, { onConflict: "bid" });
        if (error) { fail += chunk.length; append(`  ⚠ Chunk ${i / 50 + 1}: ${error.message}`); }
        else { ok += chunk.length; append(`  ✓ Chunk ${i / 50 + 1}: ${chunk.length} aktualisiert`); }
      }
      append(`✅ Fertig: ${ok} aktualisiert, ${fail} fehlgeschlagen`);
    } catch (e) {
      append(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importMasterCsv(file: File) {
    setBusy(true);
    setLog([]);
    try {
      append(`Lese ${file.name} …`);
      const text = await file.text();
      // remove BOM
      const clean = text.replace(/^\uFEFF/, "");
      const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) { append("❌ Datei hat keine Zeilen"); setBusy(false); return; }
      const headers = lines[0].split(";").map((h) => h.trim());
      const idx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
      const iStr = idx("Straße");
      const iHnr = idx("Hausnummer");
      const iHnrZ = idx("Hausnummer Z.");
      const iZust = idx("Eigentümerentscheidung");
      const iAErf = idx("Auskundung erforderlich");
      const iAStat = idx("Auskundungs-Status");
      const iABeg = idx("Auskundung Beginn");
      const iAEnd = idx("Auskundung Ende");
      const iADone = idx("Auskundung erfolgt");
      const iAErg = idx("Auskundungs-Ergebnis");
      if (iStr < 0 || iHnr < 0 || iZust < 0) {
        append("❌ Pflicht-Spalten fehlen (Straße, Hausnummer, Eigentümerentscheidung)");
        setBusy(false); return;
      }

      const parseDate = (s: string): string | null => {
        const t = (s || "").trim();
        if (!t) return null;
        const d = new Date(t);
        return isNaN(d.getTime()) ? null : d.toISOString();
      };

      type MasterRow = {
        strasse: string; hnr: string; hnr_zusatz: string;
        zustimmung: string;
        auskundung_erforderlich: boolean;
        auskundung_status: string;
        auskundung_von: string | null;
        auskundung_bis: string | null;
        auskundung_erfolgt: boolean;
        auskundung_ergebnis: string;
      };
      const rows: MasterRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(";");
        rows.push({
          strasse: (cells[iStr] ?? "").trim(),
          hnr: (cells[iHnr] ?? "").trim(),
          hnr_zusatz: iHnrZ >= 0 ? (cells[iHnrZ] ?? "").trim() : "",
          zustimmung: (cells[iZust] ?? "").trim(),
          auskundung_erforderlich: iAErf >= 0 ? (cells[iAErf] ?? "").trim().toLowerCase() === "true" : false,
          auskundung_status: iAStat >= 0 ? (cells[iAStat] ?? "").trim() : "",
          auskundung_von: iABeg >= 0 ? parseDate(cells[iABeg] ?? "") : null,
          auskundung_bis: iAEnd >= 0 ? parseDate(cells[iAEnd] ?? "") : null,
          auskundung_erfolgt: iADone >= 0 ? (cells[iADone] ?? "").trim().toLowerCase() === "true" : false,
          auskundung_ergebnis: iAErg >= 0 ? (cells[iAErg] ?? "").trim() : "",
        });
      }
      append(`✓ ${rows.length} Zeilen aus Master gelesen`);

      const { data: contacts, error: cErr } = await supabase
        .from("contacts")
        .select("bid,strasse,hnr,hnr_zusatz")
        .range(0, 9999);
      if (cErr) { append(`❌ ${cErr.message}`); setBusy(false); return; }
      const norm = (s: string) => (s ?? "").trim().toLowerCase();
      const key = (s: string, h: string, z: string) => `${norm(s)}|${norm(h)}|${norm(z)}`;
      const map = new Map<string, string>();
      for (const c of (contacts ?? []) as { bid: string; strasse: string; hnr: string; hnr_zusatz: string }[]) {
        map.set(key(c.strasse, c.hnr, c.hnr_zusatz ?? ""), c.bid);
      }

      let matched = 0, missing = 0;
      const payload: Record<string, unknown>[] = [];
      const missingRows: MasterRow[] = [];
      for (const r of rows) {
        const bid = map.get(key(r.strasse, r.hnr, r.hnr_zusatz));
        if (!bid) { missing++; missingRows.push(r); continue; }
        matched++;
        payload.push({
          bid,
          strasse: r.strasse,
          hnr: r.hnr,
          hnr_zusatz: r.hnr_zusatz,
          zustimmung: r.zustimmung,
          auskundung_erforderlich: r.auskundung_erforderlich,
          auskundung_status: r.auskundung_status,
          auskundung_von: r.auskundung_von,
          auskundung_bis: r.auskundung_bis,
          auskundung_erfolgt: r.auskundung_erfolgt,
          auskundung_ergebnis: r.auskundung_ergebnis,
        });
      }
      append(`✓ ${matched} Adress-Treffer · ${missing} ohne Match`);
      if (missing > 0) {
        append("Ohne Match (max 15):");
        for (const m of missingRows.slice(0, 15)) {
          append(`  • ${m.strasse} ${m.hnr}${m.hnr_zusatz ? " " + m.hnr_zusatz : ""}`);
        }
      }

      let ok = 0, fail = 0;
      const chunk = 60;
      for (let i = 0; i < payload.length; i += chunk) {
        const part = payload.slice(i, i + chunk);
        const { error } = await supabase.rpc("bulk_import_contacts", { payload: part as never });
        if (error) { fail += part.length; append(`  ⚠ Chunk ${i / chunk + 1}: ${error.message}`); }
        else { ok += part.length; append(`  ✓ Chunk ${i / chunk + 1}: ${part.length} aktualisiert`); }
      }
      append(`✅ Fertig: ${ok} aktualisiert, ${fail} fehlgeschlagen`);
    } catch (e) {
      append(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importGrabenlaengen() {
    setBusy(true);
    setLog([]);
    type Row = { strasse: string; hnr: string; grabenlaenge: number; datum: string };
    const data: Row[] = [
      // 06.05.2026
      { strasse: "Weimarer Str.", hnr: "23", grabenlaenge: 8, datum: "2026-05-06" },
      { strasse: "Esperstedter Str.", hnr: "2", grabenlaenge: 1, datum: "2026-05-06" },
      { strasse: "Esperstedter Str.", hnr: "5", grabenlaenge: 1, datum: "2026-05-06" },
      { strasse: "Karl-Marx-Str.", hnr: "11", grabenlaenge: 1, datum: "2026-05-06" },
      { strasse: "Karl-Marx-Str.", hnr: "14", grabenlaenge: 1, datum: "2026-05-06" },
      { strasse: "Frankenhäuser Str.", hnr: "7", grabenlaenge: 2, datum: "2026-05-06" },
      { strasse: "Frankenhäuser Str.", hnr: "17", grabenlaenge: 4, datum: "2026-05-06" },
      { strasse: "Weimarer Str.", hnr: "10", grabenlaenge: 1, datum: "2026-05-06" },
      { strasse: "Lange Str.", hnr: "47", grabenlaenge: 1, datum: "2026-05-06" },
      // 05.05.2026
      { strasse: "Steinstr.", hnr: "11", grabenlaenge: 1, datum: "2026-05-05" },
      { strasse: "Mühlstr.", hnr: "9", grabenlaenge: 1, datum: "2026-05-05" },
      { strasse: "Am Wässerchen", hnr: "4", grabenlaenge: 3, datum: "2026-05-05" },
      { strasse: "Am Wässerchen", hnr: "5", grabenlaenge: 5, datum: "2026-05-05" },
      { strasse: "Am Wässerchen", hnr: "8", grabenlaenge: 3, datum: "2026-05-05" },
      { strasse: "Thomas-Müntzer-Str.", hnr: "8", grabenlaenge: 13, datum: "2026-05-05" },
      { strasse: "Thomas-Müntzer-Str.", hnr: "9", grabenlaenge: 15, datum: "2026-05-05" },
      { strasse: "Thomas-Müntzer-Str.", hnr: "10", grabenlaenge: 10, datum: "2026-05-05" },
      { strasse: "Thomas-Müntzer-Str.", hnr: "11", grabenlaenge: 7, datum: "2026-05-05" },
      { strasse: "Thomas-Müntzer-Str.", hnr: "19", grabenlaenge: 6, datum: "2026-05-05" },
      { strasse: "Goethestr.", hnr: "6", grabenlaenge: 15, datum: "2026-05-05" },
      { strasse: "Goethestr.", hnr: "8", grabenlaenge: 9, datum: "2026-05-05" },
      { strasse: "Goethestr.", hnr: "30", grabenlaenge: 1, datum: "2026-05-05" },
      { strasse: "Steinstr.", hnr: "15", grabenlaenge: 2, datum: "2026-05-05" },
      // 04.05.2026
      { strasse: "Arternsches Tor", hnr: "9", grabenlaenge: 3, datum: "2026-05-04" },
      { strasse: "Mühlstr.", hnr: "4", grabenlaenge: 1, datum: "2026-05-04" },
      { strasse: "Mühlstr.", hnr: "27", grabenlaenge: 1, datum: "2026-05-04" },
      { strasse: "Mühlstr.", hnr: "10", grabenlaenge: 1, datum: "2026-05-04" },
      { strasse: "Thomas-Müntzer-Str.", hnr: "12", grabenlaenge: 12, datum: "2026-05-04" },
      { strasse: "Thomas-Müntzer-Str.", hnr: "23", grabenlaenge: 11, datum: "2026-05-04" },
      { strasse: "Arternsches Tor", hnr: "19", grabenlaenge: 23, datum: "2026-05-04" },
      { strasse: "Mühlstr.", hnr: "11", grabenlaenge: 1, datum: "2026-05-04" },
      { strasse: "Mühlstr.", hnr: "2", grabenlaenge: 1, datum: "2026-05-04" },
      { strasse: "Mühlstr.", hnr: "18", grabenlaenge: 1, datum: "2026-05-04" },
      { strasse: "Hauptstr.", hnr: "65", grabenlaenge: 1, datum: "2026-05-04" },
      { strasse: "Mühlstr.", hnr: "25", grabenlaenge: 1, datum: "2026-05-04" },
    ];

    try {
      const { data: contacts, error } = await supabase
        .from("contacts")
        .select("bid,strasse,hnr")
        .range(0, 9999);
      if (error) { append(`❌ ${error.message}`); setBusy(false); return; }

      const norm = (s: string) => s.trim().toLowerCase();
      const map = new Map<string, string>();
      for (const c of (contacts ?? []) as { bid: string; strasse: string; hnr: string }[]) {
        map.set(`${norm(c.strasse)}|${norm(c.hnr)}`, c.bid);
      }

      let ok = 0, miss = 0;
      for (const r of data) {
        const bid = map.get(`${norm(r.strasse)}|${norm(r.hnr)}`);
        if (!bid) {
          append(`  ⚠ nicht gefunden: ${r.strasse} ${r.hnr}`);
          miss++;
          continue;
        }
        // load existing call_state to preserve fields
        const { data: existing } = await supabase
          .from("call_states")
          .select("*")
          .eq("bid", bid)
          .maybeSingle();
        const { error: upErr } = await supabase
          .from("call_states")
          .upsert(
            {
              bid,
              status: "erledigt" as const,
              termin_slot: existing?.termin_slot ?? "",
              termin_datum: existing?.termin_datum ?? null,
              termin_zeit: existing?.termin_zeit ?? "",
              notiz: existing?.notiz ?? "",
              klarfall: existing?.klarfall ?? false,
              klarfall_notiz: existing?.klarfall_notiz ?? "",
              grabenlaenge: r.grabenlaenge,
            },
            { onConflict: "bid" },
          );
        if (upErr) { append(`  ⚠ ${r.strasse} ${r.hnr}: ${upErr.message}`); continue; }

        // Set doku durchfuehrt_am date
        const { data: dExisting } = await supabase
          .from("doku_states")
          .select("*")
          .eq("bid", bid)
          .maybeSingle();
        await supabase.from("doku_states").upsert(
          {
            bid,
            foto: dExisting?.foto ?? false,
            protokoll: dExisting?.protokoll ?? false,
            sharepoint: dExisting?.sharepoint ?? false,
            durchfuehrt_von: dExisting?.durchfuehrt_von ?? "",
            durchfuehrt_am: `${r.datum}T08:00:00.000Z`,
            notiz: dExisting?.notiz ?? "",
          },
          { onConflict: "bid" },
        );
        ok++;
        append(`  ✓ ${r.strasse} ${r.hnr} → ${r.grabenlaenge} m (${r.datum})`);
      }
      append(`✅ Fertig: ${ok} aktualisiert, ${miss} ohne Match`);
    } catch (e) {
      append(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function counts() {
    const [{ count: cContacts }, { count: cStates }] = await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase.from("call_states").select("*", { count: "exact", head: true }),
    ]);
    append(`Datenbank: ${cContacts ?? "?"} Kontakte, ${cStates ?? "?"} Status-Einträge`);
  }

  return (
    <div style={{ fontFamily: "system-ui,sans-serif", maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>⚙️ Admin · Call-Liste</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
        Einmalige Import- und Markierungs-Aktionen. Zur App: <a href="/" style={{ color: "#e20074" }}>zurück zur Call-Liste</a>
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <button onClick={counts} disabled={busy} style={btn("#1f2937")}>📊 Datenbank-Stand prüfen</button>
        <button onClick={importContacts} disabled={busy} style={btn("#e20074")}>
          1️⃣ Kontakte aus Excel importieren (541 Einträge)
        </button>
        <button onClick={applyMarkings} disabled={busy} style={btn("#16a34a")}>
          2️⃣ Hauptstr. 3/15/17/46/47 → Erledigt &nbsp;·&nbsp; Hauptstr. 9 → Mi VM
        </button>
        <button onClick={migrateSchmueckeErledigt} disabled={busy} style={btn("#2563eb")}>
          3️⃣ An der Schmücke: 203 „erledigt"-Einträge importieren
        </button>
        <button onClick={importGrabenlaengen} disabled={busy} style={btn("#a16207")}>
          5️⃣ Grabenlängen importieren (37 Objekte · 04.–06.05.)
        </button>

        <label style={{ ...btn("#0891b2"), display: "block" }}>
          6️⃣ Master-CSV (Schmücke) hochladen · Zustimmung + Auskundung aktualisieren
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importMasterCsv(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <div style={{ background: "#0f172a", color: "#a7f3d0", padding: 12, borderRadius: 8, fontFamily: "ui-monospace,monospace", fontSize: 12, minHeight: 200, whiteSpace: "pre-wrap" }}>
        {log.length === 0 ? <span style={{ color: "#475569" }}>Logs erscheinen hier…</span> : log.join("\n")}
      </div>
    </div>
  );
}

const btn = (color: string): React.CSSProperties => ({
  background: color, color: "white", border: "none", borderRadius: 8, padding: "12px 16px",
  fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left",
});
