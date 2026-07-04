export type Contact = {
  bid: string;
  strasse: string;
  hnr: string;
  hnr_zusatz: string;
  plz: string;
  ort: string;
  name: string;
  email: string;
  mobil: string;
  festnetz: string;
  typ: string;
  we: number;
  ge: number;
  zustimmung: string;
  lat: number | null;
  lng: number | null;
  auskundung_von: string | null;
  auskundung_bis: string | null;
  nvt: string;
  auskundung_erforderlich?: boolean;
  auskundung_status?: string;
  auskundung_erfolgt?: boolean;
  auskundung_ergebnis?: string;
  auftrag_erstellt_am?: string | null;
};

export type CallStatus =
  | "offen"
  | "angerufen"
  | "termin"
  | "nichtErreicht"
  | "abgelehnt"
  | "erledigt";

export type CallState = {
  erledigt_datum?: string | null;
  bid: string;
  status: CallStatus;
  termin_slot: string;
  termin_datum: string | null;
  termin_zeit: string;
  notiz: string;
  klarfall: boolean;
  klarfall_notiz: string;
  grabenlaenge: number;
  team: string;
  team_status: string;
  fotos_erhalten: boolean;
  protokoll_erhalten: boolean;
  priority_override: number | null;
  kurz_kandidat?: boolean;
  umsatz_eur?: number;
  zusatz_eur?: number;
  updated_at: string;
};

export type DokuState = {
  bid: string;
  foto: boolean;
  protokoll: boolean;
  sharepoint: boolean;
  durchfuehrt_von: string;
  durchfuehrt_am: string | null;
  notiz: string;
  updated_at: string;
};
