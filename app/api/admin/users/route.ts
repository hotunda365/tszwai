import { NextRequest, NextResponse } from "next/server";
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

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: { userId?: string; isAdmin?: boolean; deactivate?: boolean } = await request.json();
    const { userId, isAdmin, deactivate } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // Prevent deactivating self
    if (deactivate && user.id === userId) {
      return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const updates: Record<string, unknown> = {};
    if (typeof isAdmin === "boolean") updates.is_admin = isAdmin;
    if (deactivate) updates.confirmed_at = null;

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
