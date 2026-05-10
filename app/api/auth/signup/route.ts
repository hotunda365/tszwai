import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { buildConfirmationLink, sendConfirmationEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body: { email?: string; password?: string; username?: string } = await request.json();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const username = body.username?.trim() || null;

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
        username,
        password: hashedPassword,
        is_admin: false,
        confirmation_token: confirmationToken,
        token_expiry: tokenExpiry.toISOString(),
        confirmed_at: null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const emailResult = await sendConfirmationEmail({
      to: email,
      token: confirmationToken,
    });

    if (!emailResult.ok) {
      console.error("Failed to send signup confirmation email:", emailResult.error);
      console.log(`Confirmation link (fallback): ${buildConfirmationLink(confirmationToken)}`);

      return NextResponse.json(
        {
          message: "User created, but confirmation email failed to send. Please try resend.",
          userId: newUser.id,
          emailSent: false,
        },
        { status: 201 }
      );
    }

    return NextResponse.json({
      message: "User created. Check your email to confirm.",
      userId: newUser.id,
      emailSent: true,
    });
  } catch (error) {
    console.error("Signup error:", error);
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
