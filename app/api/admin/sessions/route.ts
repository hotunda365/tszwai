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
    const { data: sessions, error } = await supabase
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Admin sessions fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: { sessionId?: string } = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", sessionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Session deleted successfully" });
  } catch (error) {
    console.error("Admin session delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: { sessionId?: string; status?: string } = await request.json();
    const { sessionId, status } = body;

    if (!sessionId || !status) {
      return NextResponse.json({ error: "sessionId and status required" }, { status: 400 });
    }

    if (!["active", "pending", "resolved"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("sessions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Session updated successfully" });
  } catch (error) {
    console.error("Admin session update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
