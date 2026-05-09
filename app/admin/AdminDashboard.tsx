"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SessionRow } from "@/lib/supabase";
import {
  DEFAULT_OPENROUTER_MODEL,
  type OpenRouterModel,
} from "@/lib/openrouter-models";

type SessionStatus = "active" | "pending" | "resolved";
type TabType = "dashboard" | "users" | "sessions" | "quota" | "settings";

type SessionItem = {
  id: string;
  name: string;
  mood: string;
  updatedAt: string;
  status: SessionStatus;
  summary: string;
};

type UserItem = {
  id: string;
  email: string;
  is_admin: boolean;
  confirmed_at: string | null;
  created_at: string;
};

type QuotaItem = {
  guest_id: string;
  day: string;
  question_count: number;
  created_at: string;
  updated_at: string;
};

type Analytics = {
  timestamp: string;
  users: {
    total: number;
    confirmed: number;
    unconfirmed: number;
    admins: number;
  };
  sessions: {
    total: number;
    active: number;
    pending: number;
    resolved: number;
  };
  guestQuota: {
    day: string;
    uniqueGuests: number;
    totalQuestions: number;
  };
};

const statusMap: Record<SessionStatus, { label: string; style: string }> = {
  active: {
    label: "進行中",
    style: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  pending: {
    label: "待跟進",
    style: "bg-amber-100 text-amber-700 border-amber-200",
  },
  resolved: {
    label: "已完成",
    style: "bg-stone-100 text-stone-600 border-stone-200",
  },
};

const filterOptions: Array<{ key: SessionStatus | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "active", label: "進行中" },
  { key: "pending", label: "待跟進" },
  { key: "resolved", label: "已完成" },
];

function StatCard({ title, value, change }: { title: string; value: string; change: string }) {
  return (
    <article className="rounded-3xl border border-stone-200/70 bg-white/90 p-5 shadow-[0_10px_30px_rgba(91,80,61,0.08)]">
      <p className="text-sm text-stone-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-stone-800">{value}</p>
      <p className="mt-2 text-xs text-emerald-700">{change}</p>
    </article>
  );
}

function rowToSession(row: SessionRow): SessionItem {
  return {
    id: row.id,
    name: row.name,
    mood: row.mood,
    updatedAt: new Date(row.updated_at).toLocaleString("zh-TW", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    status: row.status,
    summary: row.summary,
  };
}

function TabButton({ isActive, label, onClick }: { isActive: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium rounded-2xl border transition ${
        isActive
          ? "border-stone-700 bg-stone-700 text-white"
          : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
      }`}
    >
      {label}
    </button>
  );
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [quotas, setQuotas] = useState<QuotaItem[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SessionStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [syncTime, setSyncTime] = useState("");
  const [model, setModel] = useState<OpenRouterModel>(DEFAULT_OPENROUTER_MODEL);
  const [savingModel, setSavingModel] = useState(false);
  const [modelMessage, setModelMessage] = useState("");
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "dashboard") {
        await Promise.all([loadAnalytics(), loadSessions()]);
      } else if (activeTab === "users") {
        await loadUsers();
      } else if (activeTab === "sessions") {
        await loadSessions();
      } else if (activeTab === "quota") {
        await loadQuota();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const res = await fetch("/api/admin/analytics");
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error("Failed to load analytics:", error);
    }
  };

  const loadSessions = async () => {
    try {
      const res = await fetch("/api/admin/sessions");
      if (res.ok) {
        const { sessions: data } = await res.json();
        setSessions(data.map((s: any) => ({
          id: s.id,
          name: s.name,
          mood: s.mood,
          updatedAt: new Date(s.updated_at).toLocaleString("zh-TW", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          status: s.status,
          summary: s.summary,
        })));
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
    setSyncTime(new Date().toLocaleTimeString("zh-TW"));
  };

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const { users: data } = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  };

  const loadQuota = async () => {
    try {
      const res = await fetch("/api/admin/quota");
      if (res.ok) {
        const { quotas: data } = await res.json();
        setQuotas(data);
      }
    } catch (error) {
      console.error("Failed to load quotas:", error);
    }
  };

  const updateUserAdmin = async (userId: string, isAdmin: boolean) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isAdmin }),
      });
      if (res.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error("Failed to update user:", error);
    }
  };

  const deactivateUser = async (userId: string) => {
    if (!confirm("確定要停用此帳戶嗎？")) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, deactivate: true }),
      });
      if (res.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error("Failed to deactivate user:", error);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm("確定要刪除此會話嗎？")) return;
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        await loadSessions();
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  const updateSessionStatus = async (sessionId: string, status: string) => {
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, status }),
      });
      if (res.ok) {
        await loadSessions();
      }
    } catch (error) {
      console.error("Failed to update session:", error);
    }
  };

  const resetQuota = async (guestId: string, day: string) => {
    if (!confirm("確定要重置此配額嗎？")) return;
    try {
      const res = await fetch("/api/admin/quota", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, day }),
      });
      if (res.ok) {
        await loadQuota();
      }
    } catch (error) {
      console.error("Failed to reset quota:", error);
    }
  };

  useEffect(() => {
    let ignore = false;

    if (activeTab === "settings") {
      fetch("/api/admin/model")
        .then(async (response) => {
          const json = await response.json();
          if (ignore) return;
          if (response.ok && typeof json.model === "string") {
            setModel(json.model as OpenRouterModel);
          }
          if (response.ok && Array.isArray(json.models)) {
            setAvailableModels(json.models);
          }
          setModelsLoading(false);
        })
        .catch(() => {
          if (!ignore) {
            setModel(DEFAULT_OPENROUTER_MODEL);
            setModelsLoading(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [activeTab]);

  const saveModel = async () => {
    setSavingModel(true);
    setModelMessage("");

    try {
      const response = await fetch("/api/admin/model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });

      if (!response.ok) {
        setModelMessage("儲存失敗，請稍後再試");
        return;
      }

      setModelMessage("已更新模型設定");
    } catch {
      setModelMessage("儲存失敗，請檢查網路連線");
    } finally {
      setSavingModel(false);
    }
  };

  const stats = useMemo(() => ({
    total: sessions.length,
    active: sessions.filter((s) => s.status === "active").length,
    pending: sessions.filter((s) => s.status === "pending").length,
  }), [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((item) => {
      const matchesFilter = filter === "all" || item.status === filter;
      const matchesQuery =
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.summary.toLowerCase().includes(query.toLowerCase()) ||
        item.id.toLowerCase().includes(query.toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [sessions, filter, query]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_5%_0%,#fff4dd_0%,#f3f0e6_42%,#eaf2e9_100%)] px-3 py-4 sm:px-4 sm:py-6 md:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-stone-200/70 bg-white/70 px-4 py-4 backdrop-blur sm:mb-6 sm:px-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">tszwai.com/admin</p>
            <h1 className="mt-1 text-xl font-semibold text-stone-800 sm:text-2xl">後台管理中心</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("users")}
              className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-100 sm:text-sm"
            >
              帳戶管理
            </button>
            <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 sm:text-sm">
              {syncTime ? `上次同步：${syncTime}` : "同步中…"}
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2 rounded-3xl border border-stone-200/70 bg-white/70 p-2 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabButton isActive={activeTab === "dashboard"} label="儀表板" onClick={() => setActiveTab("dashboard")} />
          <TabButton isActive={activeTab === "users"} label="帳戶管理" onClick={() => setActiveTab("users")} />
          <TabButton isActive={activeTab === "sessions"} label="會話管理" onClick={() => setActiveTab("sessions")} />
          <TabButton isActive={activeTab === "quota"} label="配額管理" onClick={() => setActiveTab("quota")} />
          <TabButton isActive={activeTab === "settings"} label="設定" onClick={() => setActiveTab("settings")} />
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <>
            <section className="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:gap-4 md:grid-cols-3">
              <StatCard title="總使用者" value={analytics?.users.total.toString() ?? "…"} change={`${analytics?.users.confirmed ?? 0} 已驗證`} />
              <StatCard title="總會話數" value={analytics?.sessions.total.toString() ?? "…"} change={`${analytics?.sessions.active ?? 0} 進行中`} />
              <StatCard title="今日來客" value={analytics?.guestQuota.uniqueGuests.toString() ?? "…"} change={`${analytics?.guestQuota.totalQuestions ?? 0} 提問`} />
            </section>

            <section className="rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[0_10px_30px_rgba(91,80,61,0.08)] sm:p-5">
              <h2 className="mb-4 text-lg font-semibold text-stone-800">系統統計</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-stone-200 p-4">
                  <p className="text-sm text-stone-600">會話狀態分佈</p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-700">進行中</span>
                      <span className="font-medium text-emerald-700">{analytics?.sessions.active ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-700">待跟進</span>
                      <span className="font-medium text-amber-700">{analytics?.sessions.pending ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-700">已完成</span>
                      <span className="font-medium text-stone-600">{analytics?.sessions.resolved ?? 0}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-stone-200 p-4">
                  <p className="text-sm text-stone-600">使用者狀態</p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-700">已驗證</span>
                      <span className="font-medium text-emerald-700">{analytics?.users.confirmed ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-700">未驗證</span>
                      <span className="font-medium text-amber-700">{analytics?.users.unconfirmed ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-700">管理員</span>
                      <span className="font-medium text-stone-700">{analytics?.users.admins ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <section className="rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[0_10px_30px_rgba(91,80,61,0.08)] sm:p-5">
            <h2 className="mb-4 text-lg font-semibold text-stone-800">帳戶管理</h2>
            {loading ? (
              <div className="text-center text-sm text-stone-500">載入中…</div>
            ) : users.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
                沒有使用者
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50">
                    <tr>
                      <th className="px-4 py-3 font-medium text-stone-600">信箱</th>
                      <th className="px-4 py-3 font-medium text-stone-600">狀態</th>
                      <th className="px-4 py-3 font-medium text-stone-600">建立日期</th>
                      <th className="px-4 py-3 font-medium text-stone-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-t border-stone-100">
                        <td className="px-4 py-3 text-stone-700">{user.email}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                            user.confirmed_at ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {user.confirmed_at ? "已驗證" : "未驗證"}
                          </span>
                          {user.is_admin && <span className="ml-2 inline-flex rounded-full bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 border border-purple-200">管理員</span>}
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {new Date(user.created_at).toLocaleDateString("zh-TW")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateUserAdmin(user.id, !user.is_admin)}
                              className="text-xs px-2 py-1 rounded border border-stone-300 text-stone-700 hover:bg-stone-100 transition"
                            >
                              {user.is_admin ? "取消管理" : "設為管理"}
                            </button>
                            <button
                              onClick={() => deactivateUser(user.id)}
                              className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 transition"
                            >
                              停用
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Sessions Tab */}
        {activeTab === "sessions" && (
          <section className="rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[0_10px_30px_rgba(91,80,61,0.08)] sm:p-5">
            <h2 className="mb-4 text-lg font-semibold text-stone-800">會話管理</h2>
            <div className="mb-4">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋 ID、使用者或摘要..."
                className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700 outline-none focus:ring-2 ring-amber-200"
              />
            </div>

            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filterOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setFilter(option.key)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
                    filter === option.key
                      ? "border-stone-700 bg-stone-700 text-white"
                      : "border-stone-200 bg-white text-stone-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center text-sm text-stone-500">載入中…</div>
            ) : filteredSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
                找不到符合條件的會話
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50">
                    <tr>
                      <th className="px-4 py-3 font-medium text-stone-600">會話 ID</th>
                      <th className="px-4 py-3 font-medium text-stone-600">使用者</th>
                      <th className="px-4 py-3 font-medium text-stone-600">情緒</th>
                      <th className="px-4 py-3 font-medium text-stone-600">狀態</th>
                      <th className="px-4 py-3 font-medium text-stone-600">更新時間</th>
                      <th className="px-4 py-3 font-medium text-stone-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((session) => (
                      <tr key={session.id} className="border-t border-stone-100">
                        <td className="px-4 py-3 text-stone-700 font-mono text-xs">{session.id.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-stone-700">{session.name}</td>
                        <td className="px-4 py-3 text-stone-600">{session.mood}</td>
                        <td className="px-4 py-3">
                          <select
                            value={session.status}
                            onChange={(e) => updateSessionStatus(session.id, e.target.value)}
                            className={`text-xs px-2 py-1 rounded border rounded-lg outline-none transition ${
                              session.status === "active"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : session.status === "pending"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-stone-50 text-stone-600 border-stone-200"
                            }`}
                          >
                            <option value="active">進行中</option>
                            <option value="pending">待跟進</option>
                            <option value="resolved">已完成</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-stone-600 text-xs">{session.updatedAt}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => deleteSession(session.id)}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 transition"
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Quota Tab */}
        {activeTab === "quota" && (
          <section className="rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[0_10px_30px_rgba(91,80,61,0.08)] sm:p-5">
            <h2 className="mb-4 text-lg font-semibold text-stone-800">配額管理</h2>
            {loading ? (
              <div className="text-center text-sm text-stone-500">載入中…</div>
            ) : quotas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
                今天沒有訪客
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50">
                    <tr>
                      <th className="px-4 py-3 font-medium text-stone-600">訪客 ID</th>
                      <th className="px-4 py-3 font-medium text-stone-600">日期</th>
                      <th className="px-4 py-3 font-medium text-stone-600">提問次數</th>
                      <th className="px-4 py-3 font-medium text-stone-600">限制 (5)</th>
                      <th className="px-4 py-3 font-medium text-stone-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotas.map((quota) => (
                      <tr key={`${quota.guest_id}-${quota.day}`} className="border-t border-stone-100">
                        <td className="px-4 py-3 text-stone-700 font-mono text-xs">{quota.guest_id.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-stone-700">{new Date(quota.day).toLocaleDateString("zh-TW")}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            quota.question_count >= 5
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}>
                            {quota.question_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-stone-600">5</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => resetQuota(quota.guest_id, quota.day)}
                            className="text-xs px-2 py-1 rounded border border-stone-300 text-stone-700 hover:bg-stone-100 transition"
                          >
                            重置
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <section className="rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[0_10px_30px_rgba(91,80,61,0.08)] sm:p-5">
            <h2 className="mb-4 text-lg font-semibold text-stone-800">系統設定</h2>
            <div className="max-w-md">
              <label htmlFor="model" className="mb-2 flex items-center gap-2 text-sm font-medium text-stone-700">
                OpenRouter 模型
                {modelsLoading && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
                    載入中
                  </span>
                )}
              </label>
              <select
                id="model"
                value={model}
                disabled={modelsLoading}
                onChange={(e) => setModel(e.target.value as OpenRouterModel)}
                className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700 outline-none focus:ring-2 ring-amber-200 disabled:opacity-60"
              >
                {modelsLoading ? (
                  <option value={model}>{model}</option>
                ) : availableModels.length > 0 ? (
                  availableModels.map(({ id, name }) => (
                    <option key={id} value={id}>{name}</option>
                  ))
                ) : (
                  <option value={model}>{model}（無法載入清單）</option>
                )}
              </select>

              <button
                onClick={saveModel}
                disabled={savingModel}
                className="mt-4 rounded-2xl border border-stone-700 bg-stone-700 px-4 py-2.5 text-sm text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {savingModel ? "儲存中…" : "儲存設定"}
              </button>
              {modelMessage && <p className="mt-2 text-sm text-stone-600">{modelMessage}</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

