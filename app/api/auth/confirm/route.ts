import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "Confirmation token required" }, { status: 400 });
    }

    // Find user with token
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, token_expiry")
      .eq("confirmation_token", token)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    // Check token expiry
    if (new Date(user.token_expiry) < new Date()) {
      return NextResponse.json({ error: "Token has expired" }, { status: 400 });
    }

    // Confirm email
    const { error: updateError } = await supabase
      .from("users")
      .update({
        confirmed_at: new Date().toISOString(),
        confirmation_token: null,
        token_expiry: null,
      })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "Email confirmed successfully",
      email: user.email,
    });
  } catch (error) {
    console.error("Confirmation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
