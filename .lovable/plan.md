# Import-Pipeline & UI-Erweiterung

Nach dem erfolgreichen Dedup (811 → 777 Kontakte) folgt jetzt der Ausbau: Neue Felder aus dem Bot-Export, drei separate Importer, und UI-Anpassungen für Terminierbarkeit / Storniert.

## Was gebaut wird

### 1. Datenbank-Erweiterung (Migration)

Neue Spalten auf `contacts`:

| Spalte | Zweck | Quelle |
|---|---|---|
| `kls_id` | Eindeutige Telekom-KLS-ID (Primärschlüssel-Logik) | Telekom + Bot |
| `fol_id` | Fibre-optic Location ID | Bot |
| `telekom_bid` | Numerische Telekom-BID (Referenz) | Bot |
| `contact2_name`, `contact2_mobil`, `contact2_festnetz`, `contact2_email` | 2. Ansprechpartner | Bot |
| `contact3_name`, `contact3_mobil`, `contact3_festnetz`, `contact3_email` | 3. Ansprechpartner | Bot |
| `telekom_kommentar` | Freitext aus Telekom-Portal (read-only) | Bot |
| `wartegrund`, `wartegrund_kommentar` | Warum wartet das Objekt? (read-only) | Bot |
| `wiedervorlage` | Datum Wiedervorlage | Bot |
| `hausstich_status`, `hausstich_datum` | Trench-Status | Bot |
| `eig_strasse`, `eig_hnr`, `eig_plz`, `eig_ort` | Eigentümer-Anschrift (falls ≠ Objekt) | Bot |
| `storniert` (bool) | Nur importieren, keine UI-Filterung | Bot |
| `naechster_schritt` | Kurzstatus aus Portal | Bot |

Neue RPCs:
- `bulk_import_telekom_v2` — KLS-first Matching, Fallback Adresse+NVT
- `bulk_import_bot_contacts` — matcht per KLS, ergänzt Kontakt2/3, fol_id, Kommentare
- `bulk_import_profiber_db` — matcht per KLS, aktualisiert call_states/doku_states (nur Schmücke-Sheet)

### 2. Drei Import-Buttons im /admin

```
┌─────────────────────────────────────────────┐
│ Datenimport                                 │
├─────────────────────────────────────────────┤
│ [1] Telekom-Export (Property_...csv)   [↑]  │
│      → Adressen, NVT, Auskundung-Status     │
│                                             │
│ [2] Bot-Export (schmücke_kontakt...csv) [↑] │
│      → Eigentümer, Kontakt2/3, fol_id,      │
│        Kommentare, Wartegrund               │
│                                             │
│ [3] Pro-Fiber DB (Pro-Fiber_...xlsx)   [↑]  │
│      → Umsatz, Doku-Status, Notizen         │
│      (nur Sheet "Alle GF+ HA", Schmücke)    │
└─────────────────────────────────────────────┘
```

Jeder Button unabhängig. Reihenfolge empfohlen 1→2→3, aber nicht erzwungen. Import-Log zeigt: `neu / geupdatet / no-match` pro Datei.

### 3. Kontakt-Karte (Detail) — neue Read-Only-Sektion

Neuer aufklappbarer Block „Telekom-Portal-Info" (nur wenn Daten vorhanden):
- **Kommentar** (aus Portal)
- **Wartegrund** + **Wartegrund-Kommentar**
- **Wiedervorlage** (Datum)
- **FoL-ID**
- **Nächster Schritt**
- **Hausstich-Status**
- **Kontakt 2** (Name, Mobil, Festnetz, Email — wenn vorhanden)
- **Kontakt 3** (dito)
- **Eigentümer-Anschrift** (wenn abweichend)

Alles read-only, wird bei jedem Bot-Import überschrieben.

### 4. Terminierbarkeits-Logik in Liste & Karte

Objekt ist **tabu** (nicht terminierbar) wenn:
```
auskundung_erforderlich = true AND auskundung_von IS NULL
```
→ In der Liste: grauer Hintergrund, ausgegrautes Icon, Badge „Auskundung ausstehend"
→ In der Karte: „Terminieren"-Button disabled mit Tooltip „Objekt benötigt erst Auskundungstermin"

Objekt ist **terminierbar** wenn:
- keine Auskundung erforderlich, ODER
- Auskundung erforderlich UND `auskundung_von` gesetzt (Termin steht)

### 5. Storniert

Feld wird importiert und in der Karte als Info-Badge gezeigt („Storniert lt. Portal"), aber keine UI-Filterung — Objekt bleibt normal sichtbar/bedienbar. Grund unklar, daher keine automatischen Aktionen.

## Technische Details

- **KLS als kanonischer Key**: Alle drei Importer matchen primär auf `kls_id`. Fallback nur bei Telekom-Import: Adresse+NVT.
- **Bot-CSV-Parser**: Semikolon-Trenner, BOM, UTF-8. 113 Spalten, wir mappen ~20. FoL-ID, Kontakt2/3, Wartegrund, Hausstich, Eigentümer-Adresse.
- **Pro-Fiber XLSX-Parser**: Nur Sheet `Alle GF+ HA` einlesen, dann pro Zeile Adresse+HNr → KLS auflösen. Fremdprojekte (Kirchenlamitz, Kalchreuth, Wendelstein) werden ignoriert (per Scope-Constraint).
- **Storniert**: Boolean-Spalte, keine RLS-Sonderregel.
- **Migration**: Alle neuen Spalten `NULL` erlaubt, kein Default-Wert. Existierende Zeilen bleiben unverändert.

## Was NICHT gebaut wird

- Keine Auto-Termine bei Bot-Import.
- Keine Löschung stornierter Objekte.
- Keine E-Mail-Übernahme im UI-Kontakt-Anlege-Flow (Constraint bleibt).
- Keine Fremdprojekte (nur „An der Schmücke").
