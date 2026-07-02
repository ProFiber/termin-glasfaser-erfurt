import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Contact, CallState, CallStatus } from "@/lib/types";
import { Phone, Smartphone, ArrowLeft, CheckCircle2, XCircle, CalendarClock, PhoneOff } from "lucide-react";

export const Route = createFileRoute("/calls")({
  head: () => ({
    meta: [
      { title: "Kurz-Objekte abtelefonieren" },
      { name: "description", content: "Telefonliste der Kurz-Grabenobjekte" },
    ],
  }),
  component: CallsPage,
});

type Row = {
  contact: Contact;
  state: CallState;
};

const STATUS_META: Record<CallStatus, { label: string; cls: string }> = {
  offen: { label: "Offen", cls: "bg-muted text-foreground" },
  angerufen: { label: "Angerufen", cls: "bg-blue-100 text-blue-900" },
  nichtErreicht: { label: "Nicht erreicht", cls: "bg-amber-100 text-amber-900" },
  termin: { label: "Termin", cls: "bg-emerald-100 text-emerald-900" },
  abgelehnt: { label: "Abgelehnt", cls: "bg-rose-100 text-rose-900" },
  erledigt: { label: "Erledigt", cls: "bg-emerald-600 text-white" },
};

type Filter = "offen" | "alle";

function CallsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("offen");
  const [saving, setSaving] = useState<string | null>(null);
  const [openNotiz, setOpenNotiz] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: cs } = await supabase
      .from("call_states")
      .select("*")
      .eq("kurz_kandidat", true);
    const bids = (cs ?? []).map((c) => c.bid);
    if (!bids.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data: cts } = await supabase.from("contacts").select("*").in("bid", bids);
    const map = new Map((cts ?? []).map((c) => [c.bid, c as Contact]));
    const list: Row[] = (cs ?? [])
      .map((s) => ({ contact: map.get(s.bid)!, state: s as CallState }))
      .filter((r) => r.contact)
      .sort((a, b) => {
        const k = (r: Row) => `${r.contact.strasse} ${r.contact.hnr.padStart(4, "0")}${r.contact.hnr_zusatz}`;
        return k(a).localeCompare(k(b));
      });
    setRows(list);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "alle") return rows;
    return rows.filter((r) => r.state.status === "offen" || r.state.status === "nichtErreicht");
  }, [rows, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { offen: 0, angerufen: 0, nichtErreicht: 0, termin: 0, abgelehnt: 0, erledigt: 0 };
    rows.forEach((r) => (c[r.state.status] = (c[r.state.status] ?? 0) + 1));
    return c;
  }, [rows]);

  async function setStatus(bid: string, status: CallStatus) {
    setSaving(bid);
    const cur = rows.find((r) => r.contact.bid === bid)?.state;
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "erledigt" && !cur?.erledigt_datum) {
      const d = new Date();
      patch.erledigt_datum = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    await supabase.from("call_states").update(patch).eq("bid", bid);
    setRows((rs) => rs.map((r) => (r.contact.bid === bid ? { ...r, state: { ...r.state, ...patch } as typeof r.state } : r)));
    setSaving(null);
  }

  async function saveNotiz(bid: string, notiz: string) {
    await supabase.from("call_states").update({ notiz, updated_at: new Date().toISOString() }).eq("bid", bid);
    setRows((rs) => rs.map((r) => (r.contact.bid === bid ? { ...r, state: { ...r.state, notiz } } : r)));
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-3">
          <Link to="/" className="rounded-md p-2 hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">Kurz-Objekte abtelefonieren</h1>
            <p className="text-xs text-muted-foreground">
              {rows.length} markiert · offen {counts.offen + counts.nichtErreicht} · angerufen {counts.angerufen} · Termin {counts.termin} · erledigt {counts.erledigt}
            </p>
          </div>
          <div className="flex rounded-md border bg-background p-0.5 text-xs">
            <button
              onClick={() => setFilter("offen")}
              className={`px-2 py-1 rounded ${filter === "offen" ? "bg-primary text-primary-foreground" : ""}`}
            >
              Offen
            </button>
            <button
              onClick={() => setFilter("alle")}
              className={`px-2 py-1 rounded ${filter === "alle" ? "bg-primary text-primary-foreground" : ""}`}
            >
              Alle
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-2 px-3 py-3">
        {loading && <p className="text-sm text-muted-foreground">Lade…</p>}
        {!loading && filtered.length === 0 && (
          <p className="rounded-md border bg-card p-4 text-center text-sm text-muted-foreground">
            Keine Objekte in dieser Ansicht.
          </p>
        )}
        {filtered.map((r) => {
          const c = r.contact;
          const s = r.state;
          const addr = `${c.strasse} ${c.hnr}${c.hnr_zusatz}`;
          const meta = STATUS_META[s.status];
          const isSaving = saving === c.bid;
          return (
            <article key={c.bid} className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-base font-semibold leading-tight">{addr}</div>
                  <div className="text-sm text-muted-foreground">
                    {c.name || "—"} · {c.typ} {c.we}/{c.ge}
                  </div>
                  <div className="text-xs text-muted-foreground">NVT {c.nvt}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
                  {meta.label}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {c.mobil && (
                  <a
                    href={`tel:${c.mobil}`}
                    className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                  >
                    <Smartphone className="h-4 w-4" /> Mobil
                  </a>
                )}
                {c.festnetz && (
                  <a
                    href={`tel:${c.festnetz}`}
                    className="flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
                  >
                    <Phone className="h-4 w-4" /> Festnetz
                  </a>
                )}
                {!c.mobil && !c.festnetz && (
                  <div className="col-span-2 rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
                    Keine Telefonnummer hinterlegt
                  </div>
                )}
              </div>

              <div className="mt-2 grid grid-cols-4 gap-1">
                <button
                  disabled={isSaving}
                  onClick={() => setStatus(c.bid, "angerufen")}
                  className="flex flex-col items-center gap-0.5 rounded-md border p-2 text-xs hover:bg-muted disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" /> Angerufen
                </button>
                <button
                  disabled={isSaving}
                  onClick={() => setStatus(c.bid, "nichtErreicht")}
                  className="flex flex-col items-center gap-0.5 rounded-md border p-2 text-xs hover:bg-muted disabled:opacity-50"
                >
                  <PhoneOff className="h-4 w-4" /> n. erreicht
                </button>
                <button
                  disabled={isSaving}
                  onClick={() => setStatus(c.bid, "termin")}
                  className="flex flex-col items-center gap-0.5 rounded-md border p-2 text-xs hover:bg-muted disabled:opacity-50"
                >
                  <CalendarClock className="h-4 w-4" /> Termin
                </button>
                <button
                  disabled={isSaving}
                  onClick={() => setStatus(c.bid, "abgelehnt")}
                  className="flex flex-col items-center gap-0.5 rounded-md border p-2 text-xs hover:bg-muted disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" /> Abgelehnt
                </button>
              </div>

              <div className="mt-2">
                <button
                  onClick={() => setOpenNotiz(openNotiz === c.bid ? null : c.bid)}
                  className="text-xs text-muted-foreground underline"
                >
                  {openNotiz === c.bid ? "Notiz schließen" : s.notiz ? `Notiz: ${s.notiz.slice(0, 40)}${s.notiz.length > 40 ? "…" : ""}` : "+ Notiz"}
                </button>
                {openNotiz === c.bid && (
                  <textarea
                    defaultValue={s.notiz}
                    onBlur={(e) => saveNotiz(c.bid, e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                    placeholder="Notiz zum Anruf…"
                  />
                )}
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}
