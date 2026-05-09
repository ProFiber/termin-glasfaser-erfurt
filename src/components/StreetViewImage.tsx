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
  const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(address)}&layer=c`;
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=17&output=embed`;

  const wrap: CSSProperties = {
    width: "100%",
    height,
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
    position: "relative",
    background: "#f1f5f9",
    cursor: "pointer",
    ...style,
  };

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={wrap}
    >
      <iframe
        src={embedUrl}
        title={`Karte ${address}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        style={{
          width: "100%",
          height: "100%",
          border: 0,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          borderRadius: 999,
          padding: "6px 10px",
          background: "rgba(15, 23, 42, 0.82)",
          color: "white",
          fontSize: 12,
          fontWeight: 700,
          boxShadow: "0 8px 20px rgba(15, 23, 42, 0.18)",
        }}
      >
        📸 Streetview öffnen
      </div>
    </a>
  );
}
