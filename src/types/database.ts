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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          id: string
          user_id: string
          fund_id: string
          criteria_set_id: string
          questions_set_id: string
          title: string | null
          status: string
          review_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fund_id: string
          criteria_set_id: string
          questions_set_id: string
          title?: string | null
          status?: string
          review_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          fund_id?: string
          criteria_set_id?: string
          questions_set_id?: string
          title?: string | null
          status?: string
          review_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_criteria_set_id_fkey"
            columns: ["criteria_set_id"]
            isOneToOne: false
            referencedRelation: "criteria_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_questions_set_id_fkey"
            columns: ["questions_set_id"]
            isOneToOne: false
            referencedRelation: "questions_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      application_answers: {
        Row: {
          id: string
          application_id: string
          question_id: string
          answer_text: string
          field_type: string
          selected_options: Json | null
          last_reviewed_text: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          application_id: string
          question_id: string
          answer_text?: string
          field_type?: string
          selected_options?: Json | null
          last_reviewed_text?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          application_id?: string
          question_id?: string
          answer_text?: string
          field_type?: string
          selected_options?: Json | null
          last_reviewed_text?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_answers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_reviews: {
        Row: {
          id: string
          application_id: string
          review_number: number
          status: string
          progress: Json
          results: Json | null
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          application_id: string
          review_number?: number
          status?: string
          progress?: Json
          results?: Json | null
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          application_id?: string
          review_number?: number
          status?: string
          progress?: Json
          results?: Json | null
          error_message?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_reviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      criteria_sets: {
        Row: {
          id: string
          fund_id: string
          label: string | null
          name: string
          description: string | null
          criteria_json: Json
          approved: boolean
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          fund_id: string
          label?: string | null
          name: string
          description?: string | null
          criteria_json: Json
          approved?: boolean
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          fund_id?: string
          label?: string | null
          name?: string
          description?: string | null
          criteria_json?: Json
          approved?: boolean
          created_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "criteria_sets_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "criteria_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          id: string
          name: string
          funder_organisation: string | null
          url: string | null
          notes: string | null
          published: boolean
          creator_hidden: boolean
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          funder_organisation?: string | null
          url?: string | null
          notes?: string | null
          published?: boolean
          creator_hidden?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          funder_organisation?: string | null
          url?: string | null
          notes?: string | null
          published?: boolean
          creator_hidden?: boolean
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          current_period_end: string | null
          display_name: string | null
          id: string
          is_admin: boolean
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          subscription_tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          display_name?: string | null
          id: string
          is_admin?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          display_name?: string | null
          id?: string
          is_admin?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      questions_sets: {
        Row: {
          id: string
          fund_id: string
          label: string | null
          questions_json: Json
          overall_word_limit: number | null
          approved: boolean
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          fund_id: string
          label?: string | null
          questions_json: Json
          overall_word_limit?: number | null
          approved?: boolean
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          fund_id?: string
          label?: string | null
          questions_json?: Json
          overall_word_limit?: number | null
          approved?: boolean
          created_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_sets_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_purchases: {
        Row: {
          amount_pence: number
          created_at: string
          id: string
          review_id: string | null
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          amount_pence: number
          created_at?: string
          id?: string
          review_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          amount_pence?: number
          created_at?: string
          id?: string
          review_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_purchases_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_results: {
        Row: {
          created_at: string
          id: string
          progress: Json
          results: Json | null
          review_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          progress?: Json
          results?: Json | null
          review_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          progress?: Json
          results?: Json | null
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_results_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          bid_file_name: string
          bid_file_path: string
          created_at: string
          criteria_json: Json | null
          criteria_set_id: string | null
          error_message: string | null
          fund_id: string | null
          id: string
          is_scorecard_only: boolean
          model_tier: string
          output_file_path: string | null
          questions_json: Json | null
          questions_set_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bid_file_name: string
          bid_file_path: string
          created_at?: string
          criteria_json?: Json | null
          criteria_set_id?: string | null
          error_message?: string | null
          fund_id?: string | null
          id?: string
          is_scorecard_only?: boolean
          model_tier?: string
          output_file_path?: string | null
          questions_json?: Json | null
          questions_set_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bid_file_name?: string
          bid_file_path?: string
          created_at?: string
          criteria_json?: Json | null
          criteria_set_id?: string | null
          error_message?: string | null
          fund_id?: string | null
          id?: string
          is_scorecard_only?: boolean
          model_tier?: string
          output_file_path?: string | null
          questions_json?: Json | null
          questions_set_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_criteria_set_id_fkey"
            columns: ["criteria_set_id"]
            isOneToOne: false
            referencedRelation: "criteria_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_questions_set_id_fkey"
            columns: ["questions_set_id"]
            isOneToOne: false
            referencedRelation: "questions_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      usage: {
        Row: {
          bonus_reviews: number
          id: string
          period: string
          reviews_limit: number
          reviews_used: number
          user_id: string
        }
        Insert: {
          bonus_reviews?: number
          id?: string
          period: string
          reviews_limit?: number
          reviews_used?: number
          user_id: string
        }
        Update: {
          bonus_reviews?: number
          id?: string
          period?: string
          reviews_limit?: number
          reviews_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
