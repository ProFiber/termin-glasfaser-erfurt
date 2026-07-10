import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Contact, CallState } from "@/lib/types";
import GrabenPromptSheet from "./GrabenPromptSheet";

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}

const WEEK_DAYS = [
  { code: "mo", short: "Mo", dow: 1 },
  { code: "di", short: "Di", dow: 2 },
  { code: "mi", short: "Mi", dow: 3 },
  { code: "do", short: "Do", dow: 4 },
  { code: "fr", short: "Fr", dow: 5 },
  { code: "sa", short: "Sa", dow: 6 },
];

function getWeekSlots(weekStart: Date) {
  return WEEK_DAYS.map(({ code, short, dow }) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + (dow - 1));
    const iso = toIsoDate(d);
    const label = `${short} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
    const isToday = iso === toIsoDate(new Date());
    return { code, day: label, date: iso, vm: `${code}-vm`, nm: `${code}-nm`, isToday };
  });
}

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 7; h <= 20; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 20) out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
})();

type Props = {
  contacts: Contact[];
  states: Record<string, CallState>;
  onOpenContact: (bid: string) => void;
  onPatchTime?: (bid: string, time: string) => void;
  patch?: (bid: string, partial: Partial<CallState>) => void;
  onSwitchToDoku?: (bid: string) => void;
  onShowOnMap?: (bid: string) => void;
  focusDate?: string | null;
  onClearFocusDate?: () => void;
};

const navBtn: CSSProperties = {
  background: "#f1f5f9",
  border: "none",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  color: "#475569",
};

const menuRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  width: "100%",
  height: 52,
  padding: "14px 20px",
  background: "#fff",
  border: "none",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 15,
  color: "#1e293b",
  textAlign: "left",
  cursor: "pointer",
  textDecoration: "none",
};

const iconStyle: CSSProperties = {
  fontSize: 20,
  color: "#e20074",
  width: 24,
  textAlign: "center",
  flexShrink: 0,
};

const VIEW_MODE_KEY = "kalender:viewMode";
const DAY_MODES_KEY = "kalender:dayModes";

export function KalenderTab({ contacts, states, onOpenContact, onPatchTime, patch, onSwitchToDoku, onShowOnMap, focusDate, onClearFocusDate }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [viewMode, setViewMode] = useState<"tageszeit" | "team">(() => {
    if (typeof window === "undefined") return "tageszeit";
    const v = window.localStorage.getItem(VIEW_MODE_KEY);
    return v === "team" ? "team" : "tageszeit";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);
  const [dayModes, setDayModes] = useState<Record<string, "tageszeit" | "team">>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem(DAY_MODES_KEY) || "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(DAY_MODES_KEY, JSON.stringify(dayModes));
  }, [dayModes]);
  const modeForDay = (date: string) => dayModes[date] ?? viewMode;
  const toggleDayMode = (date: string) => {
    setDayModes((m) => {
      const current = m[date] ?? viewMode;
      return { ...m, [date]: current === "tageszeit" ? "team" : "tageszeit" };
    });
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
  };
  const slotDays = useMemo(() => getWeekSlots(weekStart), [weekStart]);



  const [menuFor, setMenuFor] = useState<Contact | null>(null);
  const [reschedule, setReschedule] = useState<{ contact: Contact; time: string; slot: "vm" | "nm" } | null>(null);
  const [grabenFor, setGrabenFor] = useState<Contact | null>(null);

  // Long-press
  const pressRef = useState<{ timer: number | null }>({ timer: null })[0];
  const longPressedRef = useState<{ v: boolean }>({ v: false })[0];

  const startPress = (c: Contact) => {
    longPressedRef.v = false;
    if (pressRef.timer) window.clearTimeout(pressRef.timer);
    pressRef.timer = window.setTimeout(() => {
      longPressedRef.v = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
      setMenuFor(c);
    }, 500);
  };
  const cancelPress = () => {
    if (pressRef.timer) {
      window.clearTimeout(pressRef.timer);
      pressRef.timer = null;
    }
  };

  // Auto-scroll to today
  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = document.getElementById(`kalender-day-${toIsoDate(new Date())}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, []);

  // Switch week + scroll when focusDate is provided
  useEffect(() => {
    if (!focusDate) return;
    const d = new Date(`${focusDate}T00:00:00`);
    if (isNaN(d.getTime())) return;
    const ws = mondayOf(d);
    setWeekStart((cur) => (toIsoDate(cur) === toIsoDate(ws) ? cur : ws));
    const t = window.setTimeout(() => {
      const el = document.getElementById(`kalender-day-${focusDate}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      onClearFocusDate?.();
    }, 150);
    return () => window.clearTimeout(t);
  }, [focusDate, onClearFocusDate]);

  const weekRangeLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 5);
    const f = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
    return `${f(weekStart)} – ${f(end)}`;
  }, [weekStart]);

  const bySlot = useMemo(() => {
    const map: Record<string, Contact[]> = {};
    contacts.forEach((c) => {
      const cs = states[c.bid];
      if (!cs || !cs.termin_slot || !cs.termin_datum) return;
      if (cs.status !== "termin" && cs.status !== "erledigt") return;
      const key = `${cs.termin_datum}|${cs.termin_slot}`;
      (map[key] = map[key] || []).push(c);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => {
        const ta = states[a.bid]?.termin_zeit || "";
        const tb = states[b.bid]?.termin_zeit || "";
        if (!ta && !tb) return 0;
        if (!ta) return 1;
        if (!tb) return -1;
        return ta.localeCompare(tb);
      });
    });
    return map;
  }, [contacts, states]);

  const weekTermine = useMemo(() => {
    return slotDays.reduce((acc, { date, vm, nm }) => {
      return (
        acc + (bySlot[`${date}|${vm}`]?.length ?? 0) + (bySlot[`${date}|${nm}`]?.length ?? 0)
      );
    }, 0);
  }, [slotDays, bySlot]);

  const closeAll = () => {
    setMenuFor(null);
    setReschedule(null);
  };

  const addrQuery = (c: Contact) =>
    encodeURIComponent(`${c.strasse} ${c.hnr}${c.hnr_zusatz}, ${c.plz} ${c.ort}`);

  const doPatch = (c: Contact, partial: Partial<CallState>) => {
    if (patch) patch(c.bid, partial);
    closeAll();
  };

  const openReschedule = (c: Contact) => {
    const cs = states[c.bid];
    const currentSlot = (cs?.termin_slot?.endsWith("-nm") ? "nm" : "vm") as "vm" | "nm";
    setReschedule({ contact: c, time: cs?.termin_zeit || "09:00", slot: currentSlot });
    setMenuFor(null);
  };

  // Per-day swipe to toggle view mode (Tageszeit <-> Team)
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number; t: number; date: string } | null>(null);

  const onDaySwipeStart = (date: string) => (e: React.TouchEvent) => {
    const t = e.touches[0];
    setSwipeStart({ x: t.clientX, y: t.clientY, t: Date.now(), date });
  };
  const onDaySwipeEnd = (e: React.TouchEvent) => {
    if (!swipeStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStart.x;
    const dy = t.clientY - swipeStart.y;
    const dt = Date.now() - swipeStart.t;
    const date = swipeStart.date;
    setSwipeStart(null);
    if (dt < 600 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      toggleDayMode(date);
    }
  };

  function shareTagesliste(dateIso: string, _dayLabel: string, appts: Contact[]) {
    // Format: "02.07. Schmücke (3)\n\nTeam Jozey\n\nErnst-..."
    // Reihenfolge bleibt exakt so, wie die Termine im Kalender angezeigt werden.
    const d = new Date(`${dateIso}T00:00:00`);
    const dateShort = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
    const teamLabel = (t: string) =>
      t === "team1" ? "Team Jozey" : t === "team2" ? "Team Adil" : "Ohne Team";
    const totalM = appts.reduce((s, c) => s + (states[c.bid]?.grabenlaenge || 0), 0);
    const lines: string[] = [];
    lines.push(`*${dateShort} Schmücke (${appts.length}/${totalM}m)*`);

    let lastTeam = "__initial__";
    appts.forEach((c) => {
      const t = states[c.bid]?.team || "";
      if (t !== lastTeam) {
        lines.push("");
        lines.push(`_${teamLabel(t)}_`);
        lines.push("");
        lastTeam = t;
      }
      const gl = states[c.bid]?.grabenlaenge || 0;
      const addr = `${c.strasse} ${c.hnr}${c.hnr_zusatz}`.trim();
      lines.push(gl > 0 ? `${addr}, ${gl}m` : addr);
    });
    const text = lines.join("\n");

    // Nativ teilen wenn möglich, sonst WhatsApp Web + Zwischenablage
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
    if (nav?.share) {
      nav.share({ text, title: `Tagesliste ${dateShort}` }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
      });
    } else {
      if (nav?.clipboard) nav.clipboard.writeText(text).catch(() => {});
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
  }

  return (
    <div
      style={{ padding: 12, fontFamily: "system-ui, -apple-system, sans-serif" }}
    >

      <style>{`@keyframes kal-pulse { 0%,100% { box-shadow: 0 0 0 1px #fdba74, 0 0 0 0 rgba(249,115,22,0.5);} 50% { box-shadow: 0 0 0 1px #fdba74, 0 0 0 8px rgba(249,115,22,0);} }`}</style>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "#fff",
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>📅 Kalender</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {weekTermine} Termin{weekTermine === 1 ? "" : "e"} diese Woche
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() =>
                setWeekStart((d) => {
                  const x = new Date(d);
                  x.setDate(d.getDate() - 7);
                  return x;
                })
              }
              style={navBtn}
            >
              ‹
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#334155", minWidth: 110, textAlign: "center" }}>
              {weekRangeLabel}
            </span>
            <button
              type="button"
              onClick={() =>
                setWeekStart((d) => {
                  const x = new Date(d);
                  x.setDate(d.getDate() + 7);
                  return x;
                })
              }
              style={navBtn}
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(mondayOf(new Date()))}
              style={{
                ...navBtn,
                background: "#e0f2fe",
                color: "#0891b2",
                marginLeft: 2,
                fontSize: 10,
              }}
            >
              Heute
            </button>
          </div>
        </div>
      </div>


      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {slotDays.map(({ day, date, vm, nm, isToday }) => {
          const vmContacts = bySlot[`${date}|${vm}`] ?? [];
          const nmContacts = bySlot[`${date}|${nm}`] ?? [];
          const total = vmContacts.length + nmContacts.length;
          const allDayContacts = [...vmContacts, ...nmContacts];
          const team1Contacts = allDayContacts.filter((c) => states[c.bid]?.team === "team1");
          const team2Contacts = allDayContacts.filter((c) => states[c.bid]?.team === "team2");
          const dayMode = modeForDay(date);
          const buckets = dayMode === "tageszeit"
            ? [
                { key: vm, lbl: "☀️ Vormittag", color: "#fbbf24", appts: vmContacts },
                { key: nm, lbl: "🌤 Nachmittag", color: "#60a5fa", appts: nmContacts },
              ]
            : [
                { key: `${date}-t1`, lbl: "👷 Team Jozey", color: "#3b82f6", appts: team1Contacts },
                { key: `${date}-t2`, lbl: "👷 Team Adil", color: "#7c3aed", appts: team2Contacts },
              ];
          return (
            <div
              key={date}
              id={`kalender-day-${date}`}
              onTouchStart={onDaySwipeStart(date)}
              onTouchEnd={onDaySwipeEnd}
              style={{
                background: "#fff",
                borderRadius: 10,
                padding: 10,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                borderLeft: isToday ? "4px solid #e20074" : "4px solid transparent",
                scrollMarginTop: 60,
                touchAction: "pan-y",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: isToday ? "#e20074" : "#0f172a",
                  }}
                >
                  {day}
                  {isToday ? " · Heute" : ""}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {total > 0 && (
                    <span style={{ fontSize: 11, color: "#64748b" }}>
                      {total} Termin{total === 1 ? "" : "e"}
                    </span>
                  )}
                  {total > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        shareTagesliste(date, day, allDayContacts);
                      }}
                      title="Tagesliste teilen"
                      style={{
                        background: "#dcfce7",
                        color: "#15803d",
                        border: "none",
                        borderRadius: 999,
                        padding: "3px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      📋 Tagesliste
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDayMode(date);
                    }}
                    title="Ansicht wechseln (oder seitlich wischen)"
                    style={{
                      background: dayMode === "team" ? "#ede9fe" : "#fef3c7",
                      color: dayMode === "team" ? "#6d28d9" : "#a16207",
                      border: "none",
                      borderRadius: 999,
                      padding: "3px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dayMode === "team" ? "👷 Team ⇄" : "☀️ Tageszeit ⇄"}
                  </button>
                </div>
              </div>


              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {buckets.map(({ key, lbl, color, appts }) => (
                  <div
                    key={key}
                    style={{
                      background: "#f8fafc",
                      borderRadius: 8,
                      padding: 8,
                      borderTop: `3px solid ${color}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: 6,
                      }}
                    >
                      {lbl}
                    </div>
                    {appts.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "8px 0" }}>
                        —
                      </div>
                    ) : (
                      appts.map((c) => {
                        const cs = states[c.bid];
                        const done = cs?.status === "erledigt";
                        const inArbeit = cs?.team_status === "in_arbeit" && !done;
                        return (
                          <div
                            key={c.bid}
                            onClick={() => {
                              if (longPressedRef.v) {
                                longPressedRef.v = false;
                                return;
                              }
                              onOpenContact(c.bid);
                            }}
                            onTouchStart={() => startPress(c)}
                            onTouchEnd={cancelPress}
                            onTouchCancel={cancelPress}
                            onTouchMove={cancelPress}
                            onMouseDown={() => startPress(c)}
                            onMouseUp={cancelPress}
                            onMouseLeave={cancelPress}
                            onContextMenu={(e) => e.preventDefault()}
                            style={{
                              position: "relative",
                              background: inArbeit ? "#fff7ed" : done ? "#f0fff6" : "#ffffff",
                              borderRadius: 7,
                              padding: "6px 8px",
                              marginBottom: 4,
                              cursor: "pointer",
                              borderLeft: inArbeit
                                ? "3px solid #f97316"
                                : done
                                ? "3px solid #22c55e"
                                : "3px solid #3b82f6",
                              boxShadow: inArbeit ? "0 0 0 1px #fdba74" : undefined,
                              animation: inArbeit ? "kal-pulse 1.8s ease-in-out infinite" : undefined,
                              userSelect: "none",
                            }}
                          >
                            {inArbeit && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  right: 4,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: "#9a3412",
                                  background: "#fed7aa",
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  lineHeight: 1.3,
                                }}
                                aria-label="in Arbeit"
                              >
                                🔨 BAU
                              </span>
                            )}
                            {done && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  right: 4,
                                  fontSize: 12,
                                  lineHeight: 1,
                                }}
                                aria-label="erledigt"
                              >
                                ✅
                              </span>
                            )}
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", paddingRight: done ? 16 : 0 }}>
                              {c.strasse} {c.hnr}
                              {c.hnr_zusatz}
                            </div>
                            <div style={{ fontSize: 11, color: "#334155" }}>
                              {c.name}
                              {c.nvt && (
                                <span style={{ color: "#94a3b8", fontWeight: 400 }}> · {c.nvt}</span>
                              )}
                            </div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>
                              {c.typ}
                              {c.we ? ` · ${c.we} WE` : ""}
                              {done && cs?.grabenlaenge ? ` · ⛏️ ${cs.grabenlaenge} m` : ""}
                            </div>
                            {cs?.team && (
                              <div style={{
                                display: "inline-block",
                                marginTop: 3,
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#fff",
                                background: cs.team === "team1" ? "#3b82f6" : "#7c3aed",
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}>
                                👷 {cs.team === "team1" ? "Team Jozey" : "Team Adil"}
                              </div>
                            )}
                            {cs?.termin_zeit && (
                              <div style={{ fontSize: 10, color: "#0891b2", fontWeight: 700, marginTop: 2 }}>
                                ⏰ ab {cs.termin_zeit} Uhr
                              </div>
                            )}
                            {c.mobil && (
                              <a
                                href={`tel:${c.mobil}`}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: "block",
                                  marginTop: 3,
                                  fontSize: 10,
                                  color: "#e20074",
                                  fontWeight: 700,
                                  textDecoration: "none",
                                }}
                              >
                                📱 {c.mobil}
                              </a>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {(menuFor || reschedule) && (
        <div
          onClick={closeAll}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 499,
          }}
        />
      )}

      {menuFor && !reschedule && (() => {
        const c = menuFor;
        const phone = c.mobil || c.festnetz;
        const cs = states[c.bid];
        const slotLbl = cs?.termin_slot?.endsWith("-nm") ? "Nachmittag" : "Vormittag";
        const dateLbl = cs?.termin_datum
          ? new Date(cs.termin_datum).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })
          : "";
        const waMsg = encodeURIComponent(
          `Hallo ${c.name}, hiermit bestätige ich Ihren Termin für die Glasfaser-Auskundung am ${dateLbl} (${slotLbl}${cs?.termin_zeit ? `, ab ${cs.termin_zeit} Uhr` : ""}). Adresse: ${c.strasse} ${c.hnr}${c.hnr_zusatz}, ${c.plz} ${c.ort}. Vielen Dank!`
        );
        return (
          <div
            style={{
              position: "fixed",
              bottom: 56,
              left: 0,
              right: 0,
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              zIndex: 500,
              boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
              maxHeight: "70vh",
              overflowY: "auto",
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                🏠 {c.strasse} {c.hnr}{c.hnr_zusatz} — {c.name}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                📡 {c.nvt || "—"} · {c.ort} · {c.typ}{c.we ? ` · ${c.we} WE` : ""}
              </div>
            </div>

            <button style={menuRow} onClick={() => openReschedule(c)}>
              <span style={iconStyle}>⏰</span>
              <span>Termin verschieben</span>
            </button>

            <button
              style={{ ...menuRow, color: "#dc2626" }}
              onClick={() => doPatch(c, { status: "offen", termin_slot: "", termin_datum: null, termin_zeit: "", team_status: "" })}
            >
              <span style={{ ...iconStyle, color: "#dc2626" }}>🗑</span>
              <span>Termin löschen</span>
            </button>

            <a
              style={menuRow}
              href={`https://www.google.com/maps/dir/?api=1&destination=${addrQuery(c)}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setTimeout(closeAll, 0)}
            >
              <span style={iconStyle}>🗺️</span>
              <span>Google Maps Navigation</span>
            </a>

            {onShowOnMap && (
              <button
                style={menuRow}
                onClick={() => { onShowOnMap(c.bid); closeAll(); }}
              >
                <span style={iconStyle}>📍</span>
                <span>Auf Karte anzeigen</span>
              </button>
            )}

            <a
              style={menuRow}
              href={`https://www.google.com/maps?q=${addrQuery(c)}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setTimeout(closeAll, 0)}
            >
              <span style={iconStyle}>📸</span>
              <span>Streetview anzeigen</span>
            </a>

            {phone && (
              <a style={menuRow} href={`tel:${phone}`} onClick={() => setTimeout(closeAll, 0)}>
                <span style={iconStyle}>📞</span>
                <span>Anrufen ({phone})</span>
              </a>
            )}

            {c.mobil && (
              <a
                style={menuRow}
                href={`https://wa.me/${c.mobil.replace(/[^\d]/g, "")}?text=${waMsg}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => setTimeout(closeAll, 0)}
              >
                <span style={iconStyle}>💬</span>
                <span>Terminbestätigung senden</span>
              </a>
            )}
            {(() => {
              const inArbeit = cs?.team_status === "in_arbeit";
              return (
                <button
                  style={menuRow}
                  onClick={() =>
                    doPatch(c, {
                      team_status: inArbeit ? "zugewiesen" : "in_arbeit",
                      team: cs?.team || "team1",
                    })
                  }
                >
                  <span style={{ ...iconStyle, color: "#f97316" }}>🔨</span>
                  <span>{inArbeit ? "Arbeitsmodus beenden" : "Jetzt in Arbeit (Bau läuft)"}</span>
                </button>
              );
            })()}


            <button
              style={menuRow}
              onClick={() => {
                const today = new Date();
                const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                if (patch) patch(c.bid, { status: "erledigt", erledigt_datum: iso, team_status: "" });
                setMenuFor(null);
                setGrabenFor(c);
              }}
            >
              <span style={{ ...iconStyle, color: "#22c55e" }}>✅</span>
              <span>Als erledigt markieren</span>
            </button>

            <button style={menuRow} onClick={() => doPatch(c, { klarfall: true })}>
              <span style={iconStyle}>⚠️</span>
              <span>Als Klärfall markieren</span>
            </button>

            <button
              style={menuRow}
              onClick={() => {
                if (onSwitchToDoku) onSwitchToDoku(c.bid);
                closeAll();
              }}
            >
              <span style={iconStyle}>📋</span>
              <span>Zur Dokumentation</span>
            </button>

            <button
              style={{
                ...menuRow,
                justifyContent: "center",
                color: "#94a3b8",
                fontWeight: 600,
                borderBottom: "none",
              }}
              onClick={closeAll}
            >
              Abbrechen
            </button>
          </div>
        );
      })()}

      {reschedule && (
        <div
          style={{
            position: "fixed",
            bottom: 56,
            left: 0,
            right: 0,
            background: "#fff",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 16,
            zIndex: 500,
            boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
            ⏰ Termin verschieben
          </div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
            {reschedule.contact.name} · {reschedule.contact.strasse} {reschedule.contact.hnr}
            {reschedule.contact.hnr_zusatz}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {([
              { k: "vm", lbl: "☀️ Vormittag" },
              { k: "nm", lbl: "🌤 Nachmittag" },
            ] as const).map(({ k, lbl }) => (
              <button
                key={k}
                onClick={() => setReschedule((r) => (r ? { ...r, slot: k } : r))}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: reschedule.slot === k ? "#e20074" : "#f1f5f9",
                  color: reschedule.slot === k ? "#fff" : "#475569",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Neue Uhrzeit wählen:</div>
          <select
            value={reschedule.time}
            onChange={(e) => setReschedule((r) => (r ? { ...r, time: e.target.value } : r))}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 16,
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              marginBottom: 14,
              background: "#fff",
            }}
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                const c = reschedule.contact;
                const cs = states[c.bid];
                const dayCode = cs?.termin_slot?.split("-")[0] || "mo";
                const newSlot = `${dayCode}-${reschedule.slot}`;
                if (patch) {
                  patch(c.bid, { termin_zeit: reschedule.time, termin_slot: newSlot });
                } else if (onPatchTime) {
                  onPatchTime(c.bid, reschedule.time);
                }
                closeAll();
              }}
              style={{
                flex: 1,
                padding: "12px",
                background: "#22c55e",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✓ Speichern
            </button>
            <button
              onClick={closeAll}
              style={{
                flex: 1,
                padding: "12px",
                background: "#f1f5f9",
                color: "#475569",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✗ Abbrechen
            </button>
          </div>
        </div>
      )}

      {grabenFor && (
        <GrabenPromptSheet
          title={`${grabenFor.strasse} ${grabenFor.hnr}${grabenFor.hnr_zusatz}`}
          subtitle={grabenFor.name}
          initial={states[grabenFor.bid]?.grabenlaenge ?? 0}
          onSave={(v) => {
            if (patch) patch(grabenFor.bid, { grabenlaenge: v });
            setGrabenFor(null);
          }}
          onSkip={() => setGrabenFor(null)}
          onUndo={() => {
            if (patch) patch(grabenFor.bid, { status: "termin", grabenlaenge: 0 });
            setGrabenFor(null);
          }}
        />
      )}
    </div>
  );
}
