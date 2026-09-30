import { createServerFn } from "@tanstack/react-start";

const CAL_ID =
  "e1d869922df204c3d8ca943a0c17a7f191b4d87f605c2683abdb4838da3aba2d@group.calendar.google.com";
const GW = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const DAY_CODES = ["so", "mo", "di", "mi", "do", "fr", "sa"];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/straße|strasse/g, "str.")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9äöüß.]/g, "");

type GEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  updated?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export const syncGoogleCalendar = createServerFn({ method: "POST" }).handler(async () => {
  const lovKey = process.env["LOVABLE_API_KEY"];
  const calKey = process.env["GOOGLE_CALENDAR_API_KEY"];
  if (!lovKey || !calKey) throw new Error("Google Kalender ist nicht verbunden.");
  const headers = {
    Authorization: `Bearer ${lovKey}`,
    "X-Connection-Api-Key": calKey,
    "Content-Type": "application/json",
  };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Berlin today
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

  // Google events from today
  const events: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      timeMin: `${today}T00:00:00+02:00`,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) q.set("pageToken", pageToken);
    const r = await fetch(`${GW}/calendars/${encodeURIComponent(CAL_ID)}/events?${q}`, { headers });
    if (!r.ok) throw new Error(`Google [${r.status}]: ${await r.text()}`);
    const j = (await r.json()) as { items: GEvent[]; nextPageToken?: string };
    events.push(...(j.items ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);

  // All contacts (for address matching) + states
  const contacts: Array<{ bid: string; strasse: string; hnr: string; hnr_zusatz: string; name: string; mobil: string; festnetz: string; nvt: string; storniert: boolean }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("bid,strasse,hnr,hnr_zusatz,name,mobil,festnetz,nvt,storniert")
      .range(from, from + 999);
    if (error) throw error;
    contacts.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const states: Array<{ bid: string; status: string; termin_datum: string | null; termin_zeit: string; klarfall: boolean; notiz: string; team: string; updated_at: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("call_states")
      .select("bid,status,termin_datum,termin_zeit,klarfall,notiz,team,updated_at")
      .range(from, from + 999);
    if (error) throw error;
    states.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const stateBy = new Map(states.map((s) => [s.bid, s]));
  const addrKey = (c: { strasse: string; hnr: string; hnr_zusatz: string }) =>
    norm(`${c.strasse}${c.hnr}${c.hnr_zusatz}`);
  const byAddr = new Map<string, (typeof contacts)[number]>();
  for (const c of contacts) byAddr.set(addrKey(c), c);

  const eventBid = (e: GEvent): string | null => {
    const p = e.extendedProperties?.private?.bid;
    if (p) return p;
    const loc = (e.location ?? "").split(",")[0];
    if (loc) {
      const c = byAddr.get(norm(loc));
      if (c) return c.bid;
    }
    return null;
  };
  const eventBids = new Set<string>();
  const eventByBid = new Map<string, GEvent>();
  for (const e of events) {
    const b = eventBid(e);
    if (b) {
      eventBids.add(b);
      if (!eventByBid.has(b)) eventByBid.set(b, e);
    }
  }

  const created: string[] = [];
  const imported: string[] = [];
  const updated: string[] = [];
  const unmatched: string[] = [];

  // Verschobene Termine: neuere Änderung gewinnt
  for (const s of states) {
    if (s.status !== "termin" || !s.termin_datum) continue;
    const e = eventByBid.get(s.bid);
    const dt = e?.start?.dateTime;
    if (!e || !dt) continue;
    const time = s.termin_zeit || "08:00";
    if (dt.slice(0, 10) === s.termin_datum && dt.slice(11, 16) === time) continue;
    // Zuletzt geänderte Seite gewinnt
    if (e.updated && new Date(e.updated).getTime() > new Date(s.updated_at).getTime()) {
      const gd = dt.slice(0, 10);
      const gt = dt.slice(11, 16);
      const dow = new Date(`${gd}T12:00:00`).getDay();
      const slot = `${DAY_CODES[dow]}-${Number(gt.slice(0, 2)) < 12 ? "vm" : "nm"}`;
      const { error } = await supabaseAdmin
        .from("call_states")
        .update({ termin_datum: gd, termin_zeit: gt, termin_slot: slot })
        .eq("bid", s.bid);
      if (error) throw error;
      const c0 = contacts.find((x) => x.bid === s.bid);
      const a0 = c0 ? `${c0.strasse} ${c0.hnr}${c0.hnr_zusatz ? " " + c0.hnr_zusatz : ""}` : s.bid;
      imported.push(`${a0} → aus Google verschoben auf ${gd.split("-").reverse().join(".")} ${gt}`);
      continue;
    }
    const [h, m] = time.split(":").map(Number);
    const end = `${String(Math.min(h + 2, 23)).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
    const r = await fetch(`${GW}/calendars/${encodeURIComponent(CAL_ID)}/events/${e.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        start: { dateTime: `${s.termin_datum}T${time}:00`, timeZone: "Europe/Berlin" },
        end: { dateTime: `${s.termin_datum}T${end}:00`, timeZone: "Europe/Berlin" },
      }),
    });
    if (!r.ok) throw new Error(`Google [${r.status}]: ${await r.text()}`);
    const c = contacts.find((x) => x.bid === s.bid);
    const addr = c ? `${c.strasse} ${c.hnr}${c.hnr_zusatz ? " " + c.hnr_zusatz : ""}` : s.bid;
    updated.push(`${addr} → ${s.termin_datum.split("-").reverse().join(".")} ${time}`);
  }

  // App -> Google
  for (const s of states) {
    if (s.status !== "termin" || !s.termin_datum || s.termin_datum < today) continue;
    const c = contacts.find((x) => x.bid === s.bid);
    if (!c || c.storniert || eventBids.has(s.bid)) continue;
    const addr = `${c.strasse} ${c.hnr}${c.hnr_zusatz ? " " + c.hnr_zusatz : ""}`;
    const time = s.termin_zeit || "08:00";
    const [h, m] = time.split(":").map(Number);
    const end = `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
    const body = {
      summary: `HA (${c.nvt.replace("2V", "")}) – ${c.name.split(" ").pop() ?? ""} – ${addr} – AB ${time}${s.klarfall ? " – ⚠️ KLÄRFALL" : ""}`,
      location: `${addr}, 06577 An der Schmücke`,
      description: `Eigentümer/Kontakt: ${c.name}${c.mobil || c.festnetz ? ", " + (c.mobil || c.festnetz) : ""}\n${s.notiz ? "Notiz: " + s.notiz + "\n" : ""}(aus Termin-App)`,
      start: { dateTime: `${s.termin_datum}T${time}:00`, timeZone: "Europe/Berlin" },
      end: { dateTime: `${s.termin_datum}T${end}:00`, timeZone: "Europe/Berlin" },
      extendedProperties: { private: { bid: c.bid } },
    };
    const r = await fetch(`${GW}/calendars/${encodeURIComponent(CAL_ID)}/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Google [${r.status}]: ${await r.text()}`);
    created.push(`${addr} (${s.termin_datum.split("-").reverse().join(".")} ${time})`);
  }

  // Google -> App
  for (const e of events) {
    const dt = e.start?.dateTime;
    if (!dt) continue;
    const bid = eventBid(e);
    if (!bid) {
      unmatched.push(e.summary ?? "(ohne Titel)");
      continue;
    }
    const c = contacts.find((x) => x.bid === bid);
    const s = stateBy.get(bid);
    if (!c || c.storniert) continue;
    if (s && (s.status === "erledigt" || s.status === "abgelehnt")) continue;
    const date = dt.slice(0, 10);
    const time = dt.slice(11, 16);
    if (s?.status === "termin" && s.termin_datum) continue; // App hat bereits Termin
    const dow = new Date(`${date}T12:00:00`).getDay();
    const slot = `${DAY_CODES[dow]}-${Number(time.slice(0, 2)) < 12 ? "vm" : "nm"}`;
    const { error } = await supabaseAdmin.from("call_states").upsert(
      {
        bid,
        status: "termin",
        termin_datum: date,
        termin_zeit: time,
        termin_slot: slot,
        team: s?.team || "team1",
      },
      { onConflict: "bid" },
    );
    if (error) throw error;
    imported.push(`${c.strasse} ${c.hnr}${c.hnr_zusatz ? " " + c.hnr_zusatz : ""} (${date.split("-").reverse().join(".")} ${time})`);
  }

  return { created, imported, updated, unmatched };
});
