import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { buildConfirmationLink, sendConfirmationEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body: { email?: string } = await request.json();
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, confirmed_at")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return generic success to avoid exposing whether the email exists.
    if (!user) {
      return NextResponse.json({ message: "If account exists, confirmation email has been resent" });
    }

    if (user.confirmed_at) {
      return NextResponse.json({ message: "Email already confirmed" });
    }

    const confirmationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from("users")
      .update({
        confirmation_token: confirmationToken,
        token_expiry: tokenExpiry,
      })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const emailResult = await sendConfirmationEmail({
      to: email,
      token: confirmationToken,
      mode: "resend",
    });

    if (!emailResult.ok) {
      console.error("Failed to resend confirmation email:", emailResult.error);
      console.log(`Confirmation link (fallback): ${buildConfirmationLink(confirmationToken)}`);
      return NextResponse.json({ error: "Failed to send confirmation email" }, { status: 500 });
    }

    return NextResponse.json({ message: "Confirmation email resent" });
  } catch (error) {
    console.error("Resend confirmation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
