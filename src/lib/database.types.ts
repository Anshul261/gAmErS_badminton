export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
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
      players: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string
          display_name: string
          id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string
          display_name: string
          id?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          user_id?: string
        }
        Relationships: []
      }
      session_players: {
        Row: {
          created_at: string
          created_by: string
          player_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          player_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          player_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          created_by: string
          ended_at: string | null
          id: string
          session_date: string
          start_time: string | null
          target_score: number
          venue_name: string | null
          venue_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          ended_at?: string | null
          id?: string
          session_date?: string
          start_time?: string | null
          target_score?: number
          venue_name?: string | null
          venue_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          ended_at?: string | null
          id?: string
          session_date?: string
          start_time?: string | null
          target_score?: number
          venue_name?: string | null
          venue_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      game_values: {
        Args: never
        Returns: {
          game_id: string
          player_id: string
          value: number
        }[]
      }
      player_stats: {
        Args: never
        Returns: {
          doubles: number
          losses: number
          pair: number
          played: number
          player_id: string
          points_against: number
          points_for: number
          score: number
          singles: number
          solo: number
          wins: number
        }[]
      }
      session_game_values: {
        Args: { sid: string }
        Returns: {
          game_id: string
          player_id: string
          value: number
        }[]
      }
      start_session: {
        Args: {
          at_time?: string
          attendees?: string[]
          map_url?: string
          on_date?: string
          points?: number
          venue?: string
        }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

