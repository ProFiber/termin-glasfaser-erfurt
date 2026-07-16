export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      call_states: {
        Row: {
          aufmass_am: string | null
          avis_am: string | null
          bid: string
          eingereicht_am: string | null
          erledigt_datum: string | null
          fotos_erhalten: boolean
          grabenlaenge: number
          gutschrift_am: string | null
          gutschrift_nr: string
          klarfall: boolean
          klarfall_notiz: string
          kurz_kandidat: boolean
          notiz: string
          priority_override: number | null
          protokoll_erhalten: boolean
          pruefung_nachforderung: string[]
          pruefung_notiz: string
          pruefung_status: string
          status: Database["public"]["Enums"]["call_status"]
          team: string
          team_status: string
          termin_datum: string | null
          termin_slot: string
          termin_zeit: string
          umsatz_eur: number
          updated_at: string
          verguetet_am: string | null
          zusatz_eur: number
        }
        Insert: {
          aufmass_am?: string | null
          avis_am?: string | null
          bid: string
          eingereicht_am?: string | null
          erledigt_datum?: string | null
          fotos_erhalten?: boolean
          grabenlaenge?: number
          gutschrift_am?: string | null
          gutschrift_nr?: string
          klarfall?: boolean
          klarfall_notiz?: string
          kurz_kandidat?: boolean
          notiz?: string
          priority_override?: number | null
          protokoll_erhalten?: boolean
          pruefung_nachforderung?: string[]
          pruefung_notiz?: string
          pruefung_status?: string
          status?: Database["public"]["Enums"]["call_status"]
          team?: string
          team_status?: string
          termin_datum?: string | null
          termin_slot?: string
          termin_zeit?: string
          umsatz_eur?: number
          updated_at?: string
          verguetet_am?: string | null
          zusatz_eur?: number
        }
        Update: {
          aufmass_am?: string | null
          avis_am?: string | null
          bid?: string
          eingereicht_am?: string | null
          erledigt_datum?: string | null
          fotos_erhalten?: boolean
          grabenlaenge?: number
          gutschrift_am?: string | null
          gutschrift_nr?: string
          klarfall?: boolean
          klarfall_notiz?: string
          kurz_kandidat?: boolean
          notiz?: string
          priority_override?: number | null
          protokoll_erhalten?: boolean
          pruefung_nachforderung?: string[]
          pruefung_notiz?: string
          pruefung_status?: string
          status?: Database["public"]["Enums"]["call_status"]
          team?: string
          team_status?: string
          termin_datum?: string | null
          termin_slot?: string
          termin_zeit?: string
          umsatz_eur?: number
          updated_at?: string
          verguetet_am?: string | null
          zusatz_eur?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_states_bid_fkey"
            columns: ["bid"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["bid"]
          },
        ]
      }
      contacts: {
        Row: {
          anschluss_typ: string | null
          auftrag_erstellt_am: string | null
          auftragsquelle: string
          auskundung_bis: string | null
          auskundung_erfolgt: boolean
          auskundung_erforderlich: boolean
          auskundung_ergebnis: string
          auskundung_status: string
          auskundung_von: string | null
          bid: string
          contact2_email: string | null
          contact2_festnetz: string | null
          contact2_mobil: string | null
          contact2_name: string | null
          contact3_email: string | null
          contact3_festnetz: string | null
          contact3_mobil: string | null
          contact3_name: string | null
          created_at: string
          eig_hnr: string | null
          eig_ort: string | null
          eig_plz: string | null
          eig_strasse: string | null
          email: string
          festnetz: string
          fol_id: string | null
          ge: number
          hausstich_datum: string | null
          hausstich_status: string | null
          hnr: string
          hnr_zusatz: string
          kls_id: string | null
          lat: number | null
          lng: number | null
          mobil: string
          naechster_schritt: string | null
          name: string
          nvt: string
          ort: string
          plz: string
          storniert: boolean
          strasse: string
          telekom_bid: string | null
          telekom_kommentar: string | null
          typ: string
          wartegrund: string | null
          wartegrund_kommentar: string | null
          we: number
          wiedervorlage: string | null
          zustimmung: string
        }
        Insert: {
          anschluss_typ?: string | null
          auftrag_erstellt_am?: string | null
          auftragsquelle?: string
          auskundung_bis?: string | null
          auskundung_erfolgt?: boolean
          auskundung_erforderlich?: boolean
          auskundung_ergebnis?: string
          auskundung_status?: string
          auskundung_von?: string | null
          bid: string
          contact2_email?: string | null
          contact2_festnetz?: string | null
          contact2_mobil?: string | null
          contact2_name?: string | null
          contact3_email?: string | null
          contact3_festnetz?: string | null
          contact3_mobil?: string | null
          contact3_name?: string | null
          created_at?: string
          eig_hnr?: string | null
          eig_ort?: string | null
          eig_plz?: string | null
          eig_strasse?: string | null
          email?: string
          festnetz?: string
          fol_id?: string | null
          ge?: number
          hausstich_datum?: string | null
          hausstich_status?: string | null
          hnr?: string
          hnr_zusatz?: string
          kls_id?: string | null
          lat?: number | null
          lng?: number | null
          mobil?: string
          naechster_schritt?: string | null
          name?: string
          nvt?: string
          ort?: string
          plz?: string
          storniert?: boolean
          strasse?: string
          telekom_bid?: string | null
          telekom_kommentar?: string | null
          typ?: string
          wartegrund?: string | null
          wartegrund_kommentar?: string | null
          we?: number
          wiedervorlage?: string | null
          zustimmung?: string
        }
        Update: {
          anschluss_typ?: string | null
          auftrag_erstellt_am?: string | null
          auftragsquelle?: string
          auskundung_bis?: string | null
          auskundung_erfolgt?: boolean
          auskundung_erforderlich?: boolean
          auskundung_ergebnis?: string
          auskundung_status?: string
          auskundung_von?: string | null
          bid?: string
          contact2_email?: string | null
          contact2_festnetz?: string | null
          contact2_mobil?: string | null
          contact2_name?: string | null
          contact3_email?: string | null
          contact3_festnetz?: string | null
          contact3_mobil?: string | null
          contact3_name?: string | null
          created_at?: string
          eig_hnr?: string | null
          eig_ort?: string | null
          eig_plz?: string | null
          eig_strasse?: string | null
          email?: string
          festnetz?: string
          fol_id?: string | null
          ge?: number
          hausstich_datum?: string | null
          hausstich_status?: string | null
          hnr?: string
          hnr_zusatz?: string
          kls_id?: string | null
          lat?: number | null
          lng?: number | null
          mobil?: string
          naechster_schritt?: string | null
          name?: string
          nvt?: string
          ort?: string
          plz?: string
          storniert?: boolean
          strasse?: string
          telekom_bid?: string | null
          telekom_kommentar?: string | null
          typ?: string
          wartegrund?: string | null
          wartegrund_kommentar?: string | null
          we?: number
          wiedervorlage?: string | null
          zustimmung?: string
        }
        Relationships: []
      }
      doku_states: {
        Row: {
          bid: string
          durchfuehrt_am: string | null
          durchfuehrt_von: string
          foto: boolean
          gf_plus: boolean
          notiz: string
          protokoll: boolean
          sharepoint: boolean
          updated_at: string
        }
        Insert: {
          bid: string
          durchfuehrt_am?: string | null
          durchfuehrt_von?: string
          foto?: boolean
          gf_plus?: boolean
          notiz?: string
          protokoll?: boolean
          sharepoint?: boolean
          updated_at?: string
        }
        Update: {
          bid?: string
          durchfuehrt_am?: string | null
          durchfuehrt_von?: string
          foto?: boolean
          gf_plus?: boolean
          notiz?: string
          protokoll?: boolean
          sharepoint?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      import_log: {
        Row: {
          bid: string | null
          created_at: string
          details: Json | null
          hnr: string | null
          id: string
          quelle: string
          status: string
          strasse: string | null
        }
        Insert: {
          bid?: string | null
          created_at?: string
          details?: Json | null
          hnr?: string | null
          id?: string
          quelle: string
          status: string
          strasse?: string | null
        }
        Update: {
          bid?: string | null
          created_at?: string
          details?: Json | null
          hnr?: string | null
          id?: string
          quelle?: string
          status?: string
          strasse?: string | null
        }
        Relationships: []
      }
      umsatz_ziele: {
        Row: {
          arbeitstage_pro_monat: number
          id: string
          saturday_buffer: boolean
          scope: string
          updated_at: string
          ziel_eur: number
        }
        Insert: {
          arbeitstage_pro_monat?: number
          id?: string
          saturday_buffer?: boolean
          scope: string
          updated_at?: string
          ziel_eur: number
        }
        Update: {
          arbeitstage_pro_monat?: number
          id?: string
          saturday_buffer?: boolean
          scope?: string
          updated_at?: string
          ziel_eur?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_fill_contact_info: { Args: { payload: Json }; Returns: number }
      bulk_import_bot_contacts: { Args: { payload: Json }; Returns: Json }
      bulk_import_call_states_from_excel: {
        Args: { payload: Json }
        Returns: Json
      }
      bulk_import_contacts: { Args: { payload: Json }; Returns: number }
      mark_eingereicht: { Args: { bids: string[] }; Returns: number }
    }
    Enums: {
      call_status:
        | "offen"
        | "angerufen"
        | "termin"
        | "nichtErreicht"
        | "abgelehnt"
        | "erledigt"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      call_status: [
        "offen",
        "angerufen",
        "termin",
        "nichtErreicht",
        "abgelehnt",
        "erledigt",
      ],
    },
  },
} as const
