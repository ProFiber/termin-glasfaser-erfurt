import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
