import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUser } from "@/lib/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createServerSupabaseClient();
    const { data: users, error } = await supabase
      .from("users")
      .select("id, email, username, is_admin, confirmed_at, created_at")
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
      username?: string;
      password?: string;
      isAdmin?: boolean;
      confirmed?: boolean;
    } = await request.json();

    const email = body.email?.trim().toLowerCase();
    const username = body.username?.trim() || null;
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
        username,
        password: hashedPassword,
        is_admin: Boolean(body.isAdmin),
        confirmed_at: confirmed ? new Date().toISOString() : null,
        confirmation_token: confirmed ? null : confirmationToken,
        token_expiry: confirmed ? null : tokenExpiry,
      })
      .select("id, email, username, is_admin, confirmed_at, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!confirmed) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      console.log(`Confirmation link: ${appUrl}/confirm-email?token=${confirmationToken}`);
    }

    return NextResponse.json({ message: "User created successfully", user: createdUser }, { status: 201 });
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
      username?: string | null;
      password?: string;
      isAdmin?: boolean;
      deactivate?: boolean;
      confirmEmail?: boolean;
    } = await request.json();
    const { userId, email, username, password, isAdmin, deactivate, confirmEmail } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    if (user.id === userId && (deactivate || isAdmin === false)) {
      return NextResponse.json({ error: "Cannot remove your own admin access" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

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
    if (typeof username === "string") {
      const trimmed = username.trim();
      updates.username = trimmed.length > 0 ? trimmed : null;
    }
    if (username === null) {
      updates.username = null;
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
