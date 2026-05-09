import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body: { email?: string; password?: string } = await request.json();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Hash password
    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");

    // Find user
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, username, confirmed_at, is_admin, password")
      .eq("email", email)
      .eq("password", hashedPassword)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: "Invalid Credentials" }, { status: 401 });
    }

    if (!user.confirmed_at) {
      return NextResponse.json(
        { error: "Please confirm your email first" },
        { status: 403 }
      );
    }

    // Create session token
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await supabase.from("sessions").insert({
      user_id: user.id,
      token: sessionToken,
      expires_at: sessionExpiry.toISOString(),
    });

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set("session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    });

    return NextResponse.json({
      message: "Login successful",
      userId: user.id,
      email: user.email,
      username: user.username,
      isAdmin: Boolean(user.is_admin),
    });
  } catch (error) {
    console.error("Login error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: message === "Missing Supabase server configuration: SUPABASE_SERVICE_ROLE_KEY is required"
          ? message
          : "Internal server error",
      },
      { status: 500 }
    );
  }
}
