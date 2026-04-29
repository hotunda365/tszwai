import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Hash password
    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");

    // Find user
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, confirmed_at")
      .eq("email", email)
      .eq("password", hashedPassword)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
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
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
