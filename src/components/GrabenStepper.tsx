import { useState } from "react";

type Props = {
  value: number;
  onChange: (v: number) => void;
};

export default function GrabenStepper({ value, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const set = (v: number) => onChange(Math.max(0, Math.round(v)));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        background: "#fff7ed",
        border: "1px solid #fed7aa",
        borderRadius: 8,
        marginTop: 8,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: "#9a3412", flex: 1 }}>
        ⛏️ Grabenlänge
      </span>
      <button
        onClick={() => set(value - 1)}
        style={btn}
        type="button"
        aria-label="minus"
      >
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
            width: 56,
            textAlign: "center",
            fontSize: 16,
            fontWeight: 800,
            border: "1px solid #fb923c",
            borderRadius: 6,
            padding: "4px 6px",
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
            minWidth: 56,
            textAlign: "center",
            fontSize: 16,
            fontWeight: 800,
            color: "#9a3412",
            background: "white",
            border: "1px solid #fed7aa",
            borderRadius: 6,
            padding: "4px 6px",
            cursor: "pointer",
          }}
        >
          {value} m
        </button>
      )}
      <button
        onClick={() => set(value + 1)}
        style={btn}
        type="button"
        aria-label="plus"
      >
        +
      </button>
    </div>
  );
}

const btn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid #fb923c",
  background: "white",
  color: "#9a3412",
  fontSize: 18,
  fontWeight: 800,
  cursor: "pointer",
  lineHeight: 1,
};
