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
      ai_daily_usage: {
        Row: {
          call_count: number
          usage_date: string
          user_id: string
        }
        Insert: {
          call_count?: number
          usage_date?: string
          user_id: string
        }
        Update: {
          call_count?: number
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          application_review_id: string | null
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          cost_gbp: number
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          is_retry: boolean
          model: string
          output_tokens: number
          pipeline_step: string
          user_id: string | null
        }
        Insert: {
          application_review_id?: string | null
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          cost_gbp?: number
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          is_retry?: boolean
          model: string
          output_tokens?: number
          pipeline_step: string
          user_id?: string | null
        }
        Update: {
          application_review_id?: string | null
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          cost_gbp?: number
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          is_retry?: boolean
          model?: string
          output_tokens?: number
          pipeline_step?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_application_review_id_fkey"
            columns: ["application_review_id"]
            isOneToOne: false
            referencedRelation: "application_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      application_answers: {
        Row: {
          answer_text: string
          application_id: string
          created_at: string
          field_type: string
          id: string
          is_disabled: boolean
          last_reviewed_text: string | null
          question_id: string
          selected_options: Json | null
          updated_at: string
        }
        Insert: {
          answer_text?: string
          application_id: string
          created_at?: string
          field_type?: string
          id?: string
          is_disabled?: boolean
          last_reviewed_text?: string | null
          question_id: string
          selected_options?: Json | null
          updated_at?: string
        }
        Update: {
          answer_text?: string
          application_id?: string
          created_at?: string
          field_type?: string
          id?: string
          is_disabled?: boolean
          last_reviewed_text?: string | null
          question_id?: string
          selected_options?: Json | null
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
          application_id: string
          created_at: string
          credits_charged: number
          criteria_set_id: string | null
          error_message: string | null
          id: string
          period_credits_charged: number
          progress: Json
          purchased_credits_charged: number
          questions_set_id: string | null
          results: Json | null
          review_number: number
          status: string
          total_cache_creation_tokens: number
          total_cache_read_tokens: number
          total_cost_gbp: number
          total_cost_usd: number
          total_input_tokens: number
          total_output_tokens: number
        }
        Insert: {
          application_id: string
          created_at?: string
          credits_charged?: number
          criteria_set_id?: string | null
          error_message?: string | null
          id?: string
          period_credits_charged?: number
          progress?: Json
          purchased_credits_charged?: number
          questions_set_id?: string | null
          results?: Json | null
          review_number?: number
          status?: string
          total_cache_creation_tokens?: number
          total_cache_read_tokens?: number
          total_cost_gbp?: number
          total_cost_usd?: number
          total_input_tokens?: number
          total_output_tokens?: number
        }
        Update: {
          application_id?: string
          created_at?: string
          credits_charged?: number
          criteria_set_id?: string | null
          error_message?: string | null
          id?: string
          period_credits_charged?: number
          progress?: Json
          purchased_credits_charged?: number
          questions_set_id?: string | null
          results?: Json | null
          review_number?: number
          status?: string
          total_cache_creation_tokens?: number
          total_cache_read_tokens?: number
          total_cost_gbp?: number
          total_cost_usd?: number
          total_input_tokens?: number
          total_output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "application_reviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_reviews_criteria_set_id_fkey"
            columns: ["criteria_set_id"]
            isOneToOne: false
            referencedRelation: "criteria_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_reviews_questions_set_id_fkey"
            columns: ["questions_set_id"]
            isOneToOne: false
            referencedRelation: "questions_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          created_at: string
          criteria_set_id: string
          fund_id: string
          id: string
          questions_set_id: string
          review_count: number
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criteria_set_id: string
          fund_id: string
          id?: string
          questions_set_id: string
          review_count?: number
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          criteria_set_id?: string
          fund_id?: string
          id?: string
          questions_set_id?: string
          review_count?: number
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_criteria_set_id_fkey"
            columns: ["criteria_set_id"]
            isOneToOne: false
            referencedRelation: "criteria_sets"
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
            foreignKeyName: "applications_questions_set_id_fkey"
            columns: ["questions_set_id"]
            isOneToOne: false
            referencedRelation: "questions_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_purchases: {
        Row: {
          amount_pence: number
          created_at: string
          credits: number
          id: string
          pack_type: string
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          amount_pence: number
          created_at?: string
          credits: number
          id?: string
          pack_type: string
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          amount_pence?: number
          created_at?: string
          credits?: number
          id?: string
          pack_type?: string
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      criteria_sets: {
        Row: {
          approved: boolean
          created_at: string
          created_by: string
          criteria_json: Json
          description: string | null
          fund_id: string
          id: string
          label: string | null
          name: string
          rejected: boolean
          rejection_reason: string | null
        }
        Insert: {
          approved?: boolean
          created_at?: string
          created_by: string
          criteria_json: Json
          description?: string | null
          fund_id: string
          id?: string
          label?: string | null
          name: string
          rejected?: boolean
          rejection_reason?: string | null
        }
        Update: {
          approved?: boolean
          created_at?: string
          created_by?: string
          criteria_json?: Json
          description?: string | null
          fund_id?: string
          id?: string
          label?: string | null
          name?: string
          rejected?: boolean
          rejection_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "criteria_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "criteria_sets_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          approved: boolean
          closes_at: string | null
          created_at: string
          created_by: string
          creator_hidden: boolean
          id: string
          name: string
          notes: string | null
          opens_at: string | null
          organisation_id: string
          rejected: boolean
          rejection_reason: string | null
          shared: boolean
          updated_at: string
          url: string | null
        }
        Insert: {
          approved?: boolean
          closes_at?: string | null
          created_at?: string
          created_by: string
          creator_hidden?: boolean
          id?: string
          name: string
          notes?: string | null
          opens_at?: string | null
          organisation_id: string
          rejected?: boolean
          rejection_reason?: string | null
          shared?: boolean
          updated_at?: string
          url?: string | null
        }
        Update: {
          approved?: boolean
          closes_at?: string | null
          created_at?: string
          created_by?: string
          creator_hidden?: boolean
          id?: string
          name?: string
          notes?: string | null
          opens_at?: string | null
          organisation_id?: string
          rejected?: boolean
          rejection_reason?: string | null
          shared?: boolean
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          approved: boolean
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          rejected: boolean
          rejection_reason: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          approved?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          rejected?: boolean
          rejection_reason?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          approved?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          rejected?: boolean
          rejection_reason?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organisations_created_by_fkey"
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
          purchased_credits: number
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
          purchased_credits?: number
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
          purchased_credits?: number
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
          approved: boolean
          created_at: string
          created_by: string
          fund_id: string
          id: string
          label: string | null
          overall_word_limit: number | null
          questions_json: Json
          rejected: boolean
          rejection_reason: string | null
        }
        Insert: {
          approved?: boolean
          created_at?: string
          created_by: string
          fund_id: string
          id?: string
          label?: string | null
          overall_word_limit?: number | null
          questions_json: Json
          rejected?: boolean
          rejection_reason?: string | null
        }
        Update: {
          approved?: boolean
          created_at?: string
          created_by?: string
          fund_id?: string
          id?: string
          label?: string | null
          overall_word_limit?: number | null
          questions_json?: Json
          rejected?: boolean
          rejection_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_sets_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      review_feedback: {
        Row: {
          created_at: string | null
          id: string
          item_path: string
          item_type: string
          review_id: string
          sentiment: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_path: string
          item_type: string
          review_id: string
          sentiment: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_path?: string
          item_type?: string
          review_id?: string
          sentiment?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_feedback_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "application_reviews"
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
            foreignKeyName: "reviews_criteria_set_id_fkey"
            columns: ["criteria_set_id"]
            isOneToOne: false
            referencedRelation: "criteria_sets"
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
            foreignKeyName: "reviews_questions_set_id_fkey"
            columns: ["questions_set_id"]
            isOneToOne: false
            referencedRelation: "questions_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage: {
        Row: {
          bonus_reviews: number
          credits_limit: number
          credits_used: number
          id: string
          period: string
          user_id: string
        }
        Insert: {
          bonus_reviews?: number
          credits_limit?: number
          credits_used?: number
          id?: string
          period: string
          user_id: string
        }
        Update: {
          bonus_reviews?: number
          credits_limit?: number
          credits_used?: number
          id?: string
          period?: string
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
      aggregate_ai_usage: {
        Args: never
        Returns: {
          model: string
          pipeline_step: string
          total_calls: number
          total_cost_gbp: number
          total_cost_usd: number
          total_input_tokens: number
          total_output_tokens: number
        }[]
      }
      aggregate_ai_usage_since: {
        Args: { since_date: string }
        Returns: {
          model: string
          pipeline_step: string
          total_calls: number
          total_cost_gbp: number
          total_cost_usd: number
          total_input_tokens: number
          total_output_tokens: number
        }[]
      }
      aggregate_scraping_usage: {
        Args: never
        Returns: {
          pipeline_step: string
          total_calls: number
          total_cost_gbp: number
          total_cost_usd: number
          total_input_tokens: number
          total_output_tokens: number
        }[]
      }
      aggregate_scraping_usage_since: {
        Args: { since_date: string }
        Returns: {
          pipeline_step: string
          total_calls: number
          total_cost_gbp: number
          total_cost_usd: number
          total_input_tokens: number
          total_output_tokens: number
        }[]
      }
      cancel_review: {
        Args: { p_application_id: string; p_user_id: string }
        Returns: string
      }
      deduct_credits: {
        Args: {
          p_credits: number
          p_period: string
          p_review_id: string
          p_user_id: string
        }
        Returns: {
          period_deducted: number
          purchased_deducted: number
        }[]
      }
      get_avg_answer_chars: {
        Args: never
        Returns: {
          avg_chars: number
        }[]
      }
      get_completed_review_count: {
        Args: never
        Returns: {
          review_count: number
        }[]
      }
      get_estimation_step_stats: {
        Args: never
        Returns: {
          avg_cost_usd: number
          call_count: number
          pipeline_step: string
        }[]
      }
      increment_ai_daily_usage: {
        Args: { p_limit: number; p_user_id: string }
        Returns: number
      }
      increment_purchased_credits: {
        Args: { p_credits: number; p_user_id: string }
        Returns: undefined
      }
      rollback_usage: { Args: { p_user_id: string }; Returns: undefined }
      submit_review:
        | {
            Args: {
              p_application_id: string
              p_criteria_set_id: string
              p_default_limit?: number
              p_estimated_credits_low?: number
              p_period: string
              p_questions_set_id: string
              p_review_number: number
              p_user_id: string
            }
            Returns: {
              review_id: string
              review_number: number
            }[]
          }
        | {
            Args: {
              p_application_id: string
              p_criteria_set_id: string
              p_default_limit?: number
              p_period: string
              p_questions_set_id: string
              p_review_number: number
              p_user_id: string
            }
            Returns: {
              review_id: string
              review_number: number
            }[]
          }
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
