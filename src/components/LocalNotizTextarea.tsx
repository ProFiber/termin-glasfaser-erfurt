import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = {
  /** Server value — used to seed/refresh local state when the field becomes editable */
  value: string;
  /** Called once on blur with the final value */
  onSave: (value: string) => void;
  placeholder?: string;
  /**
   * Resync key. When this changes, local state is reset from `value`.
   * Use the contact bid (and optionally an `expanded` flag) so the textarea
   * doesn't get re-seeded on every Supabase re-render.
   */
  resyncKey?: string | number | boolean;
  minHeight?: number;
  borderColor?: string;
  background?: string;
  style?: CSSProperties;
};

export default function LocalNotizTextarea({
  value,
  onSave,
  placeholder,
  resyncKey,
  minHeight = 80,
  borderColor = "#ddd",
  background,
  style,
}: Props) {
  const [local, setLocal] = useState<string>(value ?? "");
  const [focused, setFocused] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);

  // Resync local from server value only when the field is closed/swapped,
  // never on every server-side re-render while the user is typing.
  useEffect(() => {
    setLocal(value ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resyncKey]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if ((local ?? "") !== (value ?? "")) {
            onSave(local);
            setSavedFlash(true);
            if (flashTimer.current) window.clearTimeout(flashTimer.current);
            flashTimer.current = window.setTimeout(() => setSavedFlash(false), 1600);
          }
        }}
        placeholder={placeholder}
        style={{
          width: "100%",
          minHeight,
          padding: 10,
          fontSize: 15,
          lineHeight: 1.35,
          borderRadius: 8,
          border: focused ? `2px solid #e20074` : `1px solid ${borderColor}`,
          // Compensate the +1px border so the box doesn't visibly jump on focus
          margin: focused ? -1 : 0,
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
          boxSizing: "border-box",
          background: background ?? "white",
          ...style,
        }}
      />
      {savedFlash && (
        <div
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            background: "#dcfce7",
            color: "#166534",
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 999,
            pointerEvents: "none",
          }}
        >
          💾 Gespeichert
        </div>
      )}
    </div>
  );
}
