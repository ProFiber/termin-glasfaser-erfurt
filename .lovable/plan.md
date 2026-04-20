
## Glasfaser Call-Liste – Störmer Bau

A mobile-optimized call list app for managing fiber optic installation appointments with 46 customer contacts on Hauptstr. and Lange Str.

### Features
- **Sticky header** in Telekom magenta (#e20074) with live counter "X / 4 ✓" appointments and save indicator
- **Filter bar**: by street (Alle / Hauptstr. / Lange Str.) and by status (Alle / Offen / Nicht erreicht / Termin / Abgelehnt)
- **Contact cards** showing address, building type (EFH/MFH), units (WE), name, and booked appointment slot — color-coded border + background by status
- **Expandable card** with:
  - German call script ("Leitfaden") personalized with last name and street
  - One-tap call buttons for mobile and landline (auto-marks "Angerufen")
  - Status buttons: Nicht erreicht / Abgelehnt
  - Appointment grid: Tue–Sat × Vormittag/Nachmittag (10 slots) — selecting auto-sets status to "Termin"
  - Free-text note field
- **Bottom status bar** with running tallies
- **Persistence**: all status, appointments, and notes saved to localStorage (`schmucke_callliste_v1`) with brief "💾 gespeichert" flash on each change

### Implementation
- Replace the placeholder in `src/routes/index.tsx` with the `CallListe` component
- Embed the 46 contacts, slot definitions, and status metadata as constants in the file
- Mobile-first layout, max-width 480px, system font stack — matches the design exactly as provided
- Update page `<title>` and meta description in the route's `head()` to "Glasfaser Call-Liste · Störmer Bau"

No backend, no auth — pure client-side tool for field use.
