export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      absences: {
        Row: {
          date_from: string;
          date_to: string;
          id: string;
          note: string | null;
          partial_minutes: number | null;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          date_from: string;
          date_to: string;
          id?: string;
          note?: string | null;
          partial_minutes?: number | null;
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          date_from?: string;
          date_to?: string;
          id?: string;
          note?: string | null;
          partial_minutes?: number | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          at: string;
          id: number;
          row_id: string | null;
          table_name: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          at?: string;
          id?: never;
          row_id?: string | null;
          table_name: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          at?: string;
          id?: never;
          row_id?: string | null;
          table_name?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          consent_at: string;
          created_at: string;
          email_reports: boolean;
          locale: string;
          name: string;
          plan: string;
          stripe_customer_id: string | null;
          timezone: string;
          user_id: string;
        };
        Insert: {
          consent_at: string;
          created_at?: string;
          email_reports?: boolean;
          locale?: string;
          name?: string;
          plan?: string;
          stripe_customer_id?: string | null;
          timezone?: string;
          user_id: string;
        };
        Update: {
          consent_at?: string;
          created_at?: string;
          email_reports?: boolean;
          locale?: string;
          name?: string;
          plan?: string;
          stripe_customer_id?: string | null;
          timezone?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          alert_lead_days: number;
          alerts_enabled: Json;
          auto_break_deduct_minutes: number;
          auto_break_enabled: boolean;
          auto_break_threshold_minutes: number;
          daily_target_minutes: number;
          hours_format: string;
          job_percent: number;
          monthly_quota_minutes: number;
          sick_accrual_per_month: number;
          sick_opening_balance: number;
          updated_at: string;
          user_id: string;
          vacation_accrual_per_month: number;
          vacation_opening_balance: number;
          work_days: number[];
        };
        Insert: {
          alert_lead_days: number;
          alerts_enabled: Json;
          auto_break_deduct_minutes: number;
          auto_break_enabled: boolean;
          auto_break_threshold_minutes: number;
          daily_target_minutes: number;
          hours_format: string;
          job_percent: number;
          monthly_quota_minutes: number;
          sick_accrual_per_month: number;
          sick_opening_balance: number;
          updated_at?: string;
          user_id: string;
          vacation_accrual_per_month: number;
          vacation_opening_balance: number;
          work_days: number[];
        };
        Update: {
          alert_lead_days?: number;
          alerts_enabled?: Json;
          auto_break_deduct_minutes?: number;
          auto_break_enabled?: boolean;
          auto_break_threshold_minutes?: number;
          daily_target_minutes?: number;
          hours_format?: string;
          job_percent?: number;
          monthly_quota_minutes?: number;
          sick_accrual_per_month?: number;
          sick_opening_balance?: number;
          updated_at?: string;
          user_id?: string;
          vacation_accrual_per_month?: number;
          vacation_opening_balance?: number;
          work_days?: number[];
        };
        Relationships: [];
      };
      time_entries: {
        Row: {
          break_minutes: number;
          date: string;
          id: string;
          manual_minutes: number | null;
          note: string | null;
          shifts: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          break_minutes?: number;
          date: string;
          id?: string;
          manual_minutes?: number | null;
          note?: string | null;
          shifts: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          break_minutes?: number;
          date?: string;
          id?: string;
          manual_minutes?: number | null;
          note?: string | null;
          shifts?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      import_dataset: {
        Args: {
          p_absences: Json;
          p_entries: Json;
          p_name?: string;
          p_require_empty?: boolean;
          p_settings: Json;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
