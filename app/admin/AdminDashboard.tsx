"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SessionRow } from "@/lib/supabase";
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODELS,
  type OpenRouterModel,
} from "@/lib/openrouter-models";

type SessionStatus = "active" | "pending" | "resolved";

type SessionItem = {
  id: string;
  name: string;
  mood: string;
  updatedAt: string;
  status: SessionStatus;
  summary: string;
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

export default function AdminDashboard() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SessionStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [syncTime, setSyncTime] = useState("");
  const [model, setModel] = useState<OpenRouterModel>(DEFAULT_OPENROUTER_MODEL);
  const [savingModel, setSavingModel] = useState(false);
  const [modelMessage, setModelMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    supabase
      .from("sessions")
      .select("*")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (ignore) return;
        if (!error && data) setSessions(data.map(rowToSession));
        setSyncTime(new Date().toLocaleTimeString("zh-TW"));
        setLoading(false);
      });

    const channel = supabase
      .channel("sessions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => {
        supabase
          .from("sessions")
          .select("*")
          .order("updated_at", { ascending: false })
          .then(({ data, error }) => {
            if (!error && data) {
              setSessions(data.map(rowToSession));
              setSyncTime(new Date().toLocaleTimeString("zh-TW"));
            }
          });
      })
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    fetch("/api/admin/model")
      .then(async (response) => {
        const json = await response.json();
        if (ignore) return;
        if (response.ok && typeof json.model === "string") {
          setModel(json.model as OpenRouterModel);
        }
      })
      .catch(() => {
        if (!ignore) {
          setModel(DEFAULT_OPENROUTER_MODEL);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

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
          <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 sm:text-sm">
            {syncTime ? `上次同步：${syncTime}` : "同步中…"}
          </div>
        </header>

        <section className="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:gap-4 md:grid-cols-3">
          <StatCard title="總會話數" value={loading ? "…" : String(stats.total)} change="即時數據" />
          <StatCard title="進行中" value={loading ? "…" : String(stats.active)} change="正在陪伴" />
          <StatCard title="待跟進" value={loading ? "…" : String(stats.pending)} change="需要關注" />
        </section>

        <section className="mb-4 rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[0_10px_30px_rgba(91,80,61,0.08)] sm:mb-6 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="openrouter-model" className="mb-1 block text-sm font-medium text-stone-700">
                OpenRouter 模型
              </label>
              <select
                id="openrouter-model"
                value={model}
                onChange={(event) => setModel(event.target.value as OpenRouterModel)}
                className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700 outline-none ring-amber-200 transition focus:ring-2"
              >
                {OPENROUTER_MODELS.map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={saveModel}
              disabled={savingModel}
              className="rounded-2xl border border-stone-700 bg-stone-700 px-4 py-2.5 text-sm text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingModel ? "儲存中…" : "儲存模型"}
            </button>
          </div>

          {modelMessage && <p className="mt-2 text-sm text-stone-600">{modelMessage}</p>}
        </section>

        <section className="rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[0_10px_30px_rgba(91,80,61,0.08)] sm:p-5">
          {loading && (
            <div className="mb-3 text-center text-sm text-stone-400">載入中…</div>
          )}
          <div className="mb-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋 ID、使用者或摘要..."
              className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700 outline-none ring-amber-200 transition focus:ring-2"
            />
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
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

          <div className="space-y-3 md:hidden">
            {filteredSessions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
                找不到符合條件的會話
              </div>
            )}

            {filteredSessions.map((item) => (
              <article key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-800">{item.id}</p>
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusMap[item.status].style}`}>
                    {statusMap[item.status].label}
                  </span>
                </div>

                <p className="text-sm text-stone-700">{item.name}</p>
                <p className="mt-1 text-sm text-stone-600">情緒：{item.mood}</p>
                <p className="mt-1 text-xs text-stone-500">更新：{item.updatedAt}</p>
                <p className="mt-3 text-sm leading-6 text-stone-600">{item.summary}</p>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-stone-200 md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-stone-50 text-stone-600">
                <tr>
                  <th className="px-4 py-3 font-medium">會話 ID</th>
                  <th className="px-4 py-3 font-medium">使用者</th>
                  <th className="px-4 py-3 font-medium">情緒</th>
                  <th className="px-4 py-3 font-medium">狀態</th>
                  <th className="px-4 py-3 font-medium">最後更新</th>
                  <th className="px-4 py-3 font-medium">摘要</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                      找不到符合條件的會話
                    </td>
                  </tr>
                )}
                {filteredSessions.map((item) => (
                  <tr key={item.id} className="border-t border-stone-100 align-top">
                    <td className="px-4 py-3 font-medium text-stone-700">{item.id}</td>
                    <td className="px-4 py-3 text-stone-700">{item.name}</td>
                    <td className="px-4 py-3 text-stone-700">{item.mood}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusMap[item.status].style}`}>
                        {statusMap[item.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{item.updatedAt}</td>
                    <td className="px-4 py-3 text-stone-600">{item.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

