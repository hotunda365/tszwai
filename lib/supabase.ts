import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type MessageRow = {
  id: number;
  session_id: string;
  sender: "ai" | "user";
  text: string;
  created_at: string;
};

export type SessionRow = {
  id: string;
  name: string;
  mood: string;
  status: "active" | "pending" | "resolved";
  summary: string;
  updated_at: string;
};

export type UserRow = {
  id: string;
  email: string;
  password: string;
  confirmed_at: string | null;
  confirmation_token: string | null;
  token_expiry: string | null;
  created_at: string;
};

export type SessionTokenRow = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
};
