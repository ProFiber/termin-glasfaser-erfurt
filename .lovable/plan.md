
## Ziel
Sichtbar machen, welche erledigten Hausanschlüsse noch **nicht bezahlt** werden können — weil Doku fehlt, Zustimmung fehlt, Auftrag fehlt, Auskundung nicht gemacht wurde, oder der AG etwas nachfordert. Alle diese Fälle sind **Klärfälle** und werden zentral im Doku-Tab gebündelt sowie im Dashboard als Status-Streifen angezeigt.

## Klärfall-Kategorien (5 Blocker)

Jeder erledigte HA wird gegen diese 5 Regeln geprüft. Trifft mindestens eine zu → automatisch Klärfall.

| # | Kategorie | Regel | Ist heute |
|---|---|---|---|
| 1 | 📸 Foto fehlt | `status=erledigt` & `doku_states.foto=false` | vorhanden |
| 2 | 📄 Protokoll fehlt | `status=erledigt` & `doku_states.protokoll=false` | vorhanden |
| 3 | ✍️ Zustimmung fehlt | `status=erledigt` & `contacts.zustimmung` leer/„nein" | vorhanden |
| 4 | 🏷️ Ohne Auftrag gebaut | Bau vorhanden, kein Match in `contacts` (aus `import_log.status='no_match'`) | vorhanden |
| 5 | 🚫 Ohne Auskundung gebaut | `status=erledigt` & `contacts.auskundung_erforderlich=true` & `auskundung_erfolgt=false` — **aktuell 43 Fälle** | vorhanden |

Zusätzlich manuelle Klärfälle (heute schon möglich via `call_states.klarfall = true` + `klarfall_notiz`) bleiben erhalten — z.B. „Eigentümer überlegt noch", „Mehraufwand".

## Schema-Erweiterung (minimal)

`call_states` bekommt 2 neue Felder für den AG-Prüfstatus:

- `pruefung_status` text — Werte: `offen` · `eingereicht` · `nachforderung` · `freigegeben`
  - `offen` = default, noch nicht beim AG
  - `eingereicht` = wird gesetzt sobald HA im Wochenexport (Bauleiter-PDF) enthalten war (automatisch)
  - `nachforderung` = AG hat zurückgewiesen, Nachreichung nötig — mit Checkboxen welche Blocker (Foto/Protokoll/Aufmaß/Sonstiges)
  - `freigegeben` = `avis_am` gesetzt (automatisch abgeleitet)
- `pruefung_nachforderung` text[] — Checkbox-Liste: `foto`, `protokoll`, `aufmass`, `sonstiges`
- `pruefung_notiz` text — freier Text zur Nachforderung

Der bestehende `klarfall` bleibt für manuelle Klärfälle. Die 5 System-Kategorien werden **live berechnet** aus vorhandenen Feldern, nicht als Spalte gespeichert — so bleiben sie immer aktuell.

## Doku-Tab — neue Struktur

```text
┌─ KLÄRFÄLLE (Prio 1) ────────────────────────────┐
│  [🚫 Ohne Auskundung: 43]  [🏷️ Ohne Auftrag: X] │
│  [📸 Foto fehlt: X]  [📄 Protokoll: X]          │
│  [✍️ Zustimmung: X]  [⚠️ Nachforderung AG: X]   │
│  [🔧 Manuelle Klärfälle: X]                     │
└─────────────────────────────────────────────────┘

┌─ Filter aktiv: „Ohne Auskundung" ──────────────┐
│  Adresse · NVT · Bau-Datum · Status · Aktion   │
│  Hauptstr. 31 · 2V8012 · 25.06. · Auskundung   │
│    geplant · [Eigentümer erinnern] [Notiz]     │
│  ...                                            │
└─────────────────────────────────────────────────┘

┌─ Vollständige Doku-Liste (Rest) ────────────────┐
```

Jede Kachel ist klickbar → filtert die Liste darunter. Zeilen zeigen Badge welche Kategorie greift. Manuelle Klärfall-Notiz + neuer Nachforderungs-Bereich sind editierbar.

## Dashboard (Startseite) — Zahlungspipeline

Neue Kachelreihe zwischen KPIs und bestehender Übersicht:

```text
Erledigt → Eingereicht → In Prüfung → Nachforderung → Freigegeben → Vergütet
  535         X            X            X (rot!)         X            X
                                        ↑ klickbar → Doku-Tab
```

Plus: **„⚠️ 43 Klärfälle offen"** rote Warnung, klickt auf Doku-Tab mit Filter.

## Workflow

1. **Wochenexport (Bauleiter-PDF):** automatisch alle enthaltenen HA auf `pruefung_status='eingereicht'` + `eingereicht_am=heute`
2. **AG meldet Nachforderung:** manuell im Doku-Tab → Button „Nachforderung AG" → Checkboxen + Notiz → `pruefung_status='nachforderung'`
3. **AVIS eingetragen:** automatisch `pruefung_status='freigegeben'`
4. **5 System-Klärfälle:** immer live sichtbar, keine manuelle Markierung nötig
5. **Manuelle Klärfälle (bestehend):** wie bisher via `klarfall`-Flag

## Zur Frage „werden die 43 als Klärfall markiert?"

**Ja — automatisch, aber nicht durch Setzen von `klarfall=true`.** Grund: die 5 Kategorien werden live berechnet und im gleichen Klärfall-Bereich angezeigt wie die manuellen. Vorteil: sobald z.B. die Auskundung nachgeholt wird (`auskundung_erfolgt=true`), verschwindet der Fall automatisch aus der Liste — kein manuelles Abhaken nötig. Das `klarfall`-Flag bleibt reserviert für Fälle, die keine der 5 Regeln erfüllen aber trotzdem geklärt werden müssen (Eigentümer überlegt, Mehraufwand, etc.).

Im UI sieht der Nutzer **eine gemeinsame Klärfall-Sammlung** aus beiden Quellen (System + manuell), gefiltert nach Kategorie.

## Technische Umsetzung

- **Migration:** 3 neue Spalten in `call_states` (`pruefung_status`, `pruefung_nachforderung`, `pruefung_notiz`) + `eingereicht_am` date
- **`src/lib/types.ts`:** `CallState` erweitern
- **`src/components/DokuTab.tsx`:** Kachel-Übersicht oben, Filter-Logik für die 5+2 Kategorien, Nachforderungs-Editor pro Zeile
- **`src/routes/index.tsx`:** Zahlungspipeline-Streifen + Warnung „43 Klärfälle"
- **`src/components/FinanzTab.tsx`:** Beim Bauleiter-PDF-Export → RPC `mark_eingereicht(bids[])` aufrufen
- **Bauleiter-Bericht:** Klärfall-Sektion erweitern um die 5 System-Kategorien (aktuell zeigt er nur `klarfall=true`)

## Was NICHT gemacht wird

- Keine automatische E-Mail an Eigentümer (Button „Eigentümer erinnern" öffnet nur vorbefüllte WhatsApp/Mail)
- Kein Sammel-„Einreichungs-Paket" als eigene Entität (auf HA-Ebene reicht laut deiner Antwort 4)
- Keine Änderung an bestehenden Klarfall-Notizen
