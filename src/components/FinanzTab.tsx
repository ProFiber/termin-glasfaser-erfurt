import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";

type FinRow = {
  bid: string;
  status: string;
  umsatz_eur: number | string;
  zusatz_eur: number | string;
  grabenlaenge: number;
  erledigt_datum: string | null;
  aufmass_am: string | null;
  gutschrift_nr: string;
  avis_am: string | null;
  verguetet_am: string | null;
  team: string;
};

type Ziel = {
  scope: string;
  ziel_eur: number;
  arbeitstage_pro_monat: number;
  saturday_buffer: boolean;
};

const EUR = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const EUR2 = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

// Arbeitstage Mo–Fr in einem Monat (Samstag = Puffer, also nicht im Soll)
function workdaysInMonth(year: number, month: number, saturdayBuffer: boolean) {
  let count = 0;
  const last = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const dow = new Date(year, month, day).getDay();
    if (dow === 0) continue; // Sonntag
    if (dow === 6 && saturdayBuffer) continue; // Samstag = Puffer
    count++;
  }
  return count;
}

function workdaysPassedInMonth(now: Date, saturdayBuffer: boolean) {
  let count = 0;
  for (let day = 1; day <= now.getDate(); day++) {
    const dow = new Date(now.getFullYear(), now.getMonth(), day).getDay();
    if (dow === 0) continue;
    if (dow === 6 && saturdayBuffer) continue;
    count++;
  }
  return count;
}

export default function FinanzTab() {
  const [rows, setRows] = useState<FinRow[]>([]);
  const [ziel, setZiel] = useState<Ziel | null>(null);
  const [haPreis, setHaPreis] = useState<number>(1200);
  const [loading, setLoading] = useState(true);
  const [editingZiel, setEditingZiel] = useState(false);
  const [zielInput, setZielInput] = useState("70000");
  const [haPreisInput, setHaPreisInput] = useState("1200");

  useEffect(() => {
    (async () => {
      const [{ data: cs }, { data: zList }] = await Promise.all([
        supabase
          .from("call_states")
          .select("bid,status,umsatz_eur,zusatz_eur,grabenlaenge,erledigt_datum,aufmass_am,gutschrift_nr,avis_am,verguetet_am,team"),
        supabase.from("umsatz_ziele").select("*"),
      ]);
      setRows((cs as FinRow[]) || []);
      const zMonat = (zList as Ziel[] | null)?.find((z) => z.scope === "monat");
      const zHa = (zList as Ziel[] | null)?.find((z) => z.scope === "ha_preis");
      if (zMonat) { setZiel(zMonat); setZielInput(String(zMonat.ziel_eur)); }
      if (zHa) { setHaPreis(Number(zHa.ziel_eur)); setHaPreisInput(String(zHa.ziel_eur)); }
      setLoading(false);
    })();


    const ch = supabase
      .channel("finanz_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_states" }, (payload) => {
        const r = (payload.new ?? payload.old) as FinRow;
        if (!r?.bid) return;
        setRows((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((x) => x.bid !== r.bid);
          const ex = prev.findIndex((x) => x.bid === r.bid);
          if (ex >= 0) {
            const copy = [...prev]; copy[ex] = r; return copy;
          }
          return [...prev, r];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const data = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = toIso(today);
    const weekStart = startOfWeek(today);
    const weekStartIso = toIso(weekStart);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartIso = toIso(monthStart);

    const erledigte = rows.filter((r) => r.status === "erledigt" && r.erledigt_datum);
    // EUR: realer Wert wenn eingetragen, sonst Pauschale pro HA
    const sumUmsatz = (rs: FinRow[]) =>
      rs.reduce((s, r) => {
        const real = Number(r.umsatz_eur || 0) + Number(r.zusatz_eur || 0);
        return s + (real > 0 ? real : haPreis);
      }, 0);
    const sumMeter = (rs: FinRow[]) =>
      rs.reduce((s, r) => s + Number(r.grabenlaenge || 0), 0);

    const heute = erledigte.filter((r) => r.erledigt_datum === todayIso);
    const woche = erledigte.filter((r) => r.erledigt_datum! >= weekStartIso);
    const monat = erledigte.filter((r) => r.erledigt_datum! >= monthStartIso);


    // Pipeline-Stände (Buchhaltung)
    const fertig = rows.filter((r) => r.status === "erledigt");
    const aufmassOffen = fertig.filter((r) => !r.aufmass_am);
    const gutschriftOffen = fertig.filter((r) => r.aufmass_am && !r.gutschrift_nr);
    const avisOffen = fertig.filter((r) => r.gutschrift_nr && !r.avis_am);
    const verguetetOffen = fertig.filter((r) => r.avis_am && !r.verguetet_am);
    const verguetet = fertig.filter((r) => r.verguetet_am);

    // Trend: letzte 30 Tage
    const trend: { tag: string; label: string; eur: number; meter: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const iso = toIso(d);
      const dayRows = erledigte.filter((r) => r.erledigt_datum === iso);
      trend.push({
        tag: iso,
        label: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`,
        eur: sumUmsatz(dayRows),
        meter: sumMeter(dayRows),
      });
    }

    // Pro Woche der letzten 12 Wochen
    const trendWoche: { label: string; eur: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const ws = new Date(weekStart); ws.setDate(weekStart.getDate() - i * 7);
      const we = new Date(ws); we.setDate(ws.getDate() + 7);
      const wsIso = toIso(ws), weIso = toIso(we);
      const wkRows = erledigte.filter((r) => r.erledigt_datum! >= wsIso && r.erledigt_datum! < weIso);
      trendWoche.push({
        label: `KW${getWeek(ws)}`,
        eur: sumUmsatz(wkRows),
      });
    }

    // Team-Vergleich (Monat)
    const teamMap = new Map<string, number>();
    for (const r of monat) {
      const t = (r.team || "ohne Team").trim() || "ohne Team";
      teamMap.set(t, (teamMap.get(t) || 0) + Number(r.umsatz_eur || 0) + Number(r.zusatz_eur || 0));
    }
    const teamData = Array.from(teamMap.entries())
      .map(([name, eur]) => ({ name, eur }))
      .sort((a, b) => b.eur - a.eur);

    // Ziele
    const zielMonat = ziel?.ziel_eur ?? 70_000;
    const satBuffer = ziel?.saturday_buffer ?? true;
    const arbeitstageMonat = workdaysInMonth(today.getFullYear(), today.getMonth(), satBuffer);
    const arbeitstagePassed = workdaysPassedInMonth(today, satBuffer);
    const tagesziel = zielMonat / arbeitstageMonat;
    const wochenziel = tagesziel * 5; // Mo-Fr
    const sollHeute = tagesziel * arbeitstagePassed;
    const umsatzMonat = sumUmsatz(monat);
    const umsatzWoche = sumUmsatz(woche);
    const umsatzHeute = sumUmsatz(heute);
    const fortschritt = (umsatzMonat / zielMonat) * 100;
    const sollIst = umsatzMonat - sollHeute; // positiv = über Soll
    // HA-Ziele
    const haZielMonat = haPreis > 0 ? zielMonat / haPreis : 0;
    const haTagesziel = haPreis > 0 ? tagesziel / haPreis : 0;
    const haWochenziel = haTagesziel * 5;
    const haSollHeute = haTagesziel * arbeitstagePassed;
    const haSollIst = monat.length - haSollHeute;

    const auftragsvolumen = sumUmsatz(fertig);
    const offeneBetraege = auftragsvolumen - sumUmsatz(verguetet);

    return {
      umsatzHeute, umsatzWoche, umsatzMonat,
      meterHeute: sumMeter(heute), meterWoche: sumMeter(woche), meterMonat: sumMeter(monat),
      countHeute: heute.length, countWoche: woche.length, countMonat: monat.length,
      zielMonat, tagesziel, wochenziel, sollHeute, fortschritt, sollIst,
      haZielMonat, haTagesziel, haWochenziel, haSollHeute, haSollIst,
      arbeitstageMonat, arbeitstagePassed, satBuffer,
      pipeline: {
        auftragsvolumen,
        verguetet: sumUmsatz(verguetet),
        offeneBetraege,
        aufmassOffen: { count: aufmassOffen.length, eur: sumUmsatz(aufmassOffen) },
        gutschriftOffen: { count: gutschriftOffen.length, eur: sumUmsatz(gutschriftOffen) },
        avisOffen: { count: avisOffen.length, eur: sumUmsatz(avisOffen) },
        verguetetOffen: { count: verguetetOffen.length, eur: sumUmsatz(verguetetOffen) },
      },
      trend, trendWoche, teamData,
    };
  }, [rows, ziel, haPreis]);

  async function saveZiel() {
    const v = parseFloat(zielInput.replace(/[^\d.]/g, ""));
    const p = parseFloat(haPreisInput.replace(/[^\d.]/g, ""));
    if (isFinite(v) && v > 0) {
      await supabase.from("umsatz_ziele").upsert({
        scope: "monat", ziel_eur: v, arbeitstage_pro_monat: ziel?.arbeitstage_pro_monat ?? 22,
        saturday_buffer: ziel?.saturday_buffer ?? true,
      }, { onConflict: "scope" });
      setZiel({ ...(ziel ?? { scope: "monat", arbeitstage_pro_monat: 22, saturday_buffer: true }), ziel_eur: v });
    }
    if (isFinite(p) && p > 0) {
      await supabase.from("umsatz_ziele").upsert({
        scope: "ha_preis", ziel_eur: p, arbeitstage_pro_monat: 22, saturday_buffer: true,
      }, { onConflict: "scope" });
      setHaPreis(p);
    }
    setEditingZiel(false);
  }


  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Lade Finanzdaten…</div>;
  }

  const overUnder = data.sollIst >= 0;

  return (
    <div style={{ padding: "12px 12px 80px", background: "#f7f8fa", minHeight: "100%" }}>
      {/* Hero: Monatsziel */}
      <div style={{
        background: "linear-gradient(135deg, #e20074 0%, #b8005c 100%)",
        color: "white", borderRadius: 14, padding: 16, marginBottom: 12,
        boxShadow: "0 4px 14px rgba(226,0,116,0.25)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.5 }}>Monatsziel</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>{EUR(data.umsatzMonat)}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>von {EUR(data.zielMonat)} ({data.fortschritt.toFixed(1)}%)</div>
          </div>
          <button
            onClick={() => setEditingZiel(true)}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", borderRadius: 8, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}
          >
            ⚙ Ziel
          </button>
        </div>
        {/* Progress */}
        <div style={{ height: 12, background: "rgba(255,255,255,0.2)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
          <div style={{
            width: `${Math.min(100, data.fortschritt)}%`,
            height: "100%",
            background: "linear-gradient(90deg, #fbbf24, #fde047)",
            transition: "width 0.4s",
          }} />
          {/* Soll-Marker */}
          <div style={{
            position: "absolute", top: -2, bottom: -2,
            left: `${Math.min(100, (data.sollHeute / data.zielMonat) * 100)}%`,
            width: 2, background: "white", boxShadow: "0 0 4px rgba(0,0,0,0.4)",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, opacity: 0.9 }}>
          <span>Soll heute: {EUR(data.sollHeute)}</span>
          <span style={{ fontWeight: 700 }}>
            {overUnder ? "▲" : "▼"} {EUR(Math.abs(data.sollIst))} {overUnder ? "über" : "unter"} Soll
          </span>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, opacity: 0.7 }}>
          {data.arbeitstagePassed}/{data.arbeitstageMonat} Arbeitstage · {data.satBuffer ? "Sa = Puffer" : "Sa zählt"}
        </div>
      </div>

      {editingZiel && (
        <div style={{ background: "white", borderRadius: 10, padding: 12, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Monatsziel anpassen</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={zielInput}
              onChange={(e) => setZielInput(e.target.value)}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 16 }}
            />
            <button onClick={saveZiel} style={{ padding: "8px 14px", background: "#22c55e", color: "white", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
              Speichern
            </button>
            <button onClick={() => setEditingZiel(false)} style={{ padding: "8px 12px", background: "#f3f4f6", border: "none", borderRadius: 8, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* KPI-Cards: Heute / Woche / Monat */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <KpiCard title="Heute" eur={data.umsatzHeute} ziel={data.tagesziel} meter={data.meterHeute} count={data.countHeute} color="#3b82f6" />
        <KpiCard title="Woche" eur={data.umsatzWoche} ziel={data.wochenziel} meter={data.meterWoche} count={data.countWoche} color="#8b5cf6" />
        <KpiCard title="Monat" eur={data.umsatzMonat} ziel={data.zielMonat} meter={data.meterMonat} count={data.countMonat} color="#22c55e" />
      </div>

      {/* Trend Tage */}
      <Card title="Umsatz pro Tag (30 Tage)">
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={data.trend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={3} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                formatter={(v: number) => EUR(v)}
                labelFormatter={(l) => `Tag ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="eur" fill="#e20074" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Trend Wochen */}
      <Card title="Umsatz pro Woche (12 Wochen)">
        <div style={{ height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={data.trendWoche} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => EUR(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="eur" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Buchhaltungs-Pipeline */}
      <Card title="Buchhaltungs-Pipeline">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <PipelineStep label="Auftragsvolumen" eur={data.pipeline.auftragsvolumen} color="#6366f1" />
          <PipelineStep label="Vergütet" eur={data.pipeline.verguetet} color="#22c55e" />
          <PipelineStep label="Aufmaß offen" eur={data.pipeline.aufmassOffen.eur} count={data.pipeline.aufmassOffen.count} color="#fb923c" />
          <PipelineStep label="Gutschrift offen" eur={data.pipeline.gutschriftOffen.eur} count={data.pipeline.gutschriftOffen.count} color="#f59e0b" />
          <PipelineStep label="AVIS offen" eur={data.pipeline.avisOffen.eur} count={data.pipeline.avisOffen.count} color="#3b82f6" />
          <PipelineStep label="Zahlung offen" eur={data.pipeline.verguetetOffen.eur} count={data.pipeline.verguetetOffen.count} color="#ef4444" />
        </div>
        <div style={{ marginTop: 10, padding: 10, background: "#fef3c7", borderRadius: 8, fontSize: 12, color: "#78350f", fontWeight: 600 }}>
          💰 Offene Beträge gesamt: <span style={{ fontSize: 15 }}>{EUR2(data.pipeline.offeneBetraege)}</span>
        </div>
      </Card>

      {/* Team-Vergleich */}
      {data.teamData.length > 0 && (
        <Card title="Team-Vergleich (Monat)">
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.teamData}
                  dataKey="eur"
                  nameKey="name"
                  cx="50%" cy="50%"
                  outerRadius={65}
                  label={(e: { name: string; eur: number }) => `${e.name}: ${EUR(e.eur)}`}
                  labelLine={false}
                  fontSize={10}
                >
                  {data.teamData.map((_, i) => (
                    <Cell key={i} fill={["#e20074","#3b82f6","#22c55e","#fb923c","#8b5cf6","#94a3b8"][i % 6]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => EUR(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Footer-Hinweis */}
      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 10, marginTop: 16 }}>
        Live-Daten · Samstag = Puffertag
      </div>
    </div>
  );
}

function KpiCard({ title, eur, ziel, meter, count, color }: { title: string; eur: number; ziel: number; meter: number; count: number; color: string }) {
  const pct = ziel > 0 ? (eur / ziel) * 100 : 0;
  return (
    <div style={{ background: "white", borderRadius: 10, padding: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.3 }}>{title}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color, marginTop: 2, lineHeight: 1.1 }}>{EUR(eur)}</div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>Ziel {EUR(ziel)}</div>
      <div style={{ height: 4, background: "#f3f4f6", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10, color: "#6b7280" }}>
        <span>{count} HA</span>
        <span>{meter} m</span>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 10, padding: 12, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function PipelineStep({ label, eur, count, color }: { label: string; eur: number; count?: number; color: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>
      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>{EUR(eur)}</div>
      {count !== undefined && <div style={{ fontSize: 10, color: "#9ca3af" }}>{count} HA</div>}
    </div>
  );
}

function getWeek(d: Date) {
  const date = new Date(d.valueOf());
  const dayNum = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayNum + 3);
  const firstThursday = date.valueOf();
  date.setMonth(0, 1);
  if (date.getDay() !== 4) date.setMonth(0, 1 + ((4 - date.getDay()) + 7) % 7);
  return 1 + Math.ceil((firstThursday - date.valueOf()) / 604800000);
}
