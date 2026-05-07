import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Contact, CallState } from "@/lib/types";

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

export function KalenderTab({ contacts, states, onOpenContact, onPatchTime }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const slotDays = useMemo(() => getWeekSlots(weekStart), [weekStart]);

  const [reschedule, setReschedule] = useState<{ contact: Contact; time: string } | null>(null);

  // Long-press
  const pressRef = useState<{ timer: number | null }>({ timer: null })[0];
  const longPressedRef = useState<{ v: boolean }>({ v: false })[0];

  const startPress = (c: Contact) => {
    longPressedRef.v = false;
    if (pressRef.timer) window.clearTimeout(pressRef.timer);
    pressRef.timer = window.setTimeout(() => {
      longPressedRef.v = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
      const cs = states[c.bid];
      setReschedule({ contact: c, time: cs?.termin_zeit || "09:00" });
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
      const el = document.getElementById("kalender-today");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, []);

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
      if (cs?.status !== "termin" || !cs.termin_slot || !cs.termin_datum) return;
      const key = `${cs.termin_datum}|${cs.termin_slot}`;
      (map[key] = map[key] || []).push(c);
    });
    // sort by termin_zeit asc, empty last
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

  return (
    <div style={{ padding: 12, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
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
          return (
            <div
              key={date}
              id={isToday ? "kalender-today" : undefined}
              style={{
                background: "#fff",
                borderRadius: 10,
                padding: 10,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                borderLeft: isToday ? "4px solid #e20074" : "4px solid transparent",
                scrollMarginTop: 60,
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
                {total > 0 && (
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    {total} Termin{total === 1 ? "" : "e"}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { key: vm, lbl: "☀️ Vormittag", color: "#fbbf24", appts: vmContacts },
                  { key: nm, lbl: "🌤 Nachmittag", color: "#60a5fa", appts: nmContacts },
                ].map(({ key, lbl, color, appts }) => (
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
                              background: "#f0fff6",
                              borderRadius: 7,
                              padding: "6px 8px",
                              marginBottom: 4,
                              cursor: "pointer",
                              borderLeft: "3px solid #22c55e",
                              userSelect: "none",
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
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
                            </div>
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

      {reschedule && (
        <>
          <div
            onClick={() => setReschedule(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 499,
            }}
          />
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
                  if (onPatchTime) onPatchTime(reschedule.contact.bid, reschedule.time);
                  setReschedule(null);
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
                onClick={() => setReschedule(null)}
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
        </>
      )}
    </div>
  );
}
