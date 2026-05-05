import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Contact, CallState, DokuState } from "@/lib/types";

type Props = {
  contacts: Contact[];
  callStates: Record<string, CallState>;
};

const PERSONEN = ["FF", "FH", "Brahim", "Sezai", "Halil"];
const MAGENTA = "#e20074";

function score(d: DokuState | undefined): number {
  if (!d) return 0;
  return (d.foto ? 1 : 0) + (d.protokoll ? 1 : 0) + (d.sharepoint ? 1 : 0);
}

function nowLocalDatetime(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function emptyDoku(bid: string): DokuState {
  return {
    bid,
    foto: false,
    protokoll: false,
    sharepoint: false,
    durchfuehrt_von: "",
    durchfuehrt_am: null,
    notiz: "",
    updated_at: new Date().toISOString(),
  };
}

type SortMode = "az" | "nvt" | "manual";
const MANUAL_KEY = "doku_manual_order";

export default function DokuTab({ contacts, callStates }: Props) {
  const [dokuStates, setDokuStates] = useState<Record<string, DokuState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flash, setFlash] = useState<"saving" | "saved" | "error" | null>(null);
  const [onlyToday, setOnlyToday] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [manualOrder, setManualOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(MANUAL_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [shareMenu, setShareMenu] = useState(false);
  const flashTimer = useRef<number | null>(null);

  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    try {
      localStorage.setItem(MANUAL_KEY, JSON.stringify(manualOrder));
    } catch {
      /* ignore */
    }
  }, [manualOrder]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("doku_states").select("*");
      if (cancelled || error) return;
      const map: Record<string, DokuState> = {};
      (data as DokuState[] | null)?.forEach((d) => (map[d.bid] = d));
      setDokuStates(map);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("doku_states_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "doku_states" },
        (payload) => {
          const row = (payload.new ?? payload.old) as DokuState;
          if (!row?.bid) return;
          setDokuStates((prev) => {
            if (payload.eventType === "DELETE") {
              const { [row.bid]: _, ...rest } = prev;
              return rest;
            }
            return { ...prev, [row.bid]: row };
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  function showFlash(kind: "saving" | "saved" | "error") {
    setFlash(kind);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    if (kind !== "saving") {
      flashTimer.current = window.setTimeout(() => setFlash(null), 1400);
    }
  }

  async function patch(bid: string, changes: Partial<DokuState>) {
    const prev = dokuStates[bid] ?? emptyDoku(bid);
    const merged: DokuState = {
      ...prev,
      ...changes,
      bid,
      updated_at: new Date().toISOString(),
    };
    // Auto-set durchfuehrt_am when first checkbox ticked
    const wasEmpty = !prev.foto && !prev.protokoll && !prev.sharepoint;
    const becomesActive = merged.foto || merged.protokoll || merged.sharepoint;
    if (wasEmpty && becomesActive && !merged.durchfuehrt_am) {
      merged.durchfuehrt_am = new Date().toISOString();
    }
    setDokuStates((s) => ({ ...s, [bid]: merged }));
    showFlash("saving");
    const { error } = await supabase
      .from("doku_states")
      .upsert(
        {
          bid,
          foto: merged.foto,
          protokoll: merged.protokoll,
          sharepoint: merged.sharepoint,
          durchfuehrt_von: merged.durchfuehrt_von,
          durchfuehrt_am: merged.durchfuehrt_am,
          notiz: merged.notiz,
        },
        { onConflict: "bid" },
      );
    if (error) {
      console.error("Doku save failed", error);
      setDokuStates((s) => ({ ...s, [bid]: prev }));
      showFlash("error");
    } else {
      showFlash("saved");
    }
  }

  const visible = useMemo(() => {
    const list = contacts.filter((c) => {
      const cs = callStates[c.bid];
      const st = cs?.status;
      if (st !== "erledigt" && st !== "termin") return false;
      if (onlyToday) {
        const d = dokuStates[c.bid];
        const updatedToday = d?.updated_at ? d.updated_at.slice(0, 10) === todayISO : false;
        if (!updatedToday) return false;
      }
      return true;
    });
    if (sortMode === "manual") {
      const idx = new Map(manualOrder.map((bid, i) => [bid, i]));
      return [...list].sort((a, b) => {
        const ia = idx.has(a.bid) ? (idx.get(a.bid) as number) : Number.MAX_SAFE_INTEGER;
        const ib = idx.has(b.bid) ? (idx.get(b.bid) as number) : Number.MAX_SAFE_INTEGER;
        if (ia !== ib) return ia - ib;
        return a.strasse.localeCompare(b.strasse, "de");
      });
    }
    if (sortMode === "nvt") {
      return [...list].sort((a, b) => {
        const na = (a.nvt || "").localeCompare(b.nvt || "", "de");
        if (na !== 0) return na;
        const s = a.strasse.localeCompare(b.strasse, "de");
        if (s !== 0) return s;
        return (parseInt(a.hnr, 10) || 0) - (parseInt(b.hnr, 10) || 0);
      });
    }
    // A-Z default
    return [...list].sort((a, b) => {
      const s = a.strasse.localeCompare(b.strasse, "de");
      if (s !== 0) return s;
      return (parseInt(a.hnr, 10) || 0) - (parseInt(b.hnr, 10) || 0);
    });
  }, [contacts, callStates, dokuStates, onlyToday, todayISO, sortMode, manualOrder]);

  function moveManual(bid: string, dir: -1 | 1) {
    setManualOrder((prev) => {
      const ids = visible.map((c) => c.bid);
      // ensure all visible present in order list
      const base = [...prev.filter((b) => ids.includes(b))];
      ids.forEach((b) => {
        if (!base.includes(b)) base.push(b);
      });
      const i = base.indexOf(bid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= base.length) return base;
      [base[i], base[j]] = [base[j], base[i]];
      return base;
    });
  }

  const total = visible.length;
  const done = visible.filter((c) => score(dokuStates[c.bid]) === 3).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const flashIcon = flash === "saving" ? "⏳" : flash === "saved" ? "☁️" : flash === "error" ? "⚠️" : "";

  function shareWhatsApp() {
    // Group eligible contacts (erledigt or termin) by NVT
    const eligible = contacts.filter((c) => {
      const st = callStates[c.bid]?.status;
      return st === "erledigt" || st === "termin";
    });
    const groups = new Map<string, Contact[]>();
    eligible.forEach((c) => {
      const key = `${c.nvt || "—"} · ${c.ort || ""}`.trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    });

    type Row = {
      label: string;
      total: number;
      complete: number;
      foto: number;
      protokoll: number;
      sharepoint: number;
      pct: number;
    };
    const rows: Row[] = [];
    groups.forEach((list, label) => {
      let complete = 0, foto = 0, protokoll = 0, sharepoint = 0;
      list.forEach((c) => {
        const d = dokuStates[c.bid];
        if (d?.foto) foto++;
        if (d?.protokoll) protokoll++;
        if (d?.sharepoint) sharepoint++;
        if (score(d) === 3) complete++;
      });
      const total = list.length;
      const pct = total === 0 ? 0 : Math.round((complete / total) * 100);
      rows.push({ label, total, complete, foto, protokoll, sharepoint, pct });
    });
    rows.sort((a, b) => b.pct - a.pct);

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const stamp = `${dd}.${mm}.${yyyy} · ${hh}:${mi} Uhr`;

    const totalAll = eligible.length;
    const completeAll = eligible.filter((c) => score(dokuStates[c.bid]) === 3).length;
    const offen = totalAll - completeAll;

    function bar(pct: number) {
      const filled = Math.round((pct / 100) * 10);
      return "▓".repeat(filled) + "░".repeat(10 - filled);
    }

    const lines: string[] = [];
    lines.push("📋 *Doku-Status · An der Schmücke*");
    lines.push(`_Stand: ${stamp}_`);
    lines.push("");
    lines.push(`✅ *${completeAll} / ${totalAll} vollständig dokumentiert*`);
    lines.push("");
    lines.push("📊 *Fortschritt pro NVT:*");
    rows.forEach((r) => {
      lines.push(
        `${r.label} ${bar(r.pct)} ${r.pct}%  ✅${r.complete} 📷${r.foto} 📄${r.protokoll} ☁️${r.sharepoint}`,
      );
    });
    lines.push("");
    lines.push(`❌ *Noch nicht dokumentiert: ${offen} Objekte*`);
    lines.push("");
    lines.push("_Störmer Bau · Pro-Fiber_");

    const text = lines.join("\n");
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  }

  function shareReport(scope: "alle" | "heute") {
    const eligible = contacts.filter((c) => {
      const st = callStates[c.bid]?.status;
      if (st !== "erledigt" && st !== "termin") return false;
      const d = dokuStates[c.bid];
      const documented = score(d) > 0;
      if (!documented) return false;
      if (scope === "heute") {
        return d?.updated_at ? d.updated_at.slice(0, 10) === todayISO : false;
      }
      return true;
    });

    eligible.sort((a, b) =>
      a.strasse.localeCompare(b.strasse, "de") ||
      (parseInt(a.hnr, 10) || 0) - (parseInt(b.hnr, 10) || 0),
    );

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const datum = `${dd}.${mm}.${yyyy}`;
    const uhr = `${hh}:${mi} Uhr`;

    const lines: string[] = [];
    lines.push("📋 *Doku-Bericht · An der Schmücke*");
    lines.push(`_${datum} · ${uhr}_`);
    lines.push("");
    lines.push(`✅ *${eligible.length} Objekte dokumentiert*`);
    lines.push("");

    eligible.forEach((c) => {
      const d = dokuStates[c.bid] ?? emptyDoku(c.bid);
      lines.push(`*${c.strasse} ${c.hnr}${c.hnr_zusatz}* — ${c.name}`);
      lines.push(
        `📷 ${d.foto ? "✓" : "✗"} · 📄 ${d.protokoll ? "✓" : "✗"} · ☁️ ${d.sharepoint ? "✓" : "✗"}`,
      );
      const von = d.durchfuehrt_von || "—";
      let am = "—";
      if (d.durchfuehrt_am) {
        const dt = new Date(d.durchfuehrt_am);
        const dD = String(dt.getDate()).padStart(2, "0");
        const dM = String(dt.getMonth() + 1).padStart(2, "0");
        const dH = String(dt.getHours()).padStart(2, "0");
        const dMi = String(dt.getMinutes()).padStart(2, "0");
        am = `${dD}.${dM}. ${dH}:${dMi}`;
      }
      lines.push(`👤 ${von} · 🕐 ${am}`);
      lines.push("");
    });

    lines.push("_Pro-Fiber · Störmer Bau_");
    window.open("https://wa.me/?text=" + encodeURIComponent(lines.join("\n")), "_blank");
    setShareMenu(false);
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", padding: 12 }}>
      {/* Header */}
      <div
        style={{
          background: "white",
          borderRadius: 11,
          padding: 14,
          marginBottom: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
            {done} / {total} vollständig dokumentiert
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
            <div style={{ fontSize: 14 }}>{flashIcon}</div>
            <button
              onClick={() => setShareMenu((v) => !v)}
              style={{
                background: "#25D366",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              💬 Teilen
            </button>
            {shareMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 6,
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                  zIndex: 10,
                  minWidth: 180,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={shareWhatsApp}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#0f172a" }}
                >
                  📊 Status (NVT)
                </button>
                <button
                  onClick={() => shareReport("alle")}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderTop: "1px solid #f1f5f9", background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#0f172a" }}
                >
                  📋 Alle teilen
                </button>
                <button
                  onClick={() => shareReport("heute")}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderTop: "1px solid #f1f5f9", background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#0f172a" }}
                >
                  📅 Nur heute teilen
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={{ height: 10, background: "#e5e7eb", borderRadius: 6, overflow: "hidden" }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "#22c55e",
              transition: "width 0.3s",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            onClick={() => setOnlyToday(false)}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${!onlyToday ? MAGENTA : "#e5e7eb"}`,
              background: !onlyToday ? MAGENTA : "white",
              color: !onlyToday ? "white" : "#475569",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Alle
          </button>
          <button
            onClick={() => setOnlyToday(true)}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${onlyToday ? MAGENTA : "#e5e7eb"}`,
              background: onlyToday ? MAGENTA : "white",
              color: onlyToday ? "white" : "#475569",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            📅 Heute
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {([
            ["az", "A–Z"],
            ["nvt", "NVT"],
            ["manual", "Manuell"],
          ] as const).map(([k, label]) => {
            const active = sortMode === k;
            return (
              <button
                key={k}
                onClick={() => setSortMode(k)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: `1px solid ${active ? MAGENTA : "#e5e7eb"}`,
                  background: active ? MAGENTA : "white",
                  color: active ? "white" : "#475569",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards */}
      {visible.length === 0 && (
        <div style={{ textAlign: "center", color: "#64748b", padding: 24 }}>
          Keine Termine zur Dokumentation.
        </div>
      )}

      {visible.map((c) => {
        const d = dokuStates[c.bid] ?? emptyDoku(c.bid);
        const sc = score(d);
        const complete = sc === 3;
        const isOpen = expanded === c.bid;
        const cs = callStates[c.bid];
        const slot = cs?.termin_slot;
        const anyActive = d.foto || d.protokoll || d.sharepoint;

        const borderColor = complete ? "#22c55e" : sc > 0 ? "#facc15" : "#e5e7eb";

        return (
          <div
            key={c.bid}
            style={{
              background: "white",
              borderRadius: 11,
              border: `2px solid ${borderColor}`,
              padding: 12,
              marginBottom: 10,
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            {/* Header row */}
            <div
              onClick={() => setExpanded(isOpen ? null : c.bid)}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            >
              {/* Circular indicator */}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: complete ? "#22c55e" : sc > 0 ? "#facc15" : "#e5e7eb",
                  color: complete ? "white" : "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: complete ? 22 : 13,
                  flexShrink: 0,
                }}
              >
                {complete ? "✓" : `${sc}/3`}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
                  {c.strasse} {c.hnr}
                  {c.hnr_zusatz}
                </div>
                <div style={{ fontSize: 13, color: "#475569" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {slot ? slot.toUpperCase() : "—"} ·{" "}
                  <span>📷 {d.foto ? "✓" : "—"}</span> ·{" "}
                  <span>📄 {d.protokoll ? "✓" : "—"}</span> ·{" "}
                  <span>☁️ {d.sharepoint ? "✓" : "—"}</span>
                </div>
              </div>
              {sortMode === "manual" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => moveManual(c.bid, -1)}
                    aria-label="Nach oben"
                    style={{ width: 28, height: 24, borderRadius: 6, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#475569" }}
                  >↑</button>
                  <button
                    onClick={() => moveManual(c.bid, 1)}
                    aria-label="Nach unten"
                    style={{ width: 28, height: 24, borderRadius: 6, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#475569" }}
                  >↓</button>
                </div>
              )}
              <div style={{ color: "#94a3b8", fontSize: 18 }}>{isOpen ? "▾" : "▸"}</div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 12, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                {/* 3 large checkbox buttons */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {([
                    ["foto", "📷", "Foto"],
                    ["protokoll", "📄", "Protokoll"],
                    ["sharepoint", "☁️", "SharePoint"],
                  ] as const).map(([key, icon, label]) => {
                    const active = d[key];
                    return (
                      <button
                        key={key}
                        onClick={() => patch(c.bid, { [key]: !active } as Partial<DokuState>)}
                        style={{
                          padding: "12px 6px",
                          borderRadius: 10,
                          border: `2px solid ${active ? "#22c55e" : "#e5e7eb"}`,
                          background: active ? "#f0fff6" : "white",
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: 13,
                          color: active ? "#15803d" : "#475569",
                        }}
                      >
                        <div style={{ fontSize: 22 }}>{icon}</div>
                        <div>{label}</div>
                        <div style={{ fontSize: 11, marginTop: 2 }}>{active ? "✓" : "—"}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    height: 8,
                    background: "#e5e7eb",
                    borderRadius: 4,
                    overflow: "hidden",
                    marginTop: 12,
                  }}
                >
                  <div
                    style={{
                      width: `${(sc / 3) * 100}%`,
                      height: "100%",
                      background: complete ? "#22c55e" : sc > 0 ? "#facc15" : "#9ca3af",
                      transition: "width 0.3s",
                    }}
                  />
                </div>

                {anyActive && (
                  <>
                    <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "#475569" }}>
                      Durchgeführt von
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {PERSONEN.map((p) => {
                        const active = d.durchfuehrt_von === p;
                        return (
                          <button
                            key={p}
                            onClick={() => patch(c.bid, { durchfuehrt_von: active ? "" : p })}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: `1px solid ${active ? MAGENTA : "#e5e7eb"}`,
                              background: active ? MAGENTA : "white",
                              color: active ? "white" : "#475569",
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#475569" }}>
                      Durchgeführt am
                    </div>
                    <input
                      type="datetime-local"
                      value={
                        d.durchfuehrt_am
                          ? (() => {
                              const dt = new Date(d.durchfuehrt_am);
                              dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
                              return dt.toISOString().slice(0, 16);
                            })()
                          : nowLocalDatetime()
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        const iso = v ? new Date(v).toISOString() : null;
                        patch(c.bid, { durchfuehrt_am: iso });
                      }}
                      style={{
                        marginTop: 4,
                        width: "100%",
                        padding: "8px 10px",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        fontSize: 14,
                        fontFamily: "inherit",
                      }}
                    />

                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#475569" }}>
                      Notiz
                    </div>
                    <textarea
                      value={d.notiz}
                      onChange={(e) => patch(c.bid, { notiz: e.target.value })}
                      placeholder="Besonderheiten, Probleme, Hinweise…"
                      rows={3}
                      style={{
                        marginTop: 4,
                        width: "100%",
                        padding: "8px 10px",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        fontSize: 14,
                        fontFamily: "inherit",
                        resize: "vertical",
                      }}
                    />
                  </>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <a
                    href={`https://www.google.com/maps?q=${encodeURIComponent(
                      `${c.strasse} ${c.hnr}${c.hnr_zusatz}, ${c.plz} ${c.ort}`,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "10px",
                      borderRadius: 8,
                      background: "#f1f5f9",
                      color: "#0f172a",
                      textDecoration: "none",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    🗺️ Streetview
                  </a>
                  {c.mobil && (
                    <a
                      href={`tel:${c.mobil}`}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        padding: "10px",
                        borderRadius: 8,
                        background: MAGENTA,
                        color: "white",
                        textDecoration: "none",
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      📱 Anrufen
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
