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
    const today = new Date().toISOString().slice(0, 10);

    // Get user stats
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id, confirmed_at");

    if (usersError) throw usersError;

    const totalUsers = usersData?.length ?? 0;
    const confirmedUsers = usersData?.filter(u => u.confirmed_at).length ?? 0;
    const adminCount = usersData?.filter(u => u.confirmed_at && u.is_admin).length ?? 0;

    // Get session stats
    const { data: sessionsData, error: sessionsError } = await supabase
      .from("sessions")
      .select("id");

    if (sessionsError) throw sessionsError;
    const activeSessions = sessionsData?.length ?? 0;

    // Get session status breakdown
    const { data: sessionStatusData, error: statusError } = await supabase
      .from("sessions")
      .select("status");

    if (statusError) throw statusError;
    const activeCount = sessionStatusData?.filter(s => s.status === "active").length ?? 0;
    const pendingCount = sessionStatusData?.filter(s => s.status === "pending").length ?? 0;
    const resolvedCount = sessionStatusData?.filter(s => s.status === "resolved").length ?? 0;

    // Get today's quota stats
    const { data: quotaData, error: quotaError } = await supabase
      .from("guest_daily_quota")
      .select("question_count")
      .eq("day", today);

    if (quotaError) throw quotaError;
    const totalGuestQuestions = quotaData?.reduce((sum, q) => sum + (q.question_count ?? 0), 0) ?? 0;
    const uniqueGuestCount = quotaData?.length ?? 0;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      users: {
        total: totalUsers,
        confirmed: confirmedUsers,
        unconfirmed: totalUsers - confirmedUsers,
        admins: adminCount,
      },
      sessions: {
        total: activeSessions,
        active: activeCount,
        pending: pendingCount,
        resolved: resolvedCount,
      },
      guestQuota: {
        day: today,
        uniqueGuests: uniqueGuestCount,
        totalQuestions: totalGuestQuestions,
      },
    });
  } catch (error) {
    console.error("Admin analytics fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
