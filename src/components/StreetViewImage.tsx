import { type CSSProperties } from "react";

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

  // Keyless Google Maps embed URLs – funktionieren ohne API-Key auf jeder Domain
  const svEmbed = `https://maps.google.com/maps?q=${encoded}&layer=c&output=svembed`;
  const satEmbed = `https://maps.google.com/maps?q=${encoded}&t=k&z=20&output=embed`;

  // Klickziele (öffnen Google Maps in neuem Tab)
  const svLink = `https://www.google.com/maps?q=${encoded}&layer=c`;
  const satLink = `https://www.google.com/maps/place/${encoded}/@/data=!3m1!1e3`;

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
    padding: "4px 8px",
    background: "rgba(15, 23, 42, 0.82)",
    color: "white",
    fontSize: 11,
    fontWeight: 700,
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.18)",
    pointerEvents: "none",
    zIndex: 2,
  };

  const openLink: CSSProperties = {
    position: "absolute",
    top: 6,
    right: 6,
    borderRadius: 6,
    padding: "4px 8px",
    background: "rgba(255, 255, 255, 0.92)",
    color: "#0f172a",
    fontSize: 11,
    fontWeight: 700,
    textDecoration: "none",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.18)",
    zIndex: 2,
  };

  return (
    <div style={wrap}>
      <div style={tile}>
        <iframe
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
