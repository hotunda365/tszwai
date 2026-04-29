import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session_token")?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Find session and user
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("user_id, expires_at")
      .eq("token", sessionToken)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // Check if session expired
    if (new Date(session.expires_at) < new Date()) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    // Get user
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email")
      .eq("id", session.user_id)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
