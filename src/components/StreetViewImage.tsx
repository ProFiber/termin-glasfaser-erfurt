import { useState, type CSSProperties } from "react";

const API_KEY = "AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY";

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
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const address = `${strasse} ${hnr}${hnr_zusatz ?? ""}, ${plz} ${ort}, Germany`;
  const imgUrl =
    `https://maps.googleapis.com/maps/api/streetview` +
    `?size=400x${height}` +
    `&location=${encodeURIComponent(address)}` +
    `&fov=90&heading=235&pitch=10` +
    `&return_error_code=true` +
    `&key=${API_KEY}`;
  const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(address)}&layer=c`;

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

  if (state === "error") {
    return (
      <div
        style={{
          ...wrap,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94a3b8",
          fontSize: 13,
          fontWeight: 600,
          cursor: "default",
        }}
      >
        📸 Kein Streetview verfügbar
      </div>
    );
  }

  return (
    <div
      style={wrap}
      onClick={() => window.open(mapsUrl, "_blank", "noopener,noreferrer")}
    >
      {state === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#64748b",
            fontSize: 13,
            fontWeight: 600,
            gap: 6,
          }}
        >
          📸 Lade Objektbild…
        </div>
      )}
      <img
        src={imgUrl}
        loading="lazy"
        alt={`Streetview ${address}`}
        onLoad={() => setState("ok")}
        onError={() => setState("error")}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: state === "ok" ? 1 : 0,
          transition: "opacity 200ms",
        }}
      />
    </div>
  );
}
