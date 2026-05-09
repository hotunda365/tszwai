import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export type SessionUser = {
  id: string;
  email: string;
  username: string | null;
  isAdmin: boolean;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;

  if (!sessionToken) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", sessionToken)
    .maybeSingle();

  if (sessionError || !session) {
    return null;
  }

  if (new Date(session.expires_at as string) < new Date()) {
    return null;
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, email, is_admin")
    .eq("id", session.user_id)
    .maybeSingle();

  if (userError || !user) {
    return null;
  }

  return {
    id: user.id as string,
    email: user.email as string,
    username: null,
    isAdmin: Boolean(user.is_admin),
  };
}
