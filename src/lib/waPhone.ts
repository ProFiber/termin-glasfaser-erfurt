/**
 * Normalisiert eine Telefonnummer für wa.me-Links (E.164 ohne "+", Default DE).
 * Gibt "" zurück, wenn keine plausible Nummer erkennbar ist.
 */
export function waPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  // Nur erste Nummer verwenden, falls mehrere im Feld stehen
  const first = String(raw).split(/[,;/]| oder /i)[0] ?? "";
  let d = first.replace(/[^\d+]/g, "");
  if (!d) return "";

  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "49" + d.slice(1);
  else if (!d.startsWith("49")) d = "49" + d; // z.B. "170..." ohne führende 0

  // Doppeltes Länderkennzeichen wie 49049... / 4949... korrigieren
  d = d.replace(/^49(?:0+|49)+/, "49");

  // Plausibilität: DE-Nummern sind inkl. 49 ca. 11-14 Stellen
  if (d.length < 10 || d.length > 15) return "";
  return d;
}

export function waLink(phone: string | null | undefined, text: string): string {
  const p = waPhone(phone);
  const q = `text=${encodeURIComponent(text)}`;
  return p ? `https://wa.me/${p}?${q}` : `https://wa.me/?${q}`;
}
