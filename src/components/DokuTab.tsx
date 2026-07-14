import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Contact, CallState, DokuState, NachforderungGrund, PruefungStatus } from "@/lib/types";
import { deriveDokuStatus, DOKU_STATUS_META, fehlendeDoks, tageInPruefung, type DokuStatus } from "@/lib/dokuStatus";
import GrabenStepper from "@/components/GrabenStepper";
import LocalNotizTextarea from "@/components/LocalNotizTextarea";
import StreetViewImage from "@/components/StreetViewImage";

type Props = {
  contacts: Contact[];
  callStates: Record<string, CallState>;
  focusBid?: string | null;
  onClearFocus?: () => void;
};

type KlarfallKey =
  | "auskundung"    // gebaut ohne Auskundung (5 = kritischster)
  | "ohneAuftrag"   // erledigt, aber kein GF+ Eintrag im Telekom Glasfaser-Plus-Portal
  | "fotoFehlt"
  | "protokollFehlt"
  | "zustimmungFehlt"
  | "nachforderung" // AG hat zurückgewiesen
  | "manuell";      // klarfall=true

type NoMatchRow = { strasse: string; hnr: string; details: unknown };


const PERSONEN = ["FF", "FH", "Brahim", "Sezai", "Jozey"];
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
    gf_plus: true,
    durchfuehrt_von: "",
    durchfuehrt_am: null,
    notiz: "",
    updated_at: new Date().toISOString(),
  };
}

type SortMode = "az" | "nvt" | "manual";
const MANUAL_KEY = "doku_manual_order";

export default function DokuTab({ contacts: contactsProp, callStates, focusBid, onClearFocus }: Props) {
  const [quelleOverride, setQuelleOverride] = useState<Record<string, "gf_plus" | "bulk">>({});
  const contacts = useMemo(
    () => contactsProp.map((c) => quelleOverride[c.bid] ? { ...c, auftragsquelle: quelleOverride[c.bid] } : c),
    [contactsProp, quelleOverride],
  );
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
  const [klarfallFilter, setKlarfallFilter] = useState<KlarfallKey | null>(null);
  const [nurUnverguetet, setNurUnverguetet] = useState<boolean>(true);
  const [noMatch, setNoMatch] = useState<NoMatchRow[]>([]);
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
      const [{ data: doku }, { data: nm }] = await Promise.all([
        supabase.from("doku_states").select("*"),
        supabase.from("import_log")
          .select("strasse,hnr,details")
          .eq("quelle", "excel_alle_gf_ha")
          .eq("status", "no_match"),
      ]);
      if (cancelled) return;
      const map: Record<string, DokuState> = {};
      (doku as DokuState[] | null)?.forEach((d) => (map[d.bid] = d));
      setDokuStates(map);
      setNoMatch((nm as NoMatchRow[]) || []);
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

  useEffect(() => {
    if (focusBid) setExpanded(focusBid);
  }, [focusBid]);

  // Klärfall-Kategorien berechnen (live aus vorhandenen Daten)
  // Basis-Filter (analog Excel „Alle GF+ HA"): Ort = An der Schmücke,
  // Status = erledigt, Vergütet leer. Nicht-vergütet ist der Kern der Klärfälle
  // — sobald ein HA vergütet ist, ist er endgültig abgeschlossen.
  const kategorien = useMemo(() => {
    const auskundung: Contact[] = [];
    const fotoFehlt: Contact[] = [];    // FotoGIS ≠ Ja
    const protokollFehlt: Contact[] = []; // Protokoll ≠ Ja
    const zustimmungFehlt: Contact[] = []; // Zustimmung ≠ Ja (Nein oder leer)
    const nachforderung: Contact[] = [];
    const manuell: Contact[] = [];
    const ohneAuftrag: Contact[] = []; // GF+ ≠ Ja
    for (const c of contacts) {
      const cs = callStates[c.bid];
      if (!cs) continue;
      // Manuelle Klärfälle unabhängig vom Status
      if (cs.klarfall) manuell.push(c);
      // Auskundung offen: unabhängig vom Status
      if (c.auskundung_erforderlich && !c.auskundung_erfolgt) auskundung.push(c);
      // Basis-Filter für die 4 Excel-Klärfälle
      if (cs.status !== "erledigt") continue;
      if (nurUnverguetet && cs.verguetet_am) continue; // Toggle: nur unvergütete zeigen
      if ((c.ort || "").trim() !== "An der Schmücke") continue;
      const d = dokuStates[c.bid];
      if (!d?.foto) fotoFehlt.push(c);
      if (!d?.protokoll) protokollFehlt.push(c);
      if (!d?.gf_plus) ohneAuftrag.push(c);
      const z = (c.zustimmung || "").trim().toUpperCase();
      if (z !== "AGREED") zustimmungFehlt.push(c);
      if (cs.pruefung_status === "nachforderung") nachforderung.push(c);
    }
    return { auskundung, fotoFehlt, protokollFehlt, zustimmungFehlt, nachforderung, manuell, ohneAuftrag };
  }, [contacts, callStates, dokuStates, nurUnverguetet]);

  // Doku-Status pro erledigtem HA (live berechnet aus Excel-Rohfeldern)
  type FokusEintrag = {
    contact: Contact;
    status: DokuStatus;
    fehlend: string[];
    tage: number | null;
  };
  const fokus = useMemo(() => {
    const unvollstaendig: FokusEintrag[] = [];
    const langeInPruefung: FokusEintrag[] = [];
    for (const c of contacts) {
      const cs = callStates[c.bid];
      if (!cs || cs.status !== "erledigt") continue;
      const d = dokuStates[c.bid];
      const st = deriveDokuStatus({
        foto: !!d?.foto,
        protokoll: !!d?.protokoll,
        sharepoint: !!d?.sharepoint,
        eingereicht_am: cs.eingereicht_am,
        aufmass_am: cs.aufmass_am,
      });
      if (st === "unvollstaendig") {
        unvollstaendig.push({
          contact: c,
          status: st,
          fehlend: fehlendeDoks({ foto: !!d?.foto, protokoll: !!d?.protokoll, sharepoint: !!d?.sharepoint }),
          tage: tageInPruefung(cs.eingereicht_am),
        });
      } else if (st === "inPruefung") {
        const t = tageInPruefung(cs.eingereicht_am);
        if (t !== null && t > 7) {
          langeInPruefung.push({ contact: c, status: st, fehlend: [], tage: t });
        }
      }
    }
    // Sortierung: kritischste zuerst (mehr fehlende / mehr Tage)
    unvollstaendig.sort((a, b) => b.fehlend.length - a.fehlend.length || (b.tage ?? 0) - (a.tage ?? 0));
    langeInPruefung.sort((a, b) => (b.tage ?? 0) - (a.tage ?? 0));
    return { unvollstaendig, langeInPruefung };
  }, [contacts, callStates, dokuStates]);

  const bidsInFilter = useMemo(() => {
    if (!klarfallFilter) return null;
    const map: Record<KlarfallKey, Contact[]> = {
      auskundung: kategorien.auskundung,
      ohneAuftrag: kategorien.ohneAuftrag,
      fotoFehlt: kategorien.fotoFehlt,
      protokollFehlt: kategorien.protokollFehlt,
      zustimmungFehlt: kategorien.zustimmungFehlt,
      nachforderung: kategorien.nachforderung,
      manuell: kategorien.manuell,
    };
    return new Set(map[klarfallFilter].map((c) => c.bid));
  }, [klarfallFilter, kategorien]);

  const visible = useMemo(() => {
    if (focusBid) {
      const c = contacts.find((x) => x.bid === focusBid);
      return c ? [c] : [];
    }
    const list = contacts.filter((c) => {
      const cs = callStates[c.bid];
      const st = cs?.status;
      // Bei aktivem Klärfall-Filter: alle Statūs zulassen, damit z.B. manuelle Klärfälle sichtbar sind
      if (bidsInFilter) {
        if (!bidsInFilter.has(c.bid)) return false;
      } else {
        if (st !== "erledigt" && st !== "termin") return false;
      }
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
  }, [contacts, callStates, dokuStates, onlyToday, todayISO, sortMode, manualOrder, focusBid, bidsInFilter]);


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
      {/* Kompakter Header — Progress + Teilen */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
          padding: "8px 10px", background: "white", borderRadius: 10,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{done}/{total}</span>
            <span style={{ fontSize: 11, color: "#64748b" }}>dokumentiert · {pct}%</span>
            {flashIcon && <span style={{ fontSize: 12, marginLeft: "auto" }}>{flashIcon}</span>}
          </div>
          <div style={{ height: 5, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#22c55e", transition: "width .3s" }} />
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShareMenu((v) => !v)}
            style={{
              background: "#25D366", color: "white", border: "none", borderRadius: 8,
              padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
          >💬 Teilen</button>
          {shareMenu && (
            <div
              style={{
                position: "absolute", top: "100%", right: 0, marginTop: 6, background: "white",
                border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                zIndex: 10, minWidth: 180, overflow: "hidden",
              }}
            >
              <button onClick={shareWhatsApp} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#0f172a" }}>📊 Status (NVT)</button>
              <button onClick={() => shareReport("alle")} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderTop: "1px solid #f1f5f9", background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#0f172a" }}>📋 Alle teilen</button>
              <button onClick={() => shareReport("heute")} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderTop: "1px solid #f1f5f9", background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#0f172a" }}>📅 Nur heute teilen</button>
            </div>
          )}
        </div>
      </div>

      {/* Kompakter Filter/Sort-Bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "white", borderRadius: 8, padding: 3, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          {([[false, "Alle"], [true, "📅 Heute"]] as const).map(([v, l]) => (
            <button key={String(v)} onClick={() => setOnlyToday(v)}
              style={{
                padding: "5px 10px", borderRadius: 6, border: "none",
                background: onlyToday === v ? MAGENTA : "transparent",
                color: onlyToday === v ? "white" : "#475569",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, background: "white", borderRadius: 8, padding: 3, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          {([["az", "A–Z"], ["nvt", "NVT"], ["manual", "Manuell"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSortMode(k)}
              style={{
                padding: "5px 10px", borderRadius: 6, border: "none",
                background: sortMode === k ? MAGENTA : "transparent",
                color: sortMode === k ? "white" : "#475569",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>{l}</button>
          ))}
        </div>
      </div>

      {/* KLÄRFÄLLE — Blocker die die Zahlung verhindern */}
      {!focusBid && (
        <KlaerfaelleKacheln
          kategorien={kategorien}
          nurUnverguetet={nurUnverguetet}
          onToggleUnverguetet={() => setNurUnverguetet((v) => !v)}
          noMatchCount={noMatch.length}
          active={klarfallFilter}
          onSelect={(k) => setKlarfallFilter(k === klarfallFilter ? null : k)}
          onShowNoMatch={() => alert(
            "Objekte in Excel, die keinem Kontakt in der DB zugeordnet werden konnten:\n\n" +
            (noMatch.length === 0
              ? "Keine offenen Fälle."
              : noMatch.map((n) => `• ${n.strasse ?? "?"} ${n.hnr ?? ""}`).join("\n"))
          )}
        />
      )}

      {focusBid && onClearFocus && (
        <button
          type="button"
          onClick={onClearFocus}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "10px 12px",
            marginBottom: 10,
            background: "#fef3c7",
            color: "#92400e",
            border: "1px solid #fcd34d",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ← Alle Objekte anzeigen
        </button>
      )}

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

        const dokuStatus: DokuStatus = deriveDokuStatus({
          foto: !!d.foto, protokoll: !!d.protokoll, sharepoint: !!d.sharepoint,
          eingereicht_am: cs?.eingereicht_am, aufmass_am: cs?.aufmass_am,
        });
        const meta = DOKU_STATUS_META[dokuStatus];
        const borderColor = meta.color;

        return (
          <div
            key={c.bid}
            id={`doku-card-${c.bid}`}
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
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
                    {c.strasse} {c.hnr}
                    {c.hnr_zusatz}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                    padding: "2px 7px", borderRadius: 999,
                    background: meta.bg, color: meta.fg, textTransform: "uppercase",
                  }}>
                    {meta.label}
                  </span>
                  {c.auftragsquelle === "bulk" && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                      padding: "2px 7px", borderRadius: 999,
                      background: "#fef3c7", color: "#92400e", textTransform: "uppercase",
                    }}>
                      Bulk
                    </span>
                  )}
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
                <StreetViewImage
                  strasse={c.strasse}
                  hnr={c.hnr}
                  hnr_zusatz={c.hnr_zusatz}
                  plz={c.plz}
                  ort={c.ort}
                />
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

                {/* Auftragsquelle */}
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Quelle:</span>
                  {(["gf_plus", "bulk"] as const).map((q) => {
                    const current = c.auftragsquelle ?? "gf_plus";
                    const active = current === q;
                    return (
                      <button
                        key={q}
                        onClick={async () => {
                          setQuelleOverride((prev) => ({ ...prev, [c.bid]: q }));
                          showFlash("saving");
                          const { error } = await supabase.from("contacts").update({ auftragsquelle: q } as never).eq("bid", c.bid);
                          showFlash(error ? "error" : "saved");
                        }}
                        style={{
                          padding: "4px 10px", borderRadius: 999,
                          border: `1px solid ${active ? MAGENTA : "#e5e7eb"}`,
                          background: active ? MAGENTA : "white",
                          color: active ? "white" : "#475569",
                          fontSize: 11, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        {q === "gf_plus" ? "GF+" : "Bulk"}
                      </button>
                    );
                  })}
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
                    <div style={{ marginTop: 4 }}>
                      <LocalNotizTextarea
                        value={d.notiz}
                        onSave={(v) => patch(c.bid, { notiz: v })}
                        resyncKey={`doku:${c.bid}`}
                        placeholder="Besonderheiten, Probleme, Hinweise…"
                        borderColor="#e5e7eb"
                      />
                    </div>

                    <GrabenStepper
                      value={callStates[c.bid]?.grabenlaenge ?? 0}
                      onChange={async (v) => {
                        const cs = callStates[c.bid];
                        await supabase.from("call_states").upsert(
                          {
                            bid: c.bid,
                            status: cs?.status ?? "erledigt",
                            termin_slot: cs?.termin_slot ?? "",
                            termin_datum: cs?.termin_datum ?? null,
                            termin_zeit: cs?.termin_zeit ?? "",
                            notiz: cs?.notiz ?? "",
                            klarfall: cs?.klarfall ?? false,
                            klarfall_notiz: cs?.klarfall_notiz ?? "",
                            grabenlaenge: v,
                          },
                          { onConflict: "bid" },
                        );
                      }}
                    />
                  </>
                )}

                {/* Prüfung / Nachforderung durch Auftraggeber */}
                <NachforderungEditor
                  bid={c.bid}
                  cs={callStates[c.bid]}
                />

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

      {/* FOKUS: Problemfälle Doku-Status */}
      {!focusBid && (fokus.unvollstaendig.length > 0 || fokus.langeInPruefung.length > 0) && (
        <FokusPanel
          unvollstaendig={fokus.unvollstaendig}
          langeInPruefung={fokus.langeInPruefung}
          onOpen={(bid) => {
            setExpanded(bid);
            requestAnimationFrame(() => {
              const el = document.getElementById(`doku-card-${bid}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
        />
      )}
    </div>
  );
}

// ─── Klärfall-Kacheln ─────────────────────────────────────────────
type KacheldefProps = {
  kategorien: {
    auskundung: Contact[];
    fotoFehlt: Contact[];
    protokollFehlt: Contact[];
    zustimmungFehlt: Contact[];
    nachforderung: Contact[];
    manuell: Contact[];
    ohneAuftrag: Contact[];
  };
  noMatchCount: number;
  active: KlarfallKey | null;
  onSelect: (k: KlarfallKey) => void;
  onShowNoMatch: () => void;
  nurUnverguetet: boolean;
  onToggleUnverguetet: () => void;
};

function KlaerfaelleKacheln({ kategorien, noMatchCount, active, onSelect, onShowNoMatch, nurUnverguetet, onToggleUnverguetet }: KacheldefProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const tiles: Array<{
    key: KlarfallKey;
    icon: string;
    label: string;
    count: number;
    color: string;
    onClick: () => void;
  }> = [
    { key: "auskundung", icon: "🚫", label: "Ohne Auskundung", count: kategorien.auskundung.length, color: "#dc2626", onClick: () => onSelect("auskundung") },
    { key: "ohneAuftrag", icon: "🏷️", label: "Auftrag fehlt", count: kategorien.ohneAuftrag.length, color: "#ea580c", onClick: () => onSelect("ohneAuftrag") },
    { key: "fotoFehlt", icon: "📸", label: "Bilder fehlt", count: kategorien.fotoFehlt.length, color: "#0891b2", onClick: () => onSelect("fotoFehlt") },
    { key: "protokollFehlt", icon: "📄", label: "Protokoll fehlt", count: kategorien.protokollFehlt.length, color: "#0891b2", onClick: () => onSelect("protokollFehlt") },
    { key: "zustimmungFehlt", icon: "✍️", label: "Zustimmung fehlt", count: kategorien.zustimmungFehlt.length, color: "#7c3aed", onClick: () => onSelect("zustimmungFehlt") },
    { key: "manuell", icon: "🔧", label: "Manuelle Klärfälle", count: kategorien.manuell.length, color: "#64748b", onClick: () => onSelect("manuell") },
  ];

  const gesamt = tiles.reduce((s, t) => s + t.count, 0);

  return (
    <div style={{ background: "white", borderRadius: 11, padding: 12, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
          ⚠️ Klärfälle {gesamt > 0 ? `(${gesamt})` : ""}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {gesamt > 0 && (
            <button
              onClick={() => setShareOpen(true)}
              style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "#25D366", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
            >💬 Teilen</button>
          )}
          {active && (
            <button
              onClick={() => onSelect(active)}
              style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#475569" }}
            >Filter zurücksetzen ✕</button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
        {tiles.map((t) => {
          const isActive = active === t.key;
          const dim = t.count === 0;
          return (
            <button
              key={t.key}
              onClick={t.onClick}
              disabled={dim}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: `2px solid ${isActive ? t.color : "#e5e7eb"}`,
                background: isActive ? `${t.color}15` : dim ? "#f8fafc" : "white",
                cursor: dim ? "default" : "pointer",
                opacity: dim ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: 20 }}>{t.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: t.color, lineHeight: 1.1, marginTop: 2 }}>
                {t.count}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginTop: 2 }}>
                {t.label}
              </div>
            </button>
          );
        })}
      </div>
      {shareOpen && (
        <KlaerfaelleShareModal
          tiles={tiles.map((t) => ({
            key: t.key,
            label: t.label,
            icon: t.icon,
            contacts:
              t.key === "auskundung" ? kategorien.auskundung
              : t.key === "ohneAuftrag" ? kategorien.ohneAuftrag
              : t.key === "fotoFehlt" ? kategorien.fotoFehlt
              : t.key === "protokollFehlt" ? kategorien.protokollFehlt
              : t.key === "zustimmungFehlt" ? kategorien.zustimmungFehlt
              : t.key === "nachforderung" ? kategorien.nachforderung
              : kategorien.manuell,
          }))}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Klärfälle-Teilen: Kategorien + Objekte auswählen ────────────
type ShareTile = { key: KlarfallKey; label: string; icon: string; contacts: Contact[] };

function KlaerfaelleShareModal({ tiles, onClose }: { tiles: ShareTile[]; onClose: () => void }) {
  // Default: alle Objekte aller nicht-leeren Kategorien ausgewählt
  const [sel, setSel] = useState<Record<string, boolean>>(() => {
    const s: Record<string, boolean> = {};
    tiles.forEach((t) => t.contacts.forEach((c) => { s[`${t.key}::${c.bid}`] = true; }));
    return s;
  });

  function toggle(id: string) {
    setSel((p) => ({ ...p, [id]: !p[id] }));
  }
  function toggleCategory(t: ShareTile, on: boolean) {
    setSel((p) => {
      const n = { ...p };
      t.contacts.forEach((c) => { n[`${t.key}::${c.bid}`] = on; });
      return n;
    });
  }

  const selectedCount = Object.values(sel).filter(Boolean).length;

  function send() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const lines: string[] = [];
    lines.push("⚠️ *Klärfälle · An der Schmücke*");
    lines.push(`_Stand: ${dd}.${mm}.${yyyy} · ${hh}:${mi} Uhr_`);
    lines.push("");
    let totalSel = 0;
    tiles.forEach((t) => {
      const picked = t.contacts.filter((c) => sel[`${t.key}::${c.bid}`]);
      if (picked.length === 0) return;
      totalSel += picked.length;
      lines.push(`${t.icon} *${t.label}* (${picked.length})`);
      picked
        .sort((a, b) => a.strasse.localeCompare(b.strasse, "de") || (parseInt(a.hnr, 10) || 0) - (parseInt(b.hnr, 10) || 0))
        .forEach((c) => {
          const name = c.name?.trim() ? ` — ${c.name.trim()}` : "";
          lines.push(`• ${c.strasse} ${c.hnr}${c.hnr_zusatz}${name}`);
        });
      lines.push("");
    });
    if (totalSel === 0) return;
    lines.push("_Pro-Fiber · Störmer Bau_");
    window.open("https://wa.me/?text=" + encodeURIComponent(lines.join("\n")), "_blank");
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", borderTopLeftRadius: 16, borderTopRightRadius: 16,
          width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>💬 Klärfälle teilen</div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#64748b" }}>✕</button>
        </div>
        <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
          {tiles.filter((t) => t.contacts.length > 0).map((t) => {
            const allOn = t.contacts.every((c) => sel[`${t.key}::${c.bid}`]);
            const someOn = t.contacts.some((c) => sel[`${t.key}::${c.bid}`]);
            return (
              <div key={t.key} style={{ marginBottom: 14, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <button
                  onClick={() => toggleCategory(t, !allOn)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "8px 10px", background: "#f8fafc", border: "none", cursor: "pointer",
                    fontWeight: 700, fontSize: 13, color: "#0f172a", textAlign: "left",
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: 4,
                    border: `2px solid ${someOn ? MAGENTA : "#cbd5e1"}`,
                    background: allOn ? MAGENTA : someOn ? `${MAGENTA}40` : "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontSize: 12, flexShrink: 0,
                  }}>{allOn ? "✓" : someOn ? "–" : ""}</span>
                  <span>{t.icon} {t.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>{t.contacts.length}</span>
                </button>
                <div style={{ padding: "4px 0" }}>
                  {t.contacts
                    .slice()
                    .sort((a, b) => a.strasse.localeCompare(b.strasse, "de") || (parseInt(a.hnr, 10) || 0) - (parseInt(b.hnr, 10) || 0))
                    .map((c) => {
                      const id = `${t.key}::${c.bid}`;
                      const on = !!sel[id];
                      return (
                        <label
                          key={id}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "6px 12px", cursor: "pointer", fontSize: 13, color: "#0f172a",
                          }}
                        >
                          <input type="checkbox" checked={on} onChange={() => toggle(id)} style={{ width: 16, height: 16 }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 600 }}>{c.strasse} {c.hnr}{c.hnr_zusatz}</span>
                            {c.name?.trim() && <span style={{ color: "#64748b" }}> · {c.name.trim()}</span>}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: 12, borderTop: "1px solid #f1f5f9", display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#475569" }}
          >Abbrechen</button>
          <button
            onClick={send}
            disabled={selectedCount === 0}
            style={{
              flex: 2, padding: "10px", borderRadius: 8, border: "none",
              background: selectedCount === 0 ? "#cbd5e1" : "#25D366",
              color: "white", fontWeight: 700, fontSize: 13,
              cursor: selectedCount === 0 ? "default" : "pointer",
            }}
          >💬 An WhatsApp senden ({selectedCount})</button>
        </div>
      </div>
    </div>
  );
}

// ─── Nachforderung-Editor (pro HA) ────────────────────────────────
const NACHFORDERUNG_LABELS: Record<NachforderungGrund, string> = {
  foto: "📸 Foto",
  protokoll: "📄 Protokoll",
  aufmass: "📐 Aufmaß",
  sonstiges: "❓ Sonstiges",
};

function NachforderungEditor({ bid, cs }: { bid: string; cs: CallState | undefined }) {
  const [status, setStatus] = useState<PruefungStatus>(cs?.pruefung_status ?? "offen");
  const [gruende, setGruende] = useState<NachforderungGrund[]>(cs?.pruefung_nachforderung ?? []);
  const [notiz, setNotiz] = useState<string>(cs?.pruefung_notiz ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(cs?.pruefung_status ?? "offen");
    setGruende(cs?.pruefung_nachforderung ?? []);
    setNotiz(cs?.pruefung_notiz ?? "");
  }, [cs?.pruefung_status, cs?.pruefung_nachforderung, cs?.pruefung_notiz, bid]);

  async function save(next: Partial<CallState>) {
    setSaving(true);
    const base = {
      bid,
      status: cs?.status ?? "erledigt",
      termin_slot: cs?.termin_slot ?? "",
      termin_datum: cs?.termin_datum ?? null,
      termin_zeit: cs?.termin_zeit ?? "",
      notiz: cs?.notiz ?? "",
      klarfall: cs?.klarfall ?? false,
      klarfall_notiz: cs?.klarfall_notiz ?? "",
      grabenlaenge: cs?.grabenlaenge ?? 0,
      pruefung_status: next.pruefung_status ?? status,
      pruefung_nachforderung: next.pruefung_nachforderung ?? gruende,
      pruefung_notiz: next.pruefung_notiz ?? notiz,
    };
    const { error } = await supabase.from("call_states").upsert(base, { onConflict: "bid" });
    if (error) console.error("Nachforderung save failed", error);
    setSaving(false);
  }

  function toggleGrund(g: NachforderungGrund) {
    const next = gruende.includes(g) ? gruende.filter((x) => x !== g) : [...gruende, g];
    setGruende(next);
    save({ pruefung_nachforderung: next });
  }

  const badge =
    status === "freigegeben" ? { txt: "✓ Freigegeben", bg: "#dcfce7", fg: "#166534" }
    : status === "nachforderung" ? { txt: "⚠️ Nachforderung", bg: "#fef3c7", fg: "#92400e" }
    : status === "eingereicht" ? { txt: "📤 Eingereicht", bg: "#dbeafe", fg: "#1e40af" }
    : { txt: "Noch nicht eingereicht", bg: "#f1f5f9", fg: "#475569" };

  return (
    <div style={{ marginTop: 12, padding: "10px 12px", background: "#fafbfc", border: "1px solid #e2e8f0", borderRadius: 9 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "#475569", letterSpacing: 1 }}>
          🏦 PRÜFUNG DURCH AUFTRAGGEBER
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: badge.bg, color: badge.fg }}>
          {badge.txt}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: status === "nachforderung" ? 10 : 0 }}>
        {status !== "nachforderung" ? (
          <button
            onClick={() => { setStatus("nachforderung"); save({ pruefung_status: "nachforderung" }); }}
            disabled={saving}
            style={{ gridColumn: "1 / -1", padding: "8px", borderRadius: 7, border: "1px solid #f59e0b", background: "white", color: "#92400e", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >⚠️ AG meldet Nachforderung</button>
        ) : (
          <button
            onClick={() => { setStatus("eingereicht"); setGruende([]); save({ pruefung_status: "eingereicht", pruefung_nachforderung: [] }); }}
            disabled={saving}
            style={{ gridColumn: "1 / -1", padding: "8px", borderRadius: 7, border: "1px solid #22c55e", background: "white", color: "#166534", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >✓ Nachforderung erledigt · zurück zu eingereicht</button>
        )}
      </div>

      {status === "nachforderung" && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Was fehlt:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {(Object.keys(NACHFORDERUNG_LABELS) as NachforderungGrund[]).map((g) => {
              const active = gruende.includes(g);
              return (
                <button
                  key={g}
                  onClick={() => toggleGrund(g)}
                  style={{
                    padding: "6px 10px", borderRadius: 999,
                    border: `1px solid ${active ? "#f59e0b" : "#e5e7eb"}`,
                    background: active ? "#fef3c7" : "white",
                    color: active ? "#92400e" : "#475569",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >{NACHFORDERUNG_LABELS[g]}</button>
              );
            })}
          </div>
          <textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            onBlur={() => save({ pruefung_notiz: notiz })}
            placeholder="Notiz vom AG (was genau fehlt) …"
            style={{ width: "100%", boxSizing: "border-box", minHeight: 60, padding: 8, borderRadius: 7, border: "1px solid #e5e7eb", fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
          />
        </>
      )}
    </div>
  );
}

// ─── FokusPanel: unvollständig + lange in Prüfung ────────────────
type FokusPanelProps = {
  unvollstaendig: Array<{ contact: Contact; fehlend: string[]; tage: number | null }>;
  langeInPruefung: Array<{ contact: Contact; tage: number | null }>;
  onOpen: (bid: string) => void;
};

function FokusPanel({ unvollstaendig, langeInPruefung, onOpen }: FokusPanelProps) {
  return (
    <div style={{ background: "white", borderRadius: 11, padding: 12, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>🎯 Fokus Doku-Status</div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#fee2e2", color: "#991b1b" }}>
          {unvollstaendig.length} unvollständig
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e" }}>
          {langeInPruefung.length} lange in Prüfung
        </span>
      </div>

      {unvollstaendig.length > 0 && (
        <div style={{ marginBottom: langeInPruefung.length > 0 ? 12 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#991b1b", marginBottom: 6 }}>
            🔴 UNVOLLSTÄNDIG · AG hat Doku bemängelt
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {unvollstaendig.map(({ contact, fehlend, tage }) => (
              <button
                key={contact.bid}
                onClick={() => onOpen(contact.bid)}
                style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: 8,
                  border: "1px solid #fecaca", background: "#fef2f2",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                    {contact.strasse} {contact.hnr}{contact.hnr_zusatz} <span style={{ color: "#64748b", fontWeight: 500 }}>· {contact.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#991b1b", fontWeight: 600, marginTop: 2 }}>
                    Fehlt: {fehlend.join(" · ")}{tage !== null ? `  ·  ${tage} Tage in Prüfung` : ""}
                  </div>
                </div>
                <span style={{ color: "#94a3b8", fontSize: 16 }}>▸</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {langeInPruefung.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#92400e", marginBottom: 6 }}>
            🟡 IN PRÜFUNG &gt; 7 TAGE · potenziell hängengeblieben
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {langeInPruefung.map(({ contact, tage }) => (
              <button
                key={contact.bid}
                onClick={() => onOpen(contact.bid)}
                style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: 8,
                  border: "1px solid #fcd34d", background: "#fffbeb",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                    {contact.strasse} {contact.hnr}{contact.hnr_zusatz} <span style={{ color: "#64748b", fontWeight: 500 }}>· {contact.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#92400e", fontWeight: 600, marginTop: 2 }}>
                    Seit {tage} Tagen ohne Aufmaß-Bestätigung
                  </div>
                </div>
                <span style={{ color: "#94a3b8", fontSize: 16 }}>▸</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

