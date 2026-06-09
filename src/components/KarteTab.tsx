import { useEffect, useMemo, useRef, useState } from "react";
import type { Contact, CallState, CallStatus } from "@/lib/types";
import { isPriorityNvt, isUrgentNvt } from "@/lib/priority";
import StreetViewImage from "@/components/StreetViewImage";

type Props = {
  contacts: Contact[];
  states: Record<string, CallState>;
  onOpenContact: (bid: string) => void;
  focusBid?: string | null;
  onFocusConsumed?: () => void;
};

const MAGENTA = "#e20074";

const STATUS_COLOR: Record<CallStatus, string> = {
  offen: "#9ca3af",
  angerufen: "#facc15",
  termin: "#3b82f6",
  nichtErreicht: "#fb923c",
  abgelehnt: "#ef4444",
  erledigt: "#22c55e",
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
const LEAFLET_ROTATE_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet-rotate/0.2.8/leaflet-rotate.min.js";

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
    script.onload = () => {
      if (!document.querySelector(`script[src="${LEAFLET_ROTATE_JS}"]`)) {
        const rot = document.createElement("script");
        rot.src = LEAFLET_ROTATE_JS;
        rot.async = true;
        rot.onload = () => resolve(window.L);
        rot.onerror = () => resolve(window.L);
        document.head.appendChild(rot);
      } else {
        resolve(window.L);
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function addressOf(c: Contact): string {
  return `${c.strasse} ${c.hnr}${c.hnr_zusatz}, ${c.plz} ${c.ort}, Germany`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("user-loc-pulse-style")) return;
  const style = document.createElement("style");
  style.id = "user-loc-pulse-style";
  style.textContent = `
    @keyframes userLocPulse {
      0% { transform: scale(1); opacity: 0.7; }
      70% { transform: scale(2.8); opacity: 0; }
      100% { transform: scale(2.8); opacity: 0; }
    }
    @keyframes userLocSpin { to { transform: rotate(360deg); } }
    .user-loc-wrap { position: relative; width: 28px; height: 28px; }
    .user-loc-pulse {
      position: absolute; inset: 4px; border-radius: 50%;
      background: ${MAGENTA}; opacity: 0.5;
      animation: userLocPulse 1.6s ease-out infinite;
    }
    .user-loc-dot {
      position: absolute; inset: 4px; border-radius: 50%;
      background: ${MAGENTA};
      border: 3px solid white;
      box-shadow: 0 0 0 1.5px ${MAGENTA}, 0 2px 8px rgba(0,0,0,0.5);
    }
    .user-loc-arrow-wrap {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s ease-out;
    }
    .user-loc-arrow {
      width: 0; height: 0;
      border-left: 9px solid transparent;
      border-right: 9px solid transparent;
      border-bottom: 16px solid ${MAGENTA};
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
    }
    @keyframes teamPulse {
      0% { transform: scale(1); opacity: 0.7; }
      100% { transform: scale(2.5); opacity: 0; }
    }
    .team-wrap { position: relative; width: 24px; height: 24px; }
    .team-ring {
      position: absolute; inset: 0; border-radius: 50%;
      animation: teamPulse 1.5s ease-out infinite;
    }
    .team-pin {
      position: absolute; inset: 3px; border-radius: 50%;
      border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }
  `;
  document.head.appendChild(style);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildBaseLayer(L: any, kind: "standard" | "satellit" | "hybrid") {
  if (kind === "standard") {
    return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    });
  }
  // Esri World Imagery (satellite)
  return L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "Tiles © Esri" },
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLabelsLayer(L: any) {
  // CARTO labels-only overlay (transparent) — street + place labels
  return L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
    { maxZoom: 19, attribution: "© CARTO", pane: "overlayPane" },
  );
}

export default function KarteTab({ contacts, states, onOpenContact, focusBid, onFocusConsumed }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Record<string, any>>({});
  const [ready, setReady] = useState(false);
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({});
  const [geocoding, setGeocoding] = useState(false);
  const [filter, setFilter] = useState<"alle" | CallStatus>("alle");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  const [headingUp, setHeadingUp] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [hasHeading, setHasHeading] = useState(false);
  type MapLayer = "standard" | "satellit" | "hybrid";
  const [mapLayer, setMapLayer] = useState<MapLayer>(() => {
    if (typeof window === "undefined") return "standard";
    return (localStorage.getItem("karte_layer") as MapLayer) || "standard";
  });
  const [layerMenu, setLayerMenu] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelsLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accuracyCircleRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const firstLocFixRef = useRef(true);
  const followRef = useRef(false);
  const headingUpRef = useRef(false);
  const lastPosRef = useRef<{ lat: number; lng: number; heading: number | null } | null>(null);
  const programmaticPanRef = useRef(false);
  const headingRef = useRef<number | null>(null);
  const orientationListenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  useEffect(() => { followRef.current = follow; }, [follow]);
  useEffect(() => { headingUpRef.current = headingUp; }, [headingUp]);

  // Switch base/labels layer when mapLayer changes
  useEffect(() => {
    if (!ready || !mapRef.current || !window.L) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = window.L as any;
    const map = mapRef.current;
    try {
      if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
      baseLayerRef.current = buildBaseLayer(L, mapLayer).addTo(map);
      baseLayerRef.current.bringToBack?.();
      if (labelsLayerRef.current) {
        map.removeLayer(labelsLayerRef.current);
        labelsLayerRef.current = null;
      }
      if (mapLayer === "hybrid") {
        labelsLayerRef.current = buildLabelsLayer(L).addTo(map);
      }
      try { localStorage.setItem("karte_layer", mapLayer); } catch { /* ignore */ }
    } catch (e) { console.warn("layer switch failed", e); }
  }, [mapLayer, ready]);

  function showLocError(msg: string, ms = 3500) {
    setLocError(msg);
    window.setTimeout(() => setLocError(null), ms);
  }

  function applyBearing(b: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mapRef.current as any;
    if (!m) return;
    if (typeof m.setBearing === "function") {
      m.setBearing(b);
    }
    setBearing(b);
  }

  function renderUserIcon() {
    if (!window.L) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = window.L as any;
    const h = headingRef.current;
    if (h != null && hasHeading) {
      // Arrow rotated by heading; if heading-up active, the map itself rotates
      // so the arrow on screen always points up.
      const rot = headingUpRef.current ? 0 : h;
      const html = `
        <div class="user-loc-wrap">
          <div class="user-loc-pulse"></div>
          <div class="user-loc-arrow-wrap" style="transform: rotate(${rot}deg)">
            <div class="user-loc-arrow"></div>
          </div>
        </div>`;
      return L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
    }
    const html = `<div class="user-loc-wrap"><div class="user-loc-pulse"></div><div class="user-loc-dot"></div></div>`;
    return L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
  }

  function updateUserMarker(lat: number, lng: number, accuracy: number | null) {
    if (!mapRef.current || !window.L) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = window.L as any;
    const map = mapRef.current;
    const icon = renderUserIcon();
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lng]);
      if (icon) userMarkerRef.current.setIcon(icon);
    } else if (icon) {
      userMarkerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 1000, interactive: false }).addTo(map);
    }
    if (accuracy != null && accuracy > 0) {
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setLatLng([lat, lng]);
        accuracyCircleRef.current.setRadius(accuracy);
      } else {
        accuracyCircleRef.current = L.circle([lat, lng], {
          radius: accuracy,
          color: MAGENTA, weight: 1, opacity: 0.5,
          fillColor: MAGENTA, fillOpacity: 0.12,
          interactive: false,
        }).addTo(map);
      }
    }
  }

  const stopWatching = () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  function startWatching() {
    if (!navigator.geolocation) {
      showLocError("Geolocation nicht unterstützt");
      return;
    }
    if (watchIdRef.current != null) return;
    const onPos = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const gpsHeading = pos.coords.heading;
      if (gpsHeading != null && !Number.isNaN(gpsHeading)) {
        headingRef.current = gpsHeading;
        setHasHeading(true);
      }
      lastPosRef.current = { lat: latitude, lng: longitude, heading: gpsHeading ?? null };
      updateUserMarker(latitude, longitude, accuracy ?? null);
      if (firstLocFixRef.current) {
        programmaticPanRef.current = true;
        mapRef.current?.setView([latitude, longitude], 18);
        firstLocFixRef.current = false;
        setLocating(false);
      } else if (followRef.current) {
        programmaticPanRef.current = true;
        mapRef.current?.panTo([latitude, longitude], { animate: true });
      }
    };
    const onErr = (err: GeolocationPositionError) => {
      setLocating(false);
      const msg = err.code === err.PERMISSION_DENIED
        ? "Standort verweigert"
        : err.code === err.POSITION_UNAVAILABLE
        ? "Standort nicht verfügbar"
        : "Standort-Fehler";
      showLocError(msg);
    };
    navigator.geolocation.getCurrentPosition(onPos, onErr, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
    });
    watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true, maximumAge: 1000, timeout: 5000,
    });
  }

  const handleLocate = () => {
    injectStyles();
    if (!mapRef.current || !window.L) return;
    setLocError(null);
    setLocating(true);
    firstLocFixRef.current = true;
    startWatching();
    if (lastPosRef.current) {
      programmaticPanRef.current = true;
      mapRef.current.setView([lastPosRef.current.lat, lastPosRef.current.lng], 18);
      setLocating(false);
    }
  };

  const toggleFollow = () => {
    injectStyles();
    setFollow((v) => {
      const next = !v;
      if (next) {
        startWatching();
        if (lastPosRef.current) {
          programmaticPanRef.current = true;
          mapRef.current?.panTo([lastPosRef.current.lat, lastPosRef.current.lng], { animate: true });
        }
      }
      return next;
    });
  };

  function attachOrientation() {
    if (orientationListenerRef.current) return;
    const handler = (e: DeviceOrientationEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ev = e as any;
      let h: number | null = null;
      if (typeof ev.webkitCompassHeading === "number") {
        h = ev.webkitCompassHeading; // already 0=N, clockwise
      } else if (typeof e.alpha === "number") {
        h = 360 - e.alpha;
      }
      if (h == null || Number.isNaN(h)) return;
      headingRef.current = h;
      setHasHeading(true);
      if (headingUpRef.current) {
        applyBearing(-h);
      }
      // refresh marker icon to reflect heading
      if (userMarkerRef.current) {
        const icon = renderUserIcon();
        if (icon) userMarkerRef.current.setIcon(icon);
      }
    };
    orientationListenerRef.current = handler;
    window.addEventListener("deviceorientationabsolute", handler as EventListener);
    window.addEventListener("deviceorientation", handler as EventListener);
  }

  function detachOrientation() {
    if (!orientationListenerRef.current) return;
    window.removeEventListener("deviceorientationabsolute", orientationListenerRef.current as EventListener);
    window.removeEventListener("deviceorientation", orientationListenerRef.current as EventListener);
    orientationListenerRef.current = null;
  }

  const toggleHeadingUp = async () => {
    injectStyles();
    if (headingUp) {
      setHeadingUp(false);
      detachOrientation();
      applyBearing(0);
      return;
    }
    // iOS 13+ permission
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          showLocError("Kompass-Zugriff in Safari-Einstellungen aktivieren", 5000);
          return;
        }
      } catch {
        showLocError("Kompass-Zugriff in Safari-Einstellungen aktivieren", 5000);
        return;
      }
    }
    setHeadingUp(true);
    attachOrientation();
    startWatching();
  };

  const resetNorth = () => applyBearing(0);

  useEffect(() => {
    return () => {
      stopWatching();
      detachOrientation();
    };
  }, []);

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
      const map = Lmod.map(mapEl.current, {
        rotate: true,
        touchRotate: true,
        rotateControl: { closeOnZeroBearing: true, position: "bottomright" },
        bearing: 0,
        touchZoom: true,
        scrollWheelZoom: true,
      }).setView([view.lat, view.lng], view.zoom);
      baseLayerRef.current = buildBaseLayer(Lmod, mapLayer).addTo(map);
      if (mapLayer === "hybrid") {
        labelsLayerRef.current = buildLabelsLayer(Lmod).addTo(map);
      }
      map.on("moveend zoomend", () => {
        const c = map.getCenter();
        try {
          sessionStorage.setItem("karte_view", JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
        } catch { /* ignore */ }
      });
      // Disable follow when user manually pans
      map.on("dragstart", () => {
        if (programmaticPanRef.current) return;
        if (followRef.current) setFollow(false);
      });
      map.on("movestart", () => {
        // reset programmatic flag after the move begins
        if (programmaticPanRef.current) {
          programmaticPanRef.current = false;
        }
      });
      // Keep bearing state in sync when user rotates with two fingers
      map.on("rotate", () => {
        if (typeof map.getBearing === "function") setBearing(map.getBearing());
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
    () => contacts.filter((c) => {
      if (filter !== "alle" && (states[c.bid]?.status ?? "offen") !== filter) return false;
      if (priorityOnly && !isPriorityNvt(c.nvt)) return false;
      return true;
    }),
    [contacts, states, filter, priorityOnly],
  );

  // Render markers
  useEffect(() => {
    if (!ready || !mapRef.current || !window.L) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = window.L as any;
    const map = mapRef.current;
    const visibleIds = new Set(visibleContacts.map((c) => c.bid));

    Object.keys(markersRef.current).forEach((bid) => {
      if (!visibleIds.has(bid) || !coords[bid]) {
        map.removeLayer(markersRef.current[bid]);
        delete markersRef.current[bid];
      }
    });

    injectStyles();
    visibleContacts.forEach((c) => {
      const co = coords[c.bid];
      if (!co) return;
      const cs = states[c.bid];
      const status = (cs?.status ?? "offen") as CallStatus;
      const team = cs?.team ?? "";
      const teamStatus = cs?.team_status ?? "";
      const urgent = isUrgentNvt(c.nvt);
      const prio = isPriorityNvt(c.nvt);

      const teamColor = team === "team1" ? "#3b82f6" : team === "team2" ? "#7c3aed" : "";
      const isInArbeit = team && teamStatus === "in_arbeit";
      const isFertig = team && teamStatus === "fertig";

      let html: string;
      let sz: number;
      if (isInArbeit) {
        sz = 24;
        html = `<div class="team-wrap"><div class="team-ring" style="background:${teamColor}"></div><div class="team-pin" style="background:${teamColor}"></div></div>`;
      } else if (isFertig) {
        sz = 22;
        html = `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`;
      } else {
        const color = team ? teamColor : STATUS_COLOR[status];
        sz = urgent ? 24 : prio ? 22 : 18;
        const ring = urgent
          ? `box-shadow:0 0 0 3px #dc2626, 0 1px 4px rgba(0,0,0,0.4)`
          : prio
          ? `box-shadow:0 0 0 2px #f97316, 0 1px 4px rgba(0,0,0,0.4)`
          : `box-shadow:0 1px 4px rgba(0,0,0,0.4)`;
        html = `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};border:2px solid white;${ring}"></div>`;
      }
      const icon = L.divIcon({ html, className: "", iconSize: [sz, sz], iconAnchor: [sz/2, sz/2] });
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

  // External focus: fly to a contact and select it
  useEffect(() => {
    if (!focusBid || !ready || !mapRef.current) return;
    const co = coords[focusBid];
    if (!co) return; // wait for coords to load
    programmaticPanRef.current = true;
    mapRef.current.setView([co.lat, co.lng], 18, { animate: true });
    setSelected(focusBid);
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBid, ready, coords]);

  const selectedContact = selected ? contacts.find((c) => c.bid === selected) : null;
  const selectedStatus = (selectedContact && (states[selectedContact.bid]?.status ?? "offen")) as CallStatus | undefined;
  const selectedState = selectedContact ? states[selectedContact.bid] : undefined;

  const btnBase: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 10, border: "none",
    boxShadow: "0 1px 4px rgba(0,0,0,0.2)", cursor: "pointer",
    fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
  };

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
        <button
          onClick={() => setPriorityOnly((v) => !v)}
          style={{
            padding: "5px 10px", borderRadius: 999,
            border: `1.5px solid ${priorityOnly ? "#ef4444" : "#e5e7eb"}`,
            background: priorityOnly ? "#ef4444" : "white",
            color: priorityOnly ? "white" : "#475569",
            fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >🔥 Nur Priorität</button>
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

      {/* Action buttons (stacked top-right) */}
      <div style={{ position: "absolute", top: 56, right: 8, zIndex: 1001, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={handleLocate}
          aria-label="Mein Standort"
          title="Mein Standort"
          style={{ ...btnBase, background: "white" }}
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
        </button>
        <button
          onClick={toggleFollow}
          aria-label="Folgen"
          title={follow ? "Auto-Folgen deaktivieren" : "Auto-Folgen aktivieren"}
          style={{
            ...btnBase,
            background: follow ? MAGENTA : "white",
            color: follow ? "white" : "inherit",
          }}
        >🔄</button>
        <button
          onClick={toggleHeadingUp}
          aria-label="Heading-Up"
          title={headingUp ? "Heading-Up deaktivieren" : "Heading-Up aktivieren"}
          style={{
            ...btnBase,
            background: headingUp ? MAGENTA : "white",
            color: headingUp ? "white" : "inherit",
          }}
        >🧭</button>
        {Math.abs(bearing) > 0.5 && (
          <button
            onClick={resetNorth}
            aria-label="Nach Norden"
            title="Nach Norden ausrichten"
            style={{ ...btnBase, background: "white" }}
          >🔝</button>
        )}
      </div>

      {/* Compass rose top-right of map (always shows true north) */}
      <div
        style={{
          position: "absolute", top: 56, right: 56, zIndex: 1000,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.9)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          display: Math.abs(bearing) > 0.5 ? "flex" : "none",
          alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            transform: `rotate(${bearing}deg)`,
            transition: "transform 0.2s ease-out",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28">
            <polygon points="14,3 18,15 14,12 10,15" fill="#dc2626" />
            <polygon points="14,25 10,13 14,16 18,13" fill="#475569" />
            <text x="14" y="2.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="#dc2626">N</text>
          </svg>
        </div>
      </div>

      {locError && (
        <div
          style={{
            position: "absolute", top: 8, left: 8, right: 8, zIndex: 1100,
            background: "#fee2e2", color: "#991b1b", padding: "8px 12px",
            borderRadius: 8, fontSize: 12, fontWeight: 600,
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)", textAlign: "center",
          }}
        >
          ⚠️ {locError}
        </div>
      )}

      {/* Legend top-right */}
      <div
        style={{
          position: "absolute",
          top: Math.abs(bearing) > 0.5 ? 248 : 200,
          right: 8, zIndex: 1000,
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

          <div style={{ marginTop: 10 }}>
            <StreetViewImage
              strasse={selectedContact.strasse}
              hnr={selectedContact.hnr}
              hnr_zusatz={selectedContact.hnr_zusatz}
              plz={selectedContact.plz}
              ort={selectedContact.ort}
              height={160}
            />
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
