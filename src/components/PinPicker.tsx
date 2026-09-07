import { useEffect, useRef, useState } from "react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

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
    const s = document.createElement("script");
    s.src = LEAFLET_JS;
    s.async = true;
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return leafletPromise;
}

type Props = {
  label: string;
  lat: number | null;
  lng: number | null;
  onSave: (lat: number, lng: number) => void | Promise<void>;
  onClose: () => void;
};

export default function PinPicker({ label, lat, lng, onSave, onClose }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(
    lat != null && lng != null ? { lat, lng } : null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(() => {
      if (cancelled || !elRef.current || mapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = window.L as any;
      const start: [number, number] = lat != null && lng != null ? [lat, lng] : [51.2796, 11.2413];
      const map = L.map(elRef.current, { zoomControl: true }).setView(start, lat != null ? 19 : 14);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19, attribution: "Tiles © Esri" },
      ).addTo(map);
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
        { maxZoom: 21, maxNativeZoom: 19, attribution: "© CARTO" },
      ).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#e20074;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      if (lat != null && lng != null) {
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current.getLatLng();
          setPos({ lat: p.lat, lng: p.lng });
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("click", (e: any) => {
        const p = { lat: e.latlng.lat, lng: e.latlng.lng };
        setPos(p);
        if (markerRef.current) markerRef.current.setLatLng(e.latlng);
        else {
          markerRef.current = L.marker(e.latlng, { icon, draggable: true }).addTo(map);
          markerRef.current.on("dragend", () => {
            const q = markerRef.current.getLatLng();
            setPos({ lat: q.lat, lng: q.lng });
          });
        }
      });
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 120);
    });
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [lat, lng]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh" }}
      >
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>📍 Standort setzen</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{label} · auf das Haus tippen oder den Punkt ziehen</div>
        </div>
        <div ref={elRef} style={{ height: 380, width: "100%", background: "#e5e7eb" }} />
        <div style={{ padding: 10, display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 11, color: "#64748b", flex: 1 }}>
            {pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` : "Noch kein Punkt gewählt"}
          </div>
          <button onClick={onClose} style={{ background: "#e5e7eb", color: "#111", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Abbrechen</button>
          <button
            disabled={!pos || saving}
            onClick={async () => {
              if (!pos) return;
              setSaving(true);
              await onSave(pos.lat, pos.lng);
              setSaving(false);
              onClose();
            }}
            style={{ background: pos ? "#e20074" : "#f1a8ce", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 800, cursor: pos ? "pointer" : "not-allowed" }}
          >
            {saving ? "…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
