import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

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

type Contact = {
  bid: string;
  strasse: string;
  hnr: string;
  name: string;
  mobil: string;
  festnetz: string;
  typ: string;
  we: number;
};

const CONTACTS: Contact[] = [
  { bid: "2225848", strasse: "Hauptstr.", hnr: "3", name: "Joachim Müller", mobil: "+4915128875263", festnetz: "+493467397308", typ: "EFH", we: 1 },
  { bid: "2225918", strasse: "Hauptstr.", hnr: "5", name: "Siegfried Rönnecke", mobil: "+4916098635618", festnetz: "+493467318736", typ: "MFH", we: 2 },
  { bid: "2225908", strasse: "Hauptstr.", hnr: "9", name: "Enrico Steinkopf", mobil: "+491723586885", festnetz: "", typ: "EFH", we: 1 },
  { bid: "2225886", strasse: "Hauptstr.", hnr: "10", name: "Adelheid Laute", mobil: "+491735667395", festnetz: "", typ: "MFH", we: 1 },
  { bid: "2226023", strasse: "Hauptstr.", hnr: "13", name: "Hans-Joachim Schoder", mobil: "+491717168797", festnetz: "+493467398027", typ: "EFH", we: 1 },
  { bid: "2226045", strasse: "Hauptstr.", hnr: "15", name: "Uwe und Erich Müller", mobil: "+4915156379204", festnetz: "+493467391767", typ: "EFH", we: 1 },
  { bid: "2225981", strasse: "Hauptstr.", hnr: "17", name: "Ronny Nickmann", mobil: "+491778069809", festnetz: "", typ: "MFH", we: 1 },
  { bid: "2226529", strasse: "Hauptstr.", hnr: "19", name: "Schäffer WohnART GmbH", mobil: "+4915116166010", festnetz: "+493467377670", typ: "MFH", we: 4 },
  { bid: "2504102", strasse: "Hauptstr.", hnr: "20", name: "MAKARA Limited", mobil: "+4915151008150", festnetz: "", typ: "MFH", we: 1 },
  { bid: "2226476", strasse: "Hauptstr.", hnr: "24", name: "Rainer Nolle Friseur-Salon", mobil: "+4915202099986", festnetz: "", typ: "MFH", we: 1 },
  { bid: "2401579", strasse: "Hauptstr.", hnr: "40", name: "Patrick Taube", mobil: "+491739577587", festnetz: "+493467396310", typ: "MFH", we: 9 },
  { bid: "2226563", strasse: "Hauptstr.", hnr: "44", name: "Carola Meyer", mobil: "+4915203957406", festnetz: "+493467390811", typ: "MFH", we: 1 },
  { bid: "2226519", strasse: "Hauptstr.", hnr: "45", name: "Claudia Kunze", mobil: "+4915232099245", festnetz: "+493467398109", typ: "MFH", we: 2 },
  { bid: "2226591", strasse: "Hauptstr.", hnr: "46", name: "Christian Lange", mobil: "+4915128858621", festnetz: "+4934673780283", typ: "EFH", we: 1 },
  { bid: "2455521", strasse: "Hauptstr.", hnr: "47", name: "Sahin Polat", mobil: "+491735715624", festnetz: "+493467398154", typ: "MFH", we: 1 },
  { bid: "2225833", strasse: "Hauptstr.", hnr: "58", name: "Uta Tettenborn", mobil: "+4917499854847", festnetz: "+493467398365", typ: "MFH", we: 1 },
  { bid: "2225880", strasse: "Hauptstr.", hnr: "59", name: "Nicolle Müller", mobil: "", festnetz: "+493467378893", typ: "MFH", we: 2 },
  { bid: "2225972", strasse: "Hauptstr.", hnr: "63", name: "Zehentner und Seidel", mobil: "", festnetz: "+4934673839416", typ: "MFH", we: 1 },
  { bid: "2226132", strasse: "Hauptstr.", hnr: "63", name: "Gerhard Lippold", mobil: "+4917632313162", festnetz: "+493467390224", typ: "MFH", we: 1 },
  { bid: "2225933", strasse: "Hauptstr.", hnr: "64", name: "Rainer Hörig", mobil: "+4915222647509", festnetz: "+493467390792", typ: "EFH", we: 1 },
  { bid: "2226328", strasse: "Lange Str.", hnr: "3", name: "Rainer Lüddecke", mobil: "+491723867617", festnetz: "", typ: "EFH", we: 1 },
  { bid: "2226350", strasse: "Lange Str.", hnr: "7", name: "Sandra Wackes", mobil: "+4916096978782", festnetz: "+4934673170373", typ: "EFH", we: 1 },
  { bid: "2226302", strasse: "Lange Str.", hnr: "11", name: "Stephan Schenk", mobil: "+491723735213", festnetz: "+493467397183", typ: "EFH", we: 1 },
  { bid: "2230398", strasse: "Lange Str.", hnr: "13", name: "Lorenz Amme", mobil: "+491626876013", festnetz: "", typ: "EFH", we: 1 },
  { bid: "2226208", strasse: "Lange Str.", hnr: "15", name: "Jens Straßburg", mobil: "+491723512408", festnetz: "+4934673789643", typ: "EFH", we: 1 },
  { bid: "2226283", strasse: "Lange Str.", hnr: "18", name: "Andreas Grimmer", mobil: "+491745876826", festnetz: "+493467379148", typ: "EFH", we: 1 },
  { bid: "2226414", strasse: "Lange Str.", hnr: "19", name: "Sabine Trinks", mobil: "+491757983", festnetz: "+493467392159", typ: "EFH", we: 1 },
  { bid: "2226099", strasse: "Lange Str.", hnr: "20", name: "Marcel Stolberg", mobil: "+4915252988929", festnetz: "+4934673170279", typ: "EFH", we: 1 },
  { bid: "2226180", strasse: "Lange Str.", hnr: "24", name: "Ursula Nolle", mobil: "+491626327659", festnetz: "+493467397337", typ: "EFH", we: 1 },
  { bid: "2226232", strasse: "Lange Str.", hnr: "24", name: "Annette Meyer-Jersch", mobil: "+4917657643716", festnetz: "", typ: "EFH", we: 1 },
  { bid: "2226254", strasse: "Lange Str.", hnr: "29", name: "René Haarseim", mobil: "+491628535898", festnetz: "+4934673789374", typ: "EFH", we: 1 },
  { bid: "2226295", strasse: "Lange Str.", hnr: "33", name: "Uwe Klank", mobil: "+491749165", festnetz: "", typ: "EFH", we: 1 },
  { bid: "2226204", strasse: "Lange Str.", hnr: "36", name: "Marion Kulka", mobil: "+491729810", festnetz: "", typ: "EFH", we: 1 },
  { bid: "2226404", strasse: "Lange Str.", hnr: "37", name: "Silvia Prabucka-Schmidt", mobil: "+491729094", festnetz: "+4934673789379", typ: "EFH", we: 1 },
  { bid: "2226164", strasse: "Lange Str.", hnr: "38", name: "Rosemarie Kelber", mobil: "+491712951529", festnetz: "+493467379056", typ: "EFH", we: 1 },
  { bid: "2226270", strasse: "Lange Str.", hnr: "39", name: "Jens Müller", mobil: "+491633351619", festnetz: "+493467396154", typ: "EFH", we: 1 },
  { bid: "2226443", strasse: "Lange Str.", hnr: "43", name: "Mario-Mayk Henße", mobil: "+491779793", festnetz: "+493467397428", typ: "EFH", we: 1 },
  { bid: "2226325", strasse: "Lange Str.", hnr: "44", name: "Burga Fuhrmann", mobil: "+491774346", festnetz: "", typ: "EFH", we: 1 },
  { bid: "2226459", strasse: "Lange Str.", hnr: "45", name: "Dagmar Drescher", mobil: "+4917642733908", festnetz: "+493467397286", typ: "MFH", we: 2 },
  { bid: "2226402", strasse: "Lange Str.", hnr: "45", name: "Denny Lindner", mobil: "+4915206814", festnetz: "", typ: "EFH", we: 1 },
  { bid: "2226279", strasse: "Lange Str.", hnr: "47", name: "Bauna Bau und Möbeltischlerei GmbH", mobil: "+4915225424061", festnetz: "+493467390534", typ: "EFH", we: 1 },
  { bid: "2226357", strasse: "Lange Str.", hnr: "47", name: "Heidrun Enke", mobil: "+4915156324", festnetz: "+4934673789388", typ: "EFH", we: 1 },
  { bid: "2226398", strasse: "Lange Str.", hnr: "50", name: "Susann Markus", mobil: "+4915566528", festnetz: "+4934673789330", typ: "MFH", we: 1 },
  { bid: "2226264", strasse: "Lange Str.", hnr: "51", name: "Sindy Gebhardt", mobil: "+491759646", festnetz: "", typ: "EFH", we: 1 },
  { bid: "2226128", strasse: "Lange Str.", hnr: "53", name: "Helmut Bruder", mobil: "+491722611", festnetz: "+493467397283", typ: "EFH", we: 1 },
  { bid: "2226286", strasse: "Lange Str.", hnr: "53", name: "Christian Stettin", mobil: "+491722821", festnetz: "", typ: "EFH", we: 1 },
];

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

type StatusKey = "offen" | "angerufen" | "termin" | "nichtErreicht" | "abgelehnt";

const STATUS_META: Record<StatusKey, { label: string; dot: string }> = {
  offen: { label: "Offen", dot: "#9ca3af" },
  angerufen: { label: "Angerufen", dot: "#facc15" },
  termin: { label: "✅ Termin", dot: "#22c55e" },
  nichtErreicht: { label: "Nicht erreicht", dot: "#fb923c" },
  abgelehnt: { label: "Abgelehnt", dot: "#ef4444" },
};

const STORAGE_KEY = "schmucke_callliste_v1";

type AppState = {
  statuses: Record<string, StatusKey>;
  appointments: Record<string, string>;
  notes: Record<string, string>;
};

function loadState(): AppState {
  if (typeof window === "undefined") return { statuses: {}, appointments: {}, notes: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { statuses: {}, appointments: {}, notes: {} };
}

function Index() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("alle");
  const [street, setStreet] = useState<string>("alle");
  const [flash, setFlash] = useState(false);

  const { statuses, appointments, notes } = state;

  function patch(key: keyof AppState, bid: string, val: string) {
    setState((prev) => {
      const next: AppState = {
        ...prev,
        [key]: { ...prev[key], [bid]: val },
      } as AppState;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      setFlash(true);
      setTimeout(() => setFlash(false), 1000);
      return next;
    });
  }

  const terminCount = Object.values(statuses).filter((s) => s === "termin").length;

  const filtered = CONTACTS.filter((c) => {
    const st = statuses[c.bid] || "offen";
    if (filter !== "alle" && st !== filter) return false;
    if (street !== "alle" && c.strasse !== street) return false;
    return true;
  });

  const lastName = (name: string) => name.trim().split(/\s+/).pop();

  const cardBorder = (st: string) =>
    ({
      termin: "#22c55e",
      abgelehnt: "#ef4444",
      nichtErreicht: "#fb923c",
      angerufen: "#facc15",
      offen: "#e5e7eb",
    } as Record<string, string>)[st] || "#e5e7eb";

  const cardBg = (st: string) =>
    ({
      termin: "#f0fff6",
      abgelehnt: "#fff5f5",
      nichtErreicht: "#fffbf0",
    } as Record<string, string>)[st] || "white";

  return (
    <div
      style={{
        fontFamily: "system-ui,-apple-system,sans-serif",
        maxWidth: 480,
        margin: "0 auto",
        background: "#f2f2f7",
        minHeight: "100vh",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          background: "#e20074",
          color: "white",
          padding: "12px 16px",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ fontSize: 11, opacity: 0.75, letterSpacing: 0.3 }}>
          An der Schmücke · Glasfaser · Störmer Bau
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 2,
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>📞 Call-Liste</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {flash && (
              <span
                style={{
                  fontSize: 11,
                  background: "rgba(255,255,255,0.22)",
                  borderRadius: 8,
                  padding: "2px 8px",
                }}
              >
                💾 gespeichert
              </span>
            )}
            <span
              style={{
                background: terminCount >= 4 ? "#16a34a" : "rgba(255,255,255,0.22)",
                borderRadius: 20,
                padding: "3px 12px",
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              {terminCount} / 4 ✓
            </span>
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 7,
        }}
      >
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {["alle", "Hauptstr.", "Lange Str."].map((s) => (
            <button
              key={s}
              onClick={() => setStreet(s)}
              style={{
                padding: "4px 13px",
                borderRadius: 16,
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: street === s ? "#e20074" : "#f0f0f0",
                color: street === s ? "white" : "#444",
              }}
            >
              {s === "alle" ? "Alle" : s}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
          {(["alle", "offen", "nichtErreicht", "termin", "abgelehnt"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "3px 10px",
                borderRadius: 14,
                border: "1px solid #ddd",
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: filter === f ? "#222" : "white",
                color: filter === f ? "white" : "#555",
              }}
            >
              {f === "alle" ? "Alle" : STATUS_META[f as StatusKey].label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "6px 14px 2px", fontSize: 11, color: "#aaa" }}>
        {filtered.length} Objekte
      </div>

      {/* CARDS */}
      <div style={{ padding: "2px 10px 100px" }}>
        {filtered.map((c) => {
          const st: StatusKey = statuses[c.bid] || "offen";
          const appt = appointments[c.bid] || "";
          const note = notes[c.bid] || "";
          const open = expanded === c.bid;
          return (
            <div
              key={c.bid}
              style={{
                background: cardBg(st),
                borderRadius: 11,
                marginBottom: 8,
                border: `2px solid ${cardBorder(st)}`,
                boxShadow: open ? "0 6px 20px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.07)",
                overflow: "hidden",
              }}
            >
              {/* Row */}
              <div
                onClick={() => setExpanded(open ? null : c.bid)}
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: STATUS_META[st].dot,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {c.strasse} {c.hnr}
                    <span
                      style={{
                        fontWeight: 400,
                        fontSize: 12,
                        color: "#888",
                        marginLeft: 6,
                      }}
                    >
                      {c.typ} · {c.we} WE
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#444",
                      marginTop: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.name}
                  </div>
                  {appt && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#16a34a",
                        fontWeight: 700,
                        marginTop: 2,
                      }}
                    >
                      🗓 {SLOT_LABEL[appt]}
                    </div>
                  )}
                </div>
                <div style={{ color: "#bbb", fontSize: 14 }}>{open ? "▲" : "▼"}</div>
              </div>

              {/* EXPANDED */}
              {open && (
                <div style={{ borderTop: "1px solid #eee", padding: "12px 12px 14px" }}>
                  {/* Leitfaden */}
                  <div
                    style={{
                      background: "#eef2ff",
                      borderRadius: 9,
                      padding: "9px 12px",
                      marginBottom: 12,
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: "#1e293b",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: "#6366f1",
                        letterSpacing: 1.2,
                        marginBottom: 4,
                      }}
                    >
                      LEITFADEN
                    </div>
                    „Guten Tag Herr/Frau <strong>{lastName(c.name)}</strong>, hier ist Störmer Bau im Auftrag der Telekom.
                    <br />
                    Wir sind aktuell in der <strong>{c.strasse}</strong> und setzen die Glasfaser-Hausanschlüsse um.
                    <br />
                    Passt es Ihnen <strong>diese Woche</strong> – <strong>vormittags ab 7:30 Uhr</strong> oder{" "}
                    <strong>nachmittags ab 13 Uhr</strong>?"
                  </div>

                  {/* Call buttons */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {c.mobil && (
                      <a
                        href={`tel:${c.mobil}`}
                        onClick={() => {
                          if (st === "offen") patch("statuses", c.bid, "angerufen");
                        }}
                        style={{
                          flex: 1,
                          background: "#e20074",
                          color: "white",
                          borderRadius: 9,
                          padding: "11px 6px",
                          textAlign: "center",
                          textDecoration: "none",
                          fontWeight: 700,
                          fontSize: 14,
                          display: "block",
                        }}
                      >
                        📱 Mobil
                        <br />
                        <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{c.mobil}</span>
                      </a>
                    )}
                    {c.festnetz && c.festnetz !== c.mobil && (
                      <a
                        href={`tel:${c.festnetz}`}
                        onClick={() => {
                          if (st === "offen") patch("statuses", c.bid, "angerufen");
                        }}
                        style={{
                          flex: 1,
                          background: "#1f2937",
                          color: "white",
                          borderRadius: 9,
                          padding: "11px 6px",
                          textAlign: "center",
                          textDecoration: "none",
                          fontWeight: 700,
                          fontSize: 14,
                          display: "block",
                        }}
                      >
                        ☎️ Festnetz
                        <br />
                        <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{c.festnetz}</span>
                      </a>
                    )}
                  </div>

                  {/* Status */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    {(["nichtErreicht", "abgelehnt"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => patch("statuses", c.bid, s)}
                        style={{
                          flex: 1,
                          padding: "7px 4px",
                          borderRadius: 8,
                          border: "1px solid #ddd",
                          fontSize: 12,
                          cursor: "pointer",
                          background: st === s ? "#374151" : "white",
                          color: st === s ? "white" : "#555",
                          fontWeight: st === s ? 700 : 400,
                        }}
                      >
                        {STATUS_META[s].label}
                      </button>
                    ))}
                  </div>

                  {/* Termin slots */}
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: "#888",
                      letterSpacing: 1,
                      marginBottom: 7,
                    }}
                  >
                    TERMIN
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      marginBottom: 12,
                    }}
                  >
                    {SLOT_DAYS.map(({ day, vm, nm }) => (
                      <div
                        key={day}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <div
                          style={{
                            width: 62,
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#555",
                            flexShrink: 0,
                          }}
                        >
                          {day}
                        </div>
                        {([
                          [vm, "☀️ Vorm."],
                          [nm, "🌤 Nachm."],
                        ] as const).map(([key, lbl]) => (
                          <button
                            key={key}
                            onClick={() => {
                              patch("appointments", c.bid, key);
                              patch("statuses", c.bid, "termin");
                            }}
                            style={{
                              flex: 1,
                              padding: "7px 0",
                              borderRadius: 7,
                              fontSize: 12,
                              cursor: "pointer",
                              fontWeight: appt === key ? 700 : 400,
                              border: `1.5px solid ${appt === key ? "#22c55e" : "#ddd"}`,
                              background: appt === key ? "#22c55e" : "white",
                              color: appt === key ? "white" : "#444",
                            }}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Note */}
                  <textarea
                    value={note}
                    onChange={(e) => patch("notes", c.bid, e.target.value)}
                    placeholder="Notiz..."
                    style={{
                      width: "100%",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      padding: "7px 9px",
                      fontSize: 13,
                      resize: "none",
                      boxSizing: "border-box",
                      height: 54,
                      fontFamily: "inherit",
                    }}
                  />
                  <div style={{ fontSize: 9, color: "#ddd", marginTop: 3 }}>BID {c.bid}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* BOTTOM BAR */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          background: "white",
          borderTop: "1px solid #e5e7eb",
          padding: "10px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 12, color: "#999" }}>
          {Object.values(statuses).filter((s) => s === "nichtErreicht").length} nicht erreicht &nbsp;·&nbsp;
          {Object.values(statuses).filter((s) => s === "abgelehnt").length} abgelehnt
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: 15,
            color: terminCount >= 4 ? "#16a34a" : "#e20074",
          }}
        >
          {terminCount} Termine ✓
        </div>
      </div>
    </div>
  );
}
