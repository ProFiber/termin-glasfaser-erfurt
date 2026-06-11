import { useEffect, useState, type CSSProperties } from "react";

type Props = {
  strasse: string;
  hnr: string;
  hnr_zusatz?: string;
  plz: string;
  ort: string;
  height?: number;
  style?: CSSProperties;
};

// Sehr einfacher In-Memory + localStorage Cache, damit wir Nominatim nicht
// für jede Karte erneut befragen.
const COORD_CACHE_KEY = "sv_coord_cache_v1";
type Coord = { lat: number; lng: number };
const memCache: Record<string, Coord | null> = (() => {
  try {
    return JSON.parse(localStorage.getItem(COORD_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
})();

function saveCache() {
  try {
    localStorage.setItem(COORD_CACHE_KEY, JSON.stringify(memCache));
  } catch {
    /* ignore */
  }
}

async function geocode(address: string): Promise<Coord | null> {
  if (address in memCache) return memCache[address];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "de" },
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const c: Coord = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      memCache[address] = c;
      saveCache();
      return c;
    }
    memCache[address] = null;
    saveCache();
    return null;
  } catch {
    return null;
  }
}

export default function StreetViewImage({
  strasse,
  hnr,
  hnr_zusatz,
  plz,
  ort,
  height = 260,
  style,
}: Props) {
  const address = `${strasse} ${hnr}${hnr_zusatz ?? ""}, ${plz} ${ort}, Germany`;
  const encoded = encodeURIComponent(address);
  const [coord, setCoord] = useState<Coord | null>(
    address in memCache ? memCache[address] : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!(address in memCache)) {
      geocode(address).then((c) => {
        if (!cancelled) setCoord(c);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Street View embed: braucht cbll=lat,lng, sonst zeigt es nur die Karte.
  const svEmbed = coord
    ? `https://maps.google.com/maps?q=&layer=c&cbll=${coord.lat},${coord.lng}&cbp=11,0,0,0,0&output=svembed`
    : `https://maps.google.com/maps?q=${encoded}&layer=c&output=svembed`;
  const satEmbed = coord
    ? `https://maps.google.com/maps?q=${coord.lat},${coord.lng}&t=k&z=20&output=embed`
    : `https://maps.google.com/maps?q=${encoded}&t=k&z=20&output=embed`;

  const svLink = coord
    ? `https://www.google.com/maps?q=&layer=c&cbll=${coord.lat},${coord.lng}`
    : `https://www.google.com/maps?q=${encoded}&layer=c`;
  const satLink = coord
    ? `https://www.google.com/maps/@${coord.lat},${coord.lng},20z/data=!3m1!1e3`
    : `https://www.google.com/maps/place/${encoded}/@/data=!3m1!1e3`;

  const wrap: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 12,
    ...style,
  };

  const tile: CSSProperties = {
    position: "relative",
    width: "100%",
    height,
    borderRadius: 10,
    overflow: "hidden",
    background: "#f1f5f9",
    display: "block",
  };

  const iframe: CSSProperties = {
    width: "100%",
    height: "100%",
    border: 0,
    display: "block",
  };

  const badge: CSSProperties = {
    position: "absolute",
    left: 8,
    bottom: 8,
    borderRadius: 999,
    padding: "4px 10px",
    background: "rgba(15, 23, 42, 0.82)",
    color: "white",
    fontSize: 12,
    fontWeight: 700,
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.18)",
    pointerEvents: "none",
    zIndex: 2,
  };

  const openLink: CSSProperties = {
    position: "absolute",
    top: 8,
    right: 8,
    borderRadius: 6,
    padding: "5px 10px",
    background: "rgba(255, 255, 255, 0.94)",
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 700,
    textDecoration: "none",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.18)",
    zIndex: 2,
  };

  return (
    <div style={wrap}>
      <div style={tile}>
        <iframe
          key={svEmbed}
          src={svEmbed}
          style={iframe}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`Street View ${address}`}
        />
        <div style={badge}>📸 Street View</div>
        <a href={svLink} target="_blank" rel="noopener noreferrer" style={openLink}>
          Öffnen ↗
        </a>
      </div>
      <div style={tile}>
        <iframe
          key={satEmbed}
          src={satEmbed}
          style={iframe}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`Satellit ${address}`}
        />
        <div style={badge}>🛰️ Satellit</div>
        <a href={satLink} target="_blank" rel="noopener noreferrer" style={openLink}>
          Öffnen ↗
        </a>
      </div>
    </div>
  );
}
