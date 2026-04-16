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
      agent_runs: {
        Row: {
          id: string;
          ngo_user_id: string | null;
          run_at: string | null;
          total_issues: number | null;
          total_assigned: number | null;
          alerts: Json | null;
          agent_logs: Json | null;
        }
        Insert: {
          id?: string;
          ngo_user_id?: string | null;
          run_at?: string | null;
          total_issues?: number | null;
          total_assigned?: number | null;
          alerts?: Json | null;
          agent_logs?: Json | null;
        }
        Update: {
          id?: string;
          ngo_user_id?: string | null;
          run_at?: string | null;
          total_issues?: number | null;
          total_assigned?: number | null;
          alerts?: Json | null;
          agent_logs?: Json | null;
        }
        Relationships: []
      }
      run_agent_reports: {
        Row: {
          id: string;
          ngo_user_id: string;
          title: string;
          raw_input: string;
          source_type: "manual" | "files";
          source_files: Json;
          processed_output: Json | null;
          pipeline_result: Json | null;
          created_at: string;
        }
        Insert: {
          id?: string;
          ngo_user_id: string;
          title: string;
          raw_input: string;
          source_type: "manual" | "files";
          source_files?: Json;
          processed_output?: Json | null;
          pipeline_result?: Json | null;
          created_at?: string;
        }
        Update: {
          id?: string;
          ngo_user_id?: string;
          title?: string;
          raw_input?: string;
          source_type?: "manual" | "files";
          source_files?: Json;
          processed_output?: Json | null;
          pipeline_result?: Json | null;
          created_at?: string;
        }
        Relationships: []
      }
      chatbot_synced_reports: {
        Row: {
          id: string;
          ngo_user_id: string;
          source_type: string;
          report_title: string;
          report_summary: string;
          report_count: number;
          knowledge_chunks: number;
          report_data: Json;
          created_at: string;
        }
        Insert: {
          id?: string;
          ngo_user_id: string;
          source_type?: string;
          report_title: string;
          report_summary: string;
          report_count?: number;
          knowledge_chunks?: number;
          report_data?: Json;
          created_at?: string;
        }
        Update: {
          id?: string;
          ngo_user_id?: string;
          source_type?: string;
          report_title?: string;
          report_summary?: string;
          report_count?: number;
          knowledge_chunks?: number;
          report_data?: Json;
          created_at?: string;
        }
        Relationships: []
      }
      auth_events: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          event_type: "login" | "signup";
          logged_at: string | null;
          metadata: Json | null;
        }
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          event_type: "login" | "signup";
          logged_at?: string | null;
          metadata?: Json | null;
        }
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          event_type?: "login" | "signup";
          logged_at?: string | null;
          metadata?: Json | null;
        }
        Relationships: []
      }
      issues: {
        Row: {
          id: string;
          ngo_user_id: string | null;
          issue_summary: string | null;
          sector: string | null;
          location: string | null;
          affected_count: number | null;
          priority_score: number | null;
          urgency_score: number | null;
          status: string | null;
          assigned_volunteer_id: string | null;
          assignment_reason: string | null;
          created_at: string | null;
        }
        Insert: {
          id?: string;
          ngo_user_id?: string | null;
          issue_summary?: string | null;
          sector?: string | null;
          location?: string | null;
          affected_count?: number | null;
          priority_score?: number | null;
          urgency_score?: number | null;
          status?: string | null;
          assigned_volunteer_id?: string | null;
          assignment_reason?: string | null;
          created_at?: string | null;
        }
        Update: {
          id?: string;
          ngo_user_id?: string | null;
          issue_summary?: string | null;
          sector?: string | null;
          location?: string | null;
          affected_count?: number | null;
          priority_score?: number | null;
          urgency_score?: number | null;
          status?: string | null;
          assigned_volunteer_id?: string | null;
          assignment_reason?: string | null;
          created_at?: string | null;
        }
        Relationships: [
          {
            foreignKeyName: "issues_assigned_volunteer_id_fkey";
            columns: ["assigned_volunteer_id"];
            isOneToOne: false;
            referencedRelation: "volunteers";
            referencedColumns: ["id"];
          },
        ]
      }
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          display_name: string | null;
          user_type: "individual" | "ngo" | "sponsor";
          role: "individual" | "ngo" | "sponsor";
          location: string | null;
          contact_info: string | null;
          contact_number: string | null;
          ngo_type: string | null;
          sponsorship_domains: string[] | null;
          verification_status: string | null;
          created_at: string | null;
          updated_at: string | null;
        }
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          display_name?: string | null;
          user_type: "individual" | "ngo" | "sponsor";
          role?: "individual" | "ngo" | "sponsor";
          location?: string | null;
          contact_info?: string | null;
          contact_number?: string | null;
          ngo_type?: string | null;
          sponsorship_domains?: string[] | null;
          verification_status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        }
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          display_name?: string | null;
          user_type?: "individual" | "ngo" | "sponsor";
          role?: "individual" | "ngo" | "sponsor";
          location?: string | null;
          contact_info?: string | null;
          contact_number?: string | null;
          ngo_type?: string | null;
          sponsorship_domains?: string[] | null;
          verification_status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        }
        Relationships: []
      }
      ngo_profiles: {
        Row: {
          user_id: string;
          ngo_name: string | null;
          description: string | null;
          sector: string | null;
          location: string | null;
          contact_info: string | null;
          address: string | null;
          email: string | null;
          bank_details: string | null;
          image_url: string | null;
          work_area: string | null;
          past_works: string | null;
          verification_status: string | null;
          created_at: string | null;
          updated_at: string | null;
        }
        Insert: {
          user_id: string;
          ngo_name?: string | null;
          description?: string | null;
          sector?: string | null;
          location?: string | null;
          contact_info?: string | null;
          address?: string | null;
          email?: string | null;
          bank_details?: string | null;
          image_url?: string | null;
          work_area?: string | null;
          past_works?: string | null;
          verification_status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        }
        Update: {
          user_id?: string;
          ngo_name?: string | null;
          description?: string | null;
          sector?: string | null;
          location?: string | null;
          contact_info?: string | null;
          address?: string | null;
          email?: string | null;
          bank_details?: string | null;
          image_url?: string | null;
          work_area?: string | null;
          past_works?: string | null;
          verification_status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        }
        Relationships: []
      }
      individual_profiles: {
        Row: {
          user_id: string;
          full_name: string | null;
          skills: string[] | null;
          interests: string[] | null;
          location: string | null;
          availability: string | null;
          contact_info: string | null;
          created_at: string | null;
          updated_at: string | null;
        }
        Insert: {
          user_id: string;
          full_name?: string | null;
          skills?: string[] | null;
          interests?: string[] | null;
          location?: string | null;
          availability?: string | null;
          contact_info?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        }
        Update: {
          user_id?: string;
          full_name?: string | null;
          skills?: string[] | null;
          interests?: string[] | null;
          location?: string | null;
          availability?: string | null;
          contact_info?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        }
        Relationships: []
      }
      ngo_requests: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string;
          category: string;
          urgency: string;
          location: string | null;
          volunteers_needed: number | null;
          funding_amount: number | null;
          skills_needed: string[] | null;
          deadline: string | null;
          contact_method: string | null;
          status: string;
          created_at: string;
          updated_at: string | null;
        }
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description: string;
          category: string;
          urgency: string;
          location?: string | null;
          volunteers_needed?: number | null;
          funding_amount?: number | null;
          skills_needed?: string[] | null;
          deadline?: string | null;
          contact_method?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        }
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string;
          category?: string;
          urgency?: string;
          location?: string | null;
          volunteers_needed?: number | null;
          funding_amount?: number | null;
          skills_needed?: string[] | null;
          deadline?: string | null;
          contact_method?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        }
        Relationships: []
      }
      volunteer_offers: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string;
          skills: string[] | null;
          availability: string | null;
          preferred_causes: string[] | null;
          location: string | null;
          mode: "remote" | "on_ground" | "hybrid" | null;
          contact_method: string | null;
          status: string;
          created_at: string;
          updated_at: string | null;
        }
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description: string;
          skills?: string[] | null;
          availability?: string | null;
          preferred_causes?: string[] | null;
          location?: string | null;
          mode?: "remote" | "on_ground" | "hybrid" | null;
          contact_method?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        }
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string;
          skills?: string[] | null;
          availability?: string | null;
          preferred_causes?: string[] | null;
          location?: string | null;
          mode?: "remote" | "on_ground" | "hybrid" | null;
          contact_method?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        }
        Relationships: []
      }
      connections_or_responses: {
        Row: {
          id: string;
          request_id: string | null;
          offer_id: string | null;
          sender_id: string;
          receiver_id: string;
          message: string;
          status: string;
          created_at: string;
          updated_at: string | null;
        }
        Insert: {
          id?: string;
          request_id?: string | null;
          offer_id?: string | null;
          sender_id: string;
          receiver_id: string;
          message: string;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        }
        Update: {
          id?: string;
          request_id?: string | null;
          offer_id?: string | null;
          sender_id?: string;
          receiver_id?: string;
          message?: string;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          id: string;
          post_type: "ngo_request" | "volunteer_offer";
          author_id: string;
          content: string;
          request_id: string | null;
          offer_id: string | null;
          created_at: string;
          updated_at: string | null;
        }
        Insert: {
          id?: string;
          post_type: "ngo_request" | "volunteer_offer";
          author_id: string;
          content: string;
          request_id?: string | null;
          offer_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        }
        Update: {
          id?: string;
          post_type?: "ngo_request" | "volunteer_offer";
          author_id?: string;
          content?: string;
          request_id?: string | null;
          offer_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        }
        Relationships: []
      }
      saved_posts: {
        Row: {
          id: string;
          user_id: string;
          post_type: "ngo_request" | "volunteer_offer";
          request_id: string | null;
          offer_id: string | null;
          created_at: string;
        }
        Insert: {
          id?: string;
          user_id: string;
          post_type: "ngo_request" | "volunteer_offer";
          request_id?: string | null;
          offer_id?: string | null;
          created_at?: string;
        }
        Update: {
          id?: string;
          user_id?: string;
          post_type?: "ngo_request" | "volunteer_offer";
          request_id?: string | null;
          offer_id?: string | null;
          created_at?: string;
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string;
          user_id: string;
          actor_id: string | null;
          event_type: string;
          title: string;
          body: string;
          is_read: boolean;
          related_request_id: string | null;
          related_offer_id: string | null;
          related_connection_id: string | null;
          related_comment_id: string | null;
          created_at: string;
        }
        Insert: {
          id?: string;
          user_id: string;
          actor_id?: string | null;
          event_type: string;
          title: string;
          body: string;
          is_read?: boolean;
          related_request_id?: string | null;
          related_offer_id?: string | null;
          related_connection_id?: string | null;
          related_comment_id?: string | null;
          created_at?: string;
        }
        Update: {
          id?: string;
          user_id?: string;
          actor_id?: string | null;
          event_type?: string;
          title?: string;
          body?: string;
          is_read?: boolean;
          related_request_id?: string | null;
          related_offer_id?: string | null;
          related_connection_id?: string | null;
          related_comment_id?: string | null;
          created_at?: string;
        }
        Relationships: []
      }
      volunteers: {
        Row: {
          id: string;
          ngo_user_id: string | null;
          name: string;
          email: string | null;
          phone: string | null;
          skills: string[] | null;
          zone: string | null;
          availability_hours_per_week: number | null;
          is_active: boolean | null;
          created_at: string | null;
        }
        Insert: {
          id?: string;
          ngo_user_id?: string | null;
          name: string;
          email?: string | null;
          phone?: string | null;
          skills?: string[] | null;
          zone?: string | null;
          availability_hours_per_week?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
        }
        Update: {
          id?: string;
          ngo_user_id?: string | null;
          name?: string;
          email?: string | null;
          phone?: string | null;
          skills?: string[] | null;
          zone?: string | null;
          availability_hours_per_week?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
