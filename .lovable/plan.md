## Ziel

In jedem Datensatz sichtbar machen: „Dieser Kontakt hat noch N weitere Objekte" — z. B. **Schäffer WohnART GmbH** → Thomas-Müntzer-Str. 5 + Hauptstr. 19, oder **Patrick Taube** → TMS 17 + Hauptstr. 40. Rein clientseitig, keine DB-Änderung.

## Erkennung — wann gelten zwei Objekte als verknüpft?

Zwei `contacts` gelten als verknüpft, wenn **mindestens eines** dieser Merkmale übereinstimmt (nach Normalisierung):

1. **Name** — lowercase, getrimmt, Mehrfach-Spaces entfernt, Anrede-Präfixe („Herr", „Frau") weg. Nur wenn Name ≥ 3 Zeichen und nicht leer.
2. **Mobil** — normalisiert zu reinen Ziffern; führendes `+49` / `0049` → `0`. Nur bei ≥ 6 Ziffern.
3. **Festnetz** — gleiche Normalisierung wie Mobil.
4. **E-Mail** — lowercase, getrimmt. (Wird nur ausgewertet falls vorhanden — neue Kontakte legen wir bewusst ohne E-Mail an, aber Altbestand enthält sie.)

Ein Merkmal reicht — z. B. reicht die identische Firmenrufnummer, um Filiale + Privat zu verknüpfen. Der Match-Grund wird pro Verknüpfung mitgespeichert und angezeigt, damit du bei häufigen Namen einschätzen kannst, ob es wirklich dieselbe Person ist.

Selbst-Referenz (gleiche `bid`) wird gefiltert. Reine Duplikate desselben Objekts (z. B. `2225880` + `KLS-15552382` beide Nicolle Müller, Hauptstr. 59) tauchen ebenfalls als Verknüpfung auf — praktisch, um Doubletten zu erkennen.

## Umsetzung

**Neue Datei** `src/lib/relatedContacts.ts`:
- `normalizePhone(s): string` — nur Ziffern, `+49`/`0049` → `0`.
- `normalizeName(s): string` — lowercase, trim, Anreden weg.
- `buildRelationIndex(contacts): Record<bid, Array<{ bid, reasons: ('name'|'mobil'|'festnetz'|'email')[] }>>` — baut invertierte Maps (nameKey → bids, phoneKey → bids, emailKey → bids), verrechnet sie zu Verknüpfungen pro BID.

**In `src/routes/index.tsx`:**
- `const relations = useMemo(() => buildRelationIndex(contacts), [contacts])`.
- An `KarteTab` und die Kontakt-Kartenliste durchreichen.

**Anzeige in der Kontakt-Liste** (aufgeklappte Karte, `index.tsx` ~L1643 ff.):
Neue Sektion **„🔗 Verknüpfte Objekte (N)"** — pro Verknüpfung eine Zeile mit Adresse, Status-Punkt und Grund-Chips („Name" · „Mobil"). Klick springt zum verknüpften Kontakt (nutzt bestehende `openContactInList`).

**Anzeige im Karten-Bottom-Sheet** (`KarteTab.tsx`): Gleiche Sektion, Klick zentriert die Karte auf den verknüpften Pin.

**Kleines Badge in der eingeklappten Listenzeile**: `🔗 2` neben BID/Status, damit man Verknüpfungen sieht, ohne die Karte aufzuklappen. Nur wenn N ≥ 1.

## Kosten / Grenzen

- O(n) Aufbau, ~600 Kontakte → wenige ms, wird gecached via `useMemo`.
- Falsch-Positive bei sehr generischen Namen möglich (z. B. mehrere „B Schaller") — deshalb wird der **Grund** angezeigt und mehrere Merkmale zählen additiv, aber schon eines reicht für den Hinweis.
- Keine Fuzzy-Suche (Tippfehler wie „Müller" vs. „Mueller" werden nicht gematcht). Kann später ergänzt werden, wenn nötig.

## Nicht Teil dieses Schritts

- Kein Merge-/Zusammenführ-Feature (wir zeigen nur an, ändern nichts).
- Keine DB-Spalte, keine Migration, keine Server-Function.
