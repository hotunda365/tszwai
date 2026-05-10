import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUser } from "@/lib/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { buildConfirmationLink, sendConfirmationEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createServerSupabaseClient();
    const { data: users, error } = await supabase
      .from("users")
      .select("id, email, is_admin, confirmed_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Admin users fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: {
      email?: string;
      password?: string;
      isAdmin?: boolean;
      confirmed?: boolean;
    } = await request.json();

    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json({ error: "email and password required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const confirmationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
    const confirmed = Boolean(body.confirmed);

    const { data: createdUser, error } = await supabase
      .from("users")
      .insert({
        email,
        password: hashedPassword,
        is_admin: Boolean(body.isAdmin),
        confirmed_at: confirmed ? new Date().toISOString() : null,
        confirmation_token: confirmed ? null : confirmationToken,
        token_expiry: confirmed ? null : tokenExpiry,
      })
      .select("id, email, is_admin, confirmed_at, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!confirmed) {
      const emailResult = await sendConfirmationEmail({
        to: email,
        token: confirmationToken,
      });

      if (!emailResult.ok) {
        console.error("Failed to send admin-created user confirmation email:", emailResult.error);
        console.log(`Confirmation link (fallback): ${buildConfirmationLink(confirmationToken)}`);

        return NextResponse.json(
          {
            message: "User created, but confirmation email failed to send",
            user: createdUser,
            emailSent: false,
          },
          { status: 201 }
        );
      }
    }

    return NextResponse.json({ message: "User created successfully", user: createdUser, emailSent: true }, { status: 201 });
  } catch (error) {
    console.error("Admin user create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: {
      userId?: string;
      email?: string;
      password?: string;
      isAdmin?: boolean;
      deactivate?: boolean;
      confirmEmail?: boolean;
      resendConfirmation?: boolean;
    } = await request.json();
    const { userId, email, password, isAdmin, deactivate, confirmEmail, resendConfirmation } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    if (user.id === userId && (deactivate || isAdmin === false)) {
      return NextResponse.json({ error: "Cannot remove your own admin access" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    if (resendConfirmation) {
      const { data: targetUser, error: targetError } = await supabase
        .from("users")
        .select("id, email, confirmed_at")
        .eq("id", userId)
        .single();

      if (targetError || !targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      if (targetUser.confirmed_at) {
        return NextResponse.json({ error: "User is already confirmed" }, { status: 400 });
      }

      const confirmationToken = crypto.randomBytes(32).toString("hex");
      const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { error: tokenUpdateError } = await supabase
        .from("users")
        .update({
          confirmation_token: confirmationToken,
          token_expiry: tokenExpiry,
        })
        .eq("id", userId);

      if (tokenUpdateError) {
        return NextResponse.json({ error: tokenUpdateError.message }, { status: 500 });
      }

      const emailResult = await sendConfirmationEmail({
        to: targetUser.email,
        token: confirmationToken,
        mode: "resend",
      });

      if (!emailResult.ok) {
        const confirmationLink = buildConfirmationLink(confirmationToken);
        console.error("Failed to resend admin confirmation email:", emailResult.error);
        console.log(`Confirmation link (fallback): ${confirmationLink}`);
        return NextResponse.json(
          {
            error: "Failed to send confirmation email",
            providerError: emailResult.error,
            confirmationLink,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: "Confirmation email resent successfully" });
    }

    const updates: Record<string, unknown> = {};
    if (typeof isAdmin === "boolean") updates.is_admin = isAdmin;
    if (deactivate) updates.confirmed_at = null;
    if (typeof confirmEmail === "boolean") {
      if (confirmEmail) {
        updates.confirmed_at = new Date().toISOString();
        updates.confirmation_token = null;
        updates.token_expiry = null;
      } else {
        updates.confirmed_at = null;
      }
    }
    if (typeof email === "string" && email.trim()) {
      updates.email = email.trim().toLowerCase();
    }
    if (typeof password === "string" && password.length > 0) {
      updates.password = crypto.createHash("sha256").update(password).digest("hex");
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Admin user update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: { userId?: string } = await request.json();
    const userId = body.userId;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    if (user.id === userId) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("users").delete().eq("id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Admin user delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
