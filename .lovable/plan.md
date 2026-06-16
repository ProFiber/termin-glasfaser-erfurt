## Bauleiter-Bericht überarbeiten + Finanz-PDF reparieren

### 1) Finanz-PDF Export reparieren
Der Button nutzt `html2canvas`. Vermutliche Ursache: moderne CSS-Farbfunktionen (oklch / color-mix aus Tailwind v4 bzw. neue Browser-Defaults) lassen html2canvas crashen → kein Download, evtl. nur Konsolenfehler.

**Fix:** `exportPDF()` umstellen auf reines `jsPDF` (Vektor, gleicher Ansatz wie Bauleiter-Bericht). Das ist robuster, leichter, und sieht sauberer aus. Inhalt:
- Kopfzeile (Datum/Uhrzeit, Projekt)
- KPI-Block: Heute / Diese Woche / Dieser Monat (HA, m, €)
- Ziel-Kachel: Monatsziel, Ist, Δ, benötigt/Tag
- Tabelle "Letzte Erledigungen" (kompakt)
- Footer mit Seitenzahlen

### 2) Bauleiter-Bericht anpassen
**Entfernen:**
- Alle €-Spalten/Werte (Gesamt-Summe, "Betrag"-Spalte, Wochensumme €)
- Spalte "Team" in "Diese Woche erledigt"

**Neu hinzufügen:**

**a) Priorisierte NVT-Übersicht (oben, prominent)**
Sternchen je NVT aus `src/lib/priority.ts` (3 = ⭐⭐⭐, 2 = ⭐⭐, 1 = ⭐).
NVT-Tabelle wird nach Priorität sortiert (höchste oben) und Stern-Spalte vor NVT-Name. Priorität-3 NVTs zusätzlich farblich hervorgehoben (rosa Hintergrund-Balken).

**b) Klärfälle-Sektion**
Neue Sektion zwischen NVT-Tabelle und Wochenliste. Pro Klärfall:
- Adresse + NVT (mit Sternen falls priorisiert)
- Bau-Datum (= `erledigt_datum`, "seit X Tagen offen")
- Notiz (`klarfall_notiz`)
Sortiert: älteste zuerst. Daten aus `call_states` (`klarfall = true`).

**c) Visuelle KPIs (oben unter Titel)**
Vier Kacheln im Stil der Finanz-KPIs (mit jsPDF gezeichnete farbige Boxen):
- ✅ Erledigt gesamt (Anzahl + %)
- 🔧 In Arbeit
- 📋 Offen
- ⚠️ Klärfälle (Anzahl + ältester seit X Tagen)

Zusätzlich: horizontaler Gesamt-Fortschrittsbalken (groß) unter den Kacheln.

**d) Wochenliste — angepasste Spalten**
Datum · Adresse · NVT (mit Sternen) · Graben m
(keine Team-, keine €-Spalte mehr)

### Technische Details
- Datei: `src/components/FinanzTab.tsx` — nur `exportPDF()` und `exportBauleiterPDF()` ersetzen
- Import: `getNvtPriority`, `priorityStars` aus `@/lib/priority`
- `call_states` Select erweitern um `klarfall, klarfall_notiz`
- html2canvas-Dependency bleibt vorerst (falls woanders genutzt — sonst später entfernbar)
- Keine Schema-/Backend-Änderungen nötig