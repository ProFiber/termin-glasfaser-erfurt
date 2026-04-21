import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Contact, CallState, CallStatus } from "@/lib/types";

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

const SLOT_DAYS = [
  { day: "Di 21.04.", vm: "di-vm", nm: "di-nm" },
  { day: "Mi 22.04.", vm: "mi-vm", nm: "mi-nm" },
  { day: "Do 23.04.", vm: "do-vm", nm: "do-nm" },
  { day: "Fr 24.04.", vm: "fr-vm", nm: "fr-nm" },
  { day: "Sa 25.04.", vm: "sa-vm", nm: "sa-nm" },
];

const SLOT_LABEL: Record<string, string> = {
  "di-vm": "Di VM", "di-nm": "Di NM",
  "mi-vm": "Mi VM", "mi-nm": "Mi NM",
  "do-vm": "Do VM", "do-nm": "Do NM",
  "fr-vm": "Fr VM", "fr-nm": "Fr NM",
  "sa-vm": "Sa VM", "sa-nm": "Sa NM",
};

const STATUS_META: Record<CallStatus, { label: string; dot: string }> = {
  offen:         { label: "Offen",          dot: "#9ca3af" },
  angerufen:     { label: "Angerufen",      dot: "#facc15" },
  termin:        { label: "✅ Termin",       dot: "#22c55e" },
  nichtErreicht: { label: "Nicht erreicht", dot: "#fb923c" },
  abgelehnt:     { label: "Abgelehnt",      dot: "#ef4444" },
  erledigt:      { label: "✓ Erledigt",     dot: "#3b82f6" },
};

const cardBorder = (st: CallStatus) =>
  ({ termin: "#22c55e", abgelehnt: "#ef4444", nichtErreicht: "#fb923c", angerufen: "#facc15", erledigt: "#3b82f6", offen: "#e5e7eb" }[st]);
const cardBg = (st: CallStatus) =>
  ({ termin: "#f0fff6", abgelehnt: "#fff5f5", nichtErreicht: "#fffbf0", erledigt: "#eff6ff" } as Record<string, string>)[st] || "white";

const lastName = (name: string) => name.trim().split(/\s+/).pop() || name;

function Index() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [states, setStates] = useState<Record<string, CallState>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"alle" | CallStatus>("alle");
  const [street, setStreet] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [flash, setFlash] = useState<"saving" | "saved" | "error" | null>(null);
  const flashTimer = useRef<number | null>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: cs, error: e1 }, { data: ss, error: e2 }] = await Promise.all([
        supabase.from("contacts").select("*").order("strasse").order("hnr"),
        supabase.from("call_states").select("*"),
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
      setLoading(false);
    })();
    return () => { cancelled = true; };
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

  async function patch(bid: string, changes: Partial<Pick<CallState, "status" | "termin_slot" | "notiz">>) {
    const prev = states[bid];
    const optimistic: CallState = {
      bid,
      status: changes.status ?? prev?.status ?? "offen",
      termin_slot: changes.termin_slot ?? prev?.termin_slot ?? "",
      notiz: changes.notiz ?? prev?.notiz ?? "",
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
          notiz: optimistic.notiz,
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

  const streets = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.strasse))).sort(),
    [contacts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      const st = (states[c.bid]?.status ?? "offen") as CallStatus;
      if (filter !== "alle" && st !== filter) return false;
      if (street !== "alle" && c.strasse !== street) return false;
      if (q) {
        const hay = `${c.name} ${c.strasse} ${c.hnr}${c.hnr_zusatz}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contacts, states, filter, street, search]);

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

  return (
    <div style={{ fontFamily: "system-ui,-apple-system,sans-serif", maxWidth: 480, margin: "0 auto", background: "#f2f2f7", minHeight: "100vh" }}>
      {/* HEADER */}
      <div style={{ background: "#e20074", color: "white", padding: "12px 16px", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ fontSize: 11, opacity: 0.75, letterSpacing: 0.3 }}>An der Schmücke · Glasfaser · Störmer Bau · ☁️ Cloud-Sync</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>📞 Call-Liste</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {flash === "saving" && <span style={{ fontSize: 11, background: "rgba(255,255,255,0.22)", borderRadius: 8, padding: "2px 8px" }}>⏳ Speichern…</span>}
            {flash === "saved" && <span style={{ fontSize: 11, background: "rgba(255,255,255,0.22)", borderRadius: 8, padding: "2px 8px" }}>☁️ gespeichert</span>}
            {flash === "error" && <span style={{ fontSize: 11, background: "#dc2626", borderRadius: 8, padding: "2px 8px" }}>⚠️ Fehler</span>}
            <span style={{ background: counts.termin >= 4 ? "#16a34a" : "rgba(255,255,255,0.22)", borderRadius: 20, padding: "3px 12px", fontSize: 14, fontWeight: 800 }}>
              {counts.termin} / 4 ✓
            </span>
          </div>
        </div>
      </div>

      {/* SEARCH + FILTER */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Name, Straße oder Hausnummer…"
          style={{ width: "100%", borderRadius: 8, border: "1px solid #ddd", padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          <button onClick={() => setStreet("alle")} style={chip(street === "alle", "#e20074")}>Alle Straßen</button>
          {streets.map((s) => (
            <button key={s} onClick={() => setStreet(s)} style={chip(street === s, "#e20074")}>{s}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
          {(["alle", "offen", "angerufen", "nichtErreicht", "termin", "erledigt", "abgelehnt"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={pill(filter === f)}>
              {f === "alle" ? "Alle" : STATUS_META[f as CallStatus].label}
            </button>
          ))}
        </div>
      </div>

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
          const note = cs?.notiz ?? "";
          const open = expanded === c.bid;
          return (
            <div key={c.bid} style={{
              background: cardBg(st),
              borderRadius: 11,
              marginBottom: 8,
              border: `2px solid ${cardBorder(st)}`,
              boxShadow: open ? "0 6px 20px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.07)",
              overflow: "hidden",
            }}>
              <div onClick={() => setExpanded(open ? null : c.bid)}
                style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ width: 11, height: 11, borderRadius: "50%", flexShrink: 0, background: STATUS_META[st].dot }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {c.strasse} {c.hnr}{c.hnr_zusatz}
                    <span style={{ fontWeight: 400, fontSize: 12, color: "#888", marginLeft: 6 }}>
                      {c.typ}{c.we ? ` · ${c.we} WE` : ""}{c.ge ? ` · ${c.ge} GE` : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#444", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  {appt && <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 700, marginTop: 2 }}>🗓 {SLOT_LABEL[appt] ?? appt}</div>}
                </div>
                <div style={{ color: "#bbb", fontSize: 14 }}>{open ? "▲" : "▼"}</div>
              </div>

              {open && (
                <div style={{ borderTop: "1px solid #eee", padding: "12px 12px 14px" }}>
                  <div style={{ background: "#eef2ff", borderRadius: 9, padding: "9px 12px", marginBottom: 12, fontSize: 13, lineHeight: 1.7, color: "#1e293b" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#6366f1", letterSpacing: 1.2, marginBottom: 4 }}>LEITFADEN</div>
                    „Guten Tag Herr/Frau <strong>{lastName(c.name)}</strong>, hier ist Störmer Bau im Auftrag der Telekom.<br />
                    Wir sind aktuell in der <strong>{c.strasse}</strong> und setzen die Glasfaser-Hausanschlüsse um.<br />
                    Passt es Ihnen <strong>diese Woche</strong> – <strong>vormittags ab 7:30 Uhr</strong> oder <strong>nachmittags ab 13 Uhr</strong>?"
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {c.mobil && (
                      <a href={`tel:${c.mobil}`} onClick={() => { if (st === "offen") patch(c.bid, { status: "angerufen" }); }}
                        style={{ flex: 1, background: "#e20074", color: "white", borderRadius: 9, padding: "11px 6px", textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: 14, display: "block" }}>
                        📱 Mobil<br /><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{c.mobil}</span>
                      </a>
                    )}
                    {c.festnetz && c.festnetz !== c.mobil && (
                      <a href={`tel:${c.festnetz}`} onClick={() => { if (st === "offen") patch(c.bid, { status: "angerufen" }); }}
                        style={{ flex: 1, background: "#1f2937", color: "white", borderRadius: 9, padding: "11px 6px", textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: 14, display: "block" }}>
                        ☎️ Festnetz<br /><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{c.festnetz}</span>
                      </a>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
                    {(["nichtErreicht", "abgelehnt", "erledigt"] as const).map((s) => (
                      <button key={s} onClick={() => patch(c.bid, { status: s, ...(s === "erledigt" ? { termin_slot: "" } : {}) })}
                        style={statusBtn(st === s)}>{STATUS_META[s].label}</button>
                    ))}
                  </div>

                  <div style={{ fontSize: 9, fontWeight: 800, color: "#888", letterSpacing: 1, marginBottom: 7 }}>TERMIN</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
                    {SLOT_DAYS.map(({ day, vm, nm }) => (
                      <div key={day} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 62, fontSize: 12, fontWeight: 600, color: "#555", flexShrink: 0 }}>{day}</div>
                        {[[vm, "☀️ Vorm."], [nm, "🌤 Nachm."]].map(([key, lbl]) => (
                          <button key={key} onClick={() => patch(c.bid, { termin_slot: key, status: "termin" })}
                            style={slotBtn(appt === key)}>{lbl}</button>
                        ))}
                      </div>
                    ))}
                  </div>

                  <textarea value={note} onChange={(e) => patch(c.bid, { notiz: e.target.value })}
                    placeholder="Notiz…"
                    style={{ width: "100%", borderRadius: 8, border: "1px solid #ddd", padding: "7px 9px", fontSize: 13, resize: "none", boxSizing: "border-box", height: 54, fontFamily: "inherit" }} />
                  <div style={{ fontSize: 9, color: "#bbb", marginTop: 3, display: "flex", justifyContent: "space-between" }}>
                    <span>BID {c.bid}</span>
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

      {/* BOTTOM BAR */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, background: "white", borderTop: "1px solid #e5e7eb",
        padding: "10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ fontSize: 12, color: "#999" }}>
          {counts.nichtErreicht} n. erreicht · {counts.abgelehnt} abgel. · {counts.erledigt} erled.
        </div>
        <div style={{ fontWeight: 800, fontSize: 15, color: counts.termin >= 4 ? "#16a34a" : "#e20074" }}>
          {counts.termin} Termine ✓
        </div>
      </div>
    </div>
  );
}

const chip = (active: boolean, color: string): React.CSSProperties => ({
  padding: "4px 13px", borderRadius: 16, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  background: active ? color : "#f0f0f0", color: active ? "white" : "#444",
});

const pill = (active: boolean): React.CSSProperties => ({
  padding: "3px 10px", borderRadius: 14, border: "1px solid #ddd", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
  background: active ? "#222" : "white", color: active ? "white" : "#555",
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
