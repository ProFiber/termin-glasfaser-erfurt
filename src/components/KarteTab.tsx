import { useEffect, useMemo, useRef, useState } from "react";
import type { Contact, CallState, CallStatus } from "@/lib/types";

type Props = {
  contacts: Contact[];
  states: Record<string, CallState>;
  onOpenContact: (bid: string) => void;
};

const MAGENTA = "#e20074";

const STATUS_COLOR: Record<CallStatus, string> = {
  offen: "#9ca3af",
  angerufen: "#facc15",
  termin: "#22c55e",
  nichtErreicht: "#fb923c",
  abgelehnt: "#ef4444",
  erledigt: "#3b82f6",
};

const STATUS_LABEL: Record<CallStatus, string> = {
  offen: "Offen",
  angerufen: "Angerufen",
  termin: "Termin",
  nichtErreicht: "Nicht erreicht",
  abgelehnt: "Abgelehnt",
  erledigt: "Erledigt",
};

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { L?: any } }

let leafletPromise: Promise<unknown> | null = null;
function loadLeaflet(): Promise<unknown> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(window.L));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function addressOf(c: Contact): string {
  return `${c.strasse} ${c.hnr}${c.hnr_zusatz}, ${c.plz} ${c.ort}, Germany`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function KarteTab({ contacts, states, onOpenContact }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Record<string, any>>({});
  const [ready, setReady] = useState(false);
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({});
  const [geocoding, setGeocoding] = useState(false);
  const [filter, setFilter] = useState<"alle" | CallStatus>("alle");
  const [selected, setSelected] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const firstLocFixRef = useRef(true);

  const stopWatching = () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopWatching();
    };
  }, []);

  const handleLocate = () => {
    if (!mapRef.current || !window.L) return;
    if (!navigator.geolocation) {
      setLocError("Geolocation nicht unterstützt");
      setTimeout(() => setLocError(null), 3000);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = window.L as any;
    const map = mapRef.current;

    // Inject pulse CSS once
    if (!document.getElementById("user-loc-pulse-style")) {
      const style = document.createElement("style");
      style.id = "user-loc-pulse-style";
      style.textContent = `
        @keyframes userLocPulse {
          0% { transform: scale(1); opacity: 0.6; }
          70% { transform: scale(2.6); opacity: 0; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        .user-loc-wrap { position: relative; width: 18px; height: 18px; }
        .user-loc-pulse {
          position: absolute; inset: 0; border-radius: 50%;
          background: #1d8bf8; opacity: 0.5;
          animation: userLocPulse 1.8s ease-out infinite;
        }
        .user-loc-dot {
          position: absolute; inset: 0; border-radius: 50%;
          background: #1d8bf8; border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }
      `;
      document.head.appendChild(style);
    }

    setLocError(null);
    setLocating(true);
    firstLocFixRef.current = true;
    stopWatching();

    const onPos = (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords;
      const html = `<div class="user-loc-wrap"><div class="user-loc-pulse"></div><div class="user-loc-dot"></div></div>`;
      const icon = L.divIcon({ html, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([latitude, longitude]);
        userMarkerRef.current.setIcon(icon);
      } else {
        userMarkerRef.current = L.marker([latitude, longitude], { icon, zIndexOffset: 1000 }).addTo(map);
      }
      if (firstLocFixRef.current) {
        map.setView([latitude, longitude], 16);
        firstLocFixRef.current = false;
        setLocating(false);
      }
    };

    const onErr = (err: GeolocationPositionError) => {
      setLocating(false);
      const msg = err.code === err.PERMISSION_DENIED
        ? "Standort verweigert"
        : err.code === err.POSITION_UNAVAILABLE
        ? "Standort nicht verfügbar"
        : "Standort-Fehler";
      setLocError(msg);
      setTimeout(() => setLocError(null), 3500);
    };

    navigator.geolocation.getCurrentPosition(onPos, onErr, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
    watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 5000,
    });
  };

  // Initialize map
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Lmod = L as any;
      if (cancelled || !mapEl.current || mapRef.current) return;
      let view: { lat: number; lng: number; zoom: number } = { lat: 51.31, lng: 11.21, zoom: 13 };
      try {
        const stored = sessionStorage.getItem("karte_view");
        if (stored) view = JSON.parse(stored);
      } catch { /* ignore */ }
      const map = Lmod.map(mapEl.current).setView([view.lat, view.lng], view.zoom);
      Lmod.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      map.on("moveend zoomend", () => {
        const c = map.getCenter();
        try {
          sessionStorage.setItem("karte_view", JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
        } catch { /* ignore */ }
      });
      mapRef.current = map;
      setReady(true);
    }).catch((e) => console.error("Leaflet load failed", e));
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current = {};
    };
  }, []);

  // Seed coords from contacts and geocode missing
  useEffect(() => {
    const seed: Record<string, { lat: number; lng: number }> = {};
    contacts.forEach((c) => {
      if (c.lat != null && c.lng != null) seed[c.bid] = { lat: c.lat, lng: c.lng };
    });
    setCoords((prev) => ({ ...seed, ...prev }));

    let cancelled = false;
    (async () => {
      const missing = contacts.filter((c) => !(c.bid in seed));
      if (missing.length === 0) return;
      setGeocoding(true);
      for (const c of missing) {
        if (cancelled) break;
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addressOf(c))}`;
          const res = await fetch(url, { headers: { "Accept-Language": "de" } });
          const json = (await res.json()) as Array<{ lat: string; lon: string }>;
          if (json && json[0]) {
            const lat = parseFloat(json[0].lat);
            const lng = parseFloat(json[0].lon);
            if (!cancelled) setCoords((p) => ({ ...p, [c.bid]: { lat, lng } }));
          }
        } catch (e) {
          console.warn("geocode failed", c.bid, e);
        }
        await sleep(200);
      }
      if (!cancelled) setGeocoding(false);
    })();
    return () => { cancelled = true; };
  }, [contacts]);

  const visibleContacts = useMemo(
    () => contacts.filter((c) => filter === "alle" || (states[c.bid]?.status ?? "offen") === filter),
    [contacts, states, filter],
  );

  // Render markers
  useEffect(() => {
    if (!ready || !mapRef.current || !window.L) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = window.L as any;
    const map = mapRef.current;
    const visibleIds = new Set(visibleContacts.map((c) => c.bid));

    // Remove markers no longer visible
    Object.keys(markersRef.current).forEach((bid) => {
      if (!visibleIds.has(bid) || !coords[bid]) {
        map.removeLayer(markersRef.current[bid]);
        delete markersRef.current[bid];
      }
    });

    visibleContacts.forEach((c) => {
      const co = coords[c.bid];
      if (!co) return;
      const status = (states[c.bid]?.status ?? "offen") as CallStatus;
      const color = STATUS_COLOR[status];
      const html = `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`;
      const icon = L.divIcon({ html, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
      const existing = markersRef.current[c.bid];
      if (existing) {
        existing.setLatLng([co.lat, co.lng]);
        existing.setIcon(icon);
      } else {
        const m = L.marker([co.lat, co.lng], { icon }).addTo(map);
        m.on("click", () => setSelected(c.bid));
        markersRef.current[c.bid] = m;
      }
    });
  }, [ready, visibleContacts, coords, states]);

  const selectedContact = selected ? contacts.find((c) => c.bid === selected) : null;
  const selectedStatus = (selectedContact && (states[selectedContact.bid]?.status ?? "offen")) as CallStatus | undefined;
  const selectedState = selectedContact ? states[selectedContact.bid] : undefined;

  return (
    <div style={{ position: "relative", height: "100%", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Filter bar */}
      <div
        style={{
          position: "absolute", top: 8, left: 8, right: 8, zIndex: 1000,
          display: "flex", gap: 6, overflowX: "auto", padding: 6,
          background: "rgba(255,255,255,0.95)", borderRadius: 10,
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      >
        {(["alle", "offen", "angerufen", "termin", "nichtErreicht", "abgelehnt", "erledigt"] as const).map((k) => {
          const active = filter === k;
          const color = k === "alle" ? MAGENTA : STATUS_COLOR[k as CallStatus];
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={{
                padding: "5px 10px", borderRadius: 999,
                border: `1.5px solid ${active ? color : "#e5e7eb"}`,
                background: active ? color : "white",
                color: active ? "white" : "#475569",
                fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {k === "alle" ? "Alle" : STATUS_LABEL[k as CallStatus]}
            </button>
          );
        })}
      </div>

      {/* Geocoding banner */}
      {geocoding && (
        <div
          style={{
            position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)",
            zIndex: 1000, background: "white", padding: "6px 12px", borderRadius: 8,
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)", fontSize: 12, fontWeight: 600, color: "#475569",
          }}
        >
          ⏳ Adressen werden geocodiert…
        </div>
      )}

      {/* My location button */}
      <button
        onClick={handleLocate}
        aria-label="Mein Standort"
        style={{
          position: "absolute", top: 56, right: 8, zIndex: 1001,
          width: 40, height: 40, borderRadius: 10, border: "none",
          background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          cursor: "pointer", fontSize: 18, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}
      >
        {locating ? (
          <span
            style={{
              width: 16, height: 16, borderRadius: "50%",
              border: "2px solid #e5e7eb", borderTopColor: "#1d8bf8",
              animation: "userLocSpin 0.8s linear infinite",
              display: "inline-block",
            }}
          />
        ) : "📍"}
        <style>{`@keyframes userLocSpin { to { transform: rotate(360deg); } }`}</style>
      </button>

      {locError && (
        <div
          style={{
            position: "absolute", top: 104, right: 8, zIndex: 1001,
            background: "#fee2e2", color: "#991b1b", padding: "6px 10px",
            borderRadius: 8, fontSize: 12, fontWeight: 600,
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          }}
        >
          ⚠️ {locError}
        </div>
      )}

      {/* Legend top-right */}
      <div
        style={{
          position: "absolute", top: 104, right: 8, zIndex: 1000,
          background: "rgba(255,255,255,0.95)", borderRadius: 8, padding: 8,
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)", fontSize: 11,
        }}
      >
        {(Object.keys(STATUS_COLOR) as CallStatus[]).map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_COLOR[s], display: "inline-block" }} />
            <span style={{ color: "#334155" }}>{STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>

      {/* Map */}
      <div ref={mapEl} style={{ position: "absolute", inset: 0, background: "#e5e7eb" }} />

      {/* Bottom sheet */}
      {selectedContact && (
        <div
          style={{
            position: "absolute", left: 8, right: 8, bottom: 8, zIndex: 1000,
            background: "white", borderRadius: 11, padding: 14,
            boxShadow: "0 -2px 12px rgba(0,0,0,0.15)",
          }}
        >
          <button
            onClick={() => setSelected(null)}
            style={{
              position: "absolute", top: 8, right: 8, border: "none", background: "#f1f5f9",
              width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontWeight: 700, color: "#475569",
            }}
            aria-label="Schließen"
          >×</button>

          <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", paddingRight: 32 }}>
            {selectedContact.strasse} {selectedContact.hnr}{selectedContact.hnr_zusatz}
          </div>
          <div style={{ fontSize: 13, color: "#475569" }}>{selectedContact.name}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {[selectedContact.typ, selectedContact.we ? `${selectedContact.we} WE` : ""].filter(Boolean).join(" · ")}
            {selectedContact.nvt ? ` · NVT ${selectedContact.nvt}` : ""}
          </div>

          {selectedStatus && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_COLOR[selectedStatus], display: "inline-block" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{STATUS_LABEL[selectedStatus]}</span>
            </div>
          )}

          {selectedState?.termin_datum && (
            <div style={{ fontSize: 12, color: "#0891b2", marginTop: 4, fontWeight: 600 }}>
              📅 {selectedState.termin_datum} {selectedState.termin_slot ? `· ${selectedState.termin_slot.toUpperCase()}` : ""}{selectedState.termin_zeit ? ` · ${selectedState.termin_zeit}` : ""}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {(selectedContact.mobil || selectedContact.festnetz) && (
              <a
                href={`tel:${selectedContact.mobil || selectedContact.festnetz}`}
                style={{
                  flex: "1 1 30%", textAlign: "center", padding: "10px",
                  borderRadius: 8, background: MAGENTA, color: "white",
                  textDecoration: "none", fontWeight: 700, fontSize: 12,
                }}
              >📱 Anrufen</a>
            )}
            <a
              href={`https://www.google.com/maps?q=${encodeURIComponent(`${selectedContact.strasse} ${selectedContact.hnr}${selectedContact.hnr_zusatz}, ${selectedContact.plz} ${selectedContact.ort}`)}`}
              target="_blank"
              rel="noreferrer"
              style={{
                flex: "1 1 30%", textAlign: "center", padding: "10px",
                borderRadius: 8, background: "#f1f5f9", color: "#0f172a",
                textDecoration: "none", fontWeight: 700, fontSize: 12,
              }}
            >🗺️ Google Maps</a>
            <button
              onClick={() => { onOpenContact(selectedContact.bid); setSelected(null); }}
              style={{
                flex: "1 1 30%", padding: "10px", borderRadius: 8,
                background: "#0f172a", color: "white", border: "none",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}
            >📞 Zur Call-Liste</button>
          </div>
        </div>
      )}
    </div>
  );
}
