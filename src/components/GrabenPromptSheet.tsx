import { useEffect, useState } from "react";

type Props = {
  title: string;
  subtitle?: string;
  initial?: number;
  onSave: (value: number) => void;
  onSkip: () => void;
};

export default function GrabenPromptSheet({ title, subtitle, initial = 0, onSave, onSkip }: Props) {
  const [value, setValue] = useState<number>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(initial));

  useEffect(() => {
    setValue(initial);
    setDraft(String(initial));
  }, [initial]);

  const set = (v: number) => setValue(Math.max(0, Math.round(v)));

  return (
    <>
      <div
        onClick={onSkip}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 499,
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 56,
          left: 0,
          right: 0,
          background: "#fff",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 18,
          zIndex: 500,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: "#16a34a", marginBottom: 4 }}>
          ✅ Erledigt!
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#9a3412", marginTop: 8 }}>
          ⛏️ Grabenlänge eingeben
        </div>
        <div style={{ fontSize: 13, color: "#475569", marginBottom: 14 }}>
          {title}
          {subtitle ? <> — {subtitle}</> : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            marginBottom: 16,
          }}
        >
          <button type="button" onClick={() => set(value - 1)} style={stepBtn} aria-label="minus">
            −
          </button>
          {editing ? (
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                setEditing(false);
                const n = parseInt(draft, 10);
                set(Number.isFinite(n) ? n : 0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              style={{
                width: 90,
                textAlign: "center",
                fontSize: 28,
                fontWeight: 800,
                border: "1px solid #fb923c",
                borderRadius: 10,
                padding: "8px 6px",
                color: "#9a3412",
                background: "white",
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(String(value));
                setEditing(true);
              }}
              style={{
                minWidth: 110,
                textAlign: "center",
                fontSize: 28,
                fontWeight: 800,
                color: "#9a3412",
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                borderRadius: 10,
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              {value} m
            </button>
          )}
          <button type="button" onClick={() => set(value + 1)} style={stepBtn} aria-label="plus">
            +
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => onSave(value)}
            style={{
              flex: 1,
              padding: "12px",
              background: "#22c55e",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            💾 Speichern
          </button>
          <button
            type="button"
            onClick={onSkip}
            style={{
              flex: 1,
              padding: "12px",
              background: "#f1f5f9",
              color: "#475569",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Überspringen
          </button>
        </div>
      </div>
    </>
  );
}

const stepBtn: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 12,
  border: "1px solid #fb923c",
  background: "white",
  color: "#9a3412",
  fontSize: 24,
  fontWeight: 800,
  cursor: "pointer",
  lineHeight: 1,
};
