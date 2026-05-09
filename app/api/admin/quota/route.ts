import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const day = searchParams.get("day");

    const supabase = createServerSupabaseClient();

    let query = supabase.from("guest_daily_quota").select("*");

    if (day) {
      query = query.eq("day", day);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      query = query.eq("day", today);
    }

    const { data: quotas, error } = await query.order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ quotas });
  } catch (error) {
    console.error("Admin quota fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: { guestId?: string; day?: string } = await request.json();
    const { guestId, day } = body;

    if (!guestId || !day) {
      return NextResponse.json({ error: "guestId and day required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("guest_daily_quota")
      .delete()
      .eq("guest_id", guestId)
      .eq("day", day);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Quota reset successfully" });
  } catch (error) {
    console.error("Admin quota delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
