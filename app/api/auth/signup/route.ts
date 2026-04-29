import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }

    // Generate confirmation token
    const confirmationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Hash password
    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");

    // Create user
    const { data: newUser, error } = await supabase
      .from("users")
      .insert({
        email,
        password: hashedPassword,
        confirmation_token: confirmationToken,
        token_expiry: tokenExpiry.toISOString(),
        confirmed_at: null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // TODO: Send confirmation email with confirmationToken
    console.log(`Confirmation link: ${process.env.NEXT_PUBLIC_APP_URL}/confirm-email?token=${confirmationToken}`);

    return NextResponse.json({
      message: "User created. Check your email to confirm.",
      userId: newUser.id,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
