export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      games: {
        Row: {
          created_at: string
          created_by: string
          id: string
          score_a: number
          score_b: number
          session_id: string
          side_a_player_1: string
          side_a_player_2: string | null
          side_b_player_1: string
          side_b_player_2: string | null
          target_score: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          id: string
          score_a: number
          score_b: number
          session_id: string
          side_a_player_1: string
          side_a_player_2?: string | null
          side_b_player_1: string
          side_b_player_2?: string | null
          target_score?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          score_a?: number
          score_b?: number
          session_id?: string
          side_a_player_1?: string
          side_a_player_2?: string | null
          side_b_player_1?: string
          side_b_player_2?: string | null
          target_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "games_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_session_id_side_a_player_1_fkey"
            columns: ["session_id", "side_a_player_1"]
            isOneToOne: false
            referencedRelation: "session_players"
            referencedColumns: ["session_id", "player_id"]
          },
          {
            foreignKeyName: "games_session_id_side_a_player_2_fkey"
            columns: ["session_id", "side_a_player_2"]
            isOneToOne: false
            referencedRelation: "session_players"
            referencedColumns: ["session_id", "player_id"]
          },
          {
            foreignKeyName: "games_session_id_side_b_player_1_fkey"
            columns: ["session_id", "side_b_player_1"]
            isOneToOne: false
            referencedRelation: "session_players"
            referencedColumns: ["session_id", "player_id"]
          },
          {
            foreignKeyName: "games_session_id_side_b_player_2_fkey"
            columns: ["session_id", "side_b_player_2"]
            isOneToOne: false
            referencedRelation: "session_players"
            referencedColumns: ["session_id", "player_id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          created_by: string
          group_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          group_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          group_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          admin_bootstrapped: boolean
          created_at: string
          created_by: string
          id: string
          invite_expires_at: string
          invite_hash: string
          name: string
        }
        Insert: {
          admin_bootstrapped?: boolean
          created_at?: string
          created_by?: string
          id?: string
          invite_expires_at: string
          invite_hash: string
          name: string
        }
        Update: {
          admin_bootstrapped?: boolean
          created_at?: string
          created_by?: string
          id?: string
          invite_expires_at?: string
          invite_hash?: string
          name?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string
          display_name: string
          group_id: string
          id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string
          display_name: string
          group_id: string
          id?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string
          display_name?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      session_players: {
        Row: {
          created_at: string
          created_by: string
          group_id: string
          player_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          group_id: string
          player_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          group_id?: string
          player_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_players_group_id_player_id_fkey"
            columns: ["group_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["group_id", "id"]
          },
          {
            foreignKeyName: "session_players_group_id_session_id_fkey"
            columns: ["group_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["group_id", "id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          created_by: string
          ended_at: string | null
          group_id: string
          id: string
          session_date: string
          target_score: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          ended_at?: string | null
          group_id: string
          id?: string
          session_date?: string
          target_score?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          ended_at?: string | null
          group_id?: string
          id?: string
          session_date?: string
          target_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_group: { Args: { group_name: string }; Returns: Json }
      is_group_admin: { Args: { gid: string }; Returns: boolean }
      is_group_member: { Args: { gid: string }; Returns: boolean }
      join_group: { Args: { invite_code: string }; Returns: string }
      player_stats: {
        Args: { gid: string }
        Returns: {
          played: number
          player_id: string
          points_against: number
          points_for: number
          wins: number
        }[]
      }
      rotate_invite: { Args: { gid: string }; Returns: string }
      start_session: {
        Args: { attendees: string[]; gid: string; points?: number }
        Returns: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
