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
      app_exports: {
        Row: {
          created_at: string
          export_type: Database["public"]["Enums"]["export_type"] | null
          file_url: string | null
          id: string
          metadata: Json | null
          project_id: string
        }
        Insert: {
          created_at?: string
          export_type?: Database["public"]["Enums"]["export_type"] | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          project_id: string
        }
        Update: {
          created_at?: string
          export_type?: Database["public"]["Enums"]["export_type"] | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "app_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      app_files: {
        Row: {
          content: string
          created_at: string
          file_type: string | null
          generation_id: string | null
          id: string
          path: string
          project_id: string
          revision_id: string | null
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          file_type?: string | null
          generation_id?: string | null
          id?: string
          path: string
          project_id: string
          revision_id?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          file_type?: string | null
          generation_id?: string | null
          id?: string
          path?: string
          project_id?: string
          revision_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_files_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "app_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "app_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_files_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "app_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_generations: {
        Row: {
          build_log: string | null
          build_status: string | null
          created_at: string
          current_stage: string | null
          error_message: string | null
          estimated_cost: number | null
          generation_mode: string | null
          id: string
          model_name: string
          progress: number | null
          project_id: string
          prompt: string
          spec_json: Json | null
          status: Database["public"]["Enums"]["generation_status"] | null
          token_usage: number | null
        }
        Insert: {
          build_log?: string | null
          build_status?: string | null
          created_at?: string
          current_stage?: string | null
          error_message?: string | null
          estimated_cost?: number | null
          generation_mode?: string | null
          id?: string
          model_name?: string
          progress?: number | null
          project_id: string
          prompt: string
          spec_json?: Json | null
          status?: Database["public"]["Enums"]["generation_status"] | null
          token_usage?: number | null
        }
        Update: {
          build_log?: string | null
          build_status?: string | null
          created_at?: string
          current_stage?: string | null
          error_message?: string | null
          estimated_cost?: number | null
          generation_mode?: string | null
          id?: string
          model_name?: string
          progress?: number | null
          project_id?: string
          prompt?: string
          spec_json?: Json | null
          status?: Database["public"]["Enums"]["generation_status"] | null
          token_usage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "app_generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "app_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      app_projects: {
        Row: {
          app_type: string | null
          created_at: string
          created_by: string
          description: string | null
          github_connected: boolean | null
          github_repo_url: string | null
          id: string
          name: string
          options: Json | null
          selected_model: string | null
          slug: string
          stack_key: string | null
          status: Database["public"]["Enums"]["app_project_status"] | null
          template_key: string | null
          updated_at: string
        }
        Insert: {
          app_type?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          github_connected?: boolean | null
          github_repo_url?: string | null
          id?: string
          name: string
          options?: Json | null
          selected_model?: string | null
          slug: string
          stack_key?: string | null
          status?: Database["public"]["Enums"]["app_project_status"] | null
          template_key?: string | null
          updated_at?: string
        }
        Update: {
          app_type?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          github_connected?: boolean | null
          github_repo_url?: string | null
          id?: string
          name?: string
          options?: Json | null
          selected_model?: string | null
          slug?: string
          stack_key?: string | null
          status?: Database["public"]["Enums"]["app_project_status"] | null
          template_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_revisions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string
          generation_id: string | null
          id: string
          project_id: string
          revision_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by: string
          generation_id?: string | null
          id?: string
          project_id: string
          revision_number?: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string
          generation_id?: string | null
          id?: string
          project_id?: string
          revision_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "app_revisions_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "app_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "app_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      build_logs: {
        Row: {
          created_at: string
          generation_id: string | null
          id: string
          level: Database["public"]["Enums"]["build_log_level"] | null
          log_type: string | null
          message: string
          project_id: string
        }
        Insert: {
          created_at?: string
          generation_id?: string | null
          id?: string
          level?: Database["public"]["Enums"]["build_log_level"] | null
          log_type?: string | null
          message: string
          project_id: string
        }
        Update: {
          created_at?: string
          generation_id?: string | null
          id?: string
          level?: Database["public"]["Enums"]["build_log_level"] | null
          log_type?: string | null
          message?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_logs_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "app_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "app_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      github_connections: {
        Row: {
          account_name: string | null
          created_at: string
          encrypted_token_reference: string | null
          id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          created_at?: string
          encrypted_token_reference?: string | null
          id?: string
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          created_at?: string
          encrypted_token_reference?: string | null
          id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          action_type: string
          created_at: string
          id: string
          metadata: Json | null
          model_used: string | null
          project_id: string | null
          token_usage: number | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          project_id?: string | null
          token_usage?: number | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          project_id?: string | null
          token_usage?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_tracking_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "app_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_plans: {
        Row: {
          created_at: string
          exports_limit: number
          exports_used: number
          follow_ups_limit: number
          follow_ups_used: number
          generations_limit: number
          generations_used: number
          id: string
          period_end: string
          period_start: string
          plan_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exports_limit?: number
          exports_used?: number
          follow_ups_limit?: number
          follow_ups_used?: number
          generations_limit?: number
          generations_used?: number
          id?: string
          period_end?: string
          period_start?: string
          plan_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exports_limit?: number
          exports_used?: number
          follow_ups_limit?: number
          follow_ups_used?: number
          generations_limit?: number
          generations_used?: number
          id?: string
          period_end?: string
          period_start?: string
          plan_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_increment_quota: {
        Args: { p_action_type: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_project_status:
        | "draft"
        | "generating"
        | "generated"
        | "reviewing"
        | "validating"
        | "preview_ready"
        | "export_ready"
        | "github_ready"
        | "failed"
      build_log_level: "info" | "warning" | "error" | "success"
      export_type:
        | "zip"
        | "desktop_mac"
        | "desktop_windows"
        | "mobile_android"
        | "mobile_ios"
        | "pwa"
        | "github"
      generation_status:
        | "pending"
        | "creating_spec"
        | "generating_files"
        | "reviewing"
        | "validating"
        | "completed"
        | "failed"
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
      app_project_status: [
        "draft",
        "generating",
        "generated",
        "reviewing",
        "validating",
        "preview_ready",
        "export_ready",
        "github_ready",
        "failed",
      ],
      build_log_level: ["info", "warning", "error", "success"],
      export_type: [
        "zip",
        "desktop_mac",
        "desktop_windows",
        "mobile_android",
        "mobile_ios",
        "pwa",
        "github",
      ],
      generation_status: [
        "pending",
        "creating_spec",
        "generating_files",
        "reviewing",
        "validating",
        "completed",
        "failed",
      ],
    },
  },
} as const
