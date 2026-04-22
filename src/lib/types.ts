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
};

export type CallStatus =
  | "offen"
  | "angerufen"
  | "termin"
  | "nichtErreicht"
  | "abgelehnt"
  | "erledigt";

export type CallState = {
  bid: string;
  status: CallStatus;
  termin_slot: string;
  notiz: string;
  updated_at: string;
};
