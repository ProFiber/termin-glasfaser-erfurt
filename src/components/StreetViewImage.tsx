import { type CSSProperties, useState } from "react";

type Props = {
  strasse: string;
  hnr: string;
  hnr_zusatz?: string;
  plz: string;
  ort: string;
  height?: number;
  style?: CSSProperties;
};

export default function StreetViewImage({
  strasse,
  hnr,
  hnr_zusatz,
  plz,
  ort,
  height = 180,
  style,
}: Props) {
  const address = `${strasse} ${hnr}${hnr_zusatz ?? ""}, ${plz} ${ort}, Germany`;
  const encoded = encodeURIComponent(address);
  const mapsUrl = `https://www.google.com/maps?q=${encoded}&layer=c`;
  const satUrl = `https://www.google.com/maps/place/${encoded}/@/data=!3m1!1e3`;

  const svSrc = `/api/maps-image?type=streetview&size=640x${Math.round(height * 2)}&address=${encoded}`;
  const satSrc = `/api/maps-image?type=satellite&size=640x${Math.round(height * 2)}&zoom=20&address=${encoded}`;

  const [svErr, setSvErr] = useState(false);
  const [satErr, setSatErr] = useState(false);

  const wrap: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 12,
    ...style,
  };

  const tile: CSSProperties = {
    position: "relative",
    height,
    borderRadius: 8,
    overflow: "hidden",
    background: "#f1f5f9",
    cursor: "pointer",
    display: "block",
  };

  const img: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };

  const badge: CSSProperties = {
    position: "absolute",
    left: 8,
    bottom: 8,
    borderRadius: 999,
    padding: "4px 8px",
    background: "rgba(15, 23, 42, 0.82)",
    color: "white",
    fontSize: 11,
    fontWeight: 700,
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.18)",
  };

  const fallback: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600,
    padding: 8,
    textAlign: "center",
  };

  return (
    <div style={wrap}>
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={tile}>
        {svErr ? (
          <div style={fallback}>Kein Street View verfügbar</div>
        ) : (
          <img
            src={svSrc}
            alt={`Street View ${address}`}
            loading="lazy"
            style={img}
            onError={() => setSvErr(true)}
          />
        )}
        <div style={badge}>📸 Street View</div>
      </a>
      <a href={satUrl} target="_blank" rel="noopener noreferrer" style={tile}>
        {satErr ? (
          <div style={fallback}>Kein Satellit verfügbar</div>
        ) : (
          <img
            src={satSrc}
            alt={`Satellit ${address}`}
            loading="lazy"
            style={img}
            onError={() => setSatErr(true)}
          />
        )}
        <div style={badge}>🛰️ Satellit</div>
      </a>
    </div>
  );
}
