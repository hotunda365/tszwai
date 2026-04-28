"use client";

import { useMemo, useState } from "react";

type SessionStatus = "active" | "pending" | "resolved";

type SessionItem = {
  id: string;
  name: string;
  mood: string;
  updatedAt: string;
  status: SessionStatus;
  summary: string;
};

const sessions: SessionItem[] = [
  {
    id: "S-1042",
    name: "匿名用戶 A",
    mood: "焦慮",
    updatedAt: "2 分鐘前",
    status: "active",
    summary: "睡眠不安，近期壓力增加，需要短期呼吸引導。",
  },
  {
    id: "S-1037",
    name: "匿名用戶 B",
    mood: "迷惘",
    updatedAt: "16 分鐘前",
    status: "pending",
    summary: "工作轉換期自我懷疑，正在進行情緒拆解。",
  },
  {
    id: "S-1031",
    name: "匿名用戶 C",
    mood: "悲傷",
    updatedAt: "35 分鐘前",
    status: "resolved",
    summary: "關係失落後進入穩定期，已完成本輪陪伴。",
  },
  {
    id: "S-1028",
    name: "匿名用戶 D",
    mood: "平靜",
    updatedAt: "1 小時前",
    status: "active",
    summary: "每日覺察紀錄正常，正在建立睡前儀式。",
  },
];

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

export default function AdminDashboard() {
  const [filter, setFilter] = useState<SessionStatus | "all">("all");
  const [query, setQuery] = useState("");

  const filteredSessions = useMemo(() => {
    return sessions.filter((item) => {
      const matchesFilter = filter === "all" || item.status === filter;
      const matchesQuery =
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.summary.toLowerCase().includes(query.toLowerCase()) ||
        item.id.toLowerCase().includes(query.toLowerCase());

      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_5%_0%,#fff4dd_0%,#f3f0e6_42%,#eaf2e9_100%)] px-3 py-4 sm:px-4 sm:py-6 md:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-stone-200/70 bg-white/70 px-4 py-4 backdrop-blur sm:mb-6 sm:px-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">tszwai.com/admin</p>
            <h1 className="mt-1 text-xl font-semibold text-stone-800 sm:text-2xl">後台管理中心</h1>
          </div>
          <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 sm:text-sm">
            上次同步：剛剛
          </div>
        </header>

        <section className="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:gap-4 md:grid-cols-3">
          <StatCard title="今日會話" value="128" change="+12% vs 昨日" />
          <StatCard title="高風險提醒" value="6" change="-2 件已處理" />
          <StatCard title="平均回覆時間" value="43 秒" change="維持穩定" />
        </section>

        <section className="rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[0_10px_30px_rgba(91,80,61,0.08)] sm:p-5">
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
