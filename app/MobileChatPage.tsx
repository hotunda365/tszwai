"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, type MessageRow } from "@/lib/supabase";

type Sender = "ai" | "user";

type Message = {
  id: number | string;
  sender: Sender;
  text: string;
  time: string;
  dayKey: string;
};

const moodTags = ["焦慮", "平靜", "悲傷", "迷惘", "疲憊", "期待"];

const SESSION_ID = "default";

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function makeDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatDayLabel(dayKey: string): string {
  const today = makeDayKey(new Date());
  const yesterday = makeDayKey(new Date(Date.now() - 86_400_000));
  if (dayKey === today) return "今天";
  if (dayKey === yesterday) return "昨天";
  const [y, m, d] = dayKey.split("-");
  return `${y}年${m}月${d}日`;
}

function rowToMessage(row: MessageRow): Message {
  const date = new Date(row.created_at);
  return {
    id: row.id,
    sender: row.sender,
    text: row.text,
    time: formatTime(date),
    dayKey: makeDayKey(date),
  };
}

const _now = new Date();
const WELCOME: Message = {
  id: "welcome",
  sender: "ai",
  text: "你好，我在這裡陪你。你可以慢慢說，今天最想被理解的是哪一部分？",
  time: "—",
  dayKey: makeDayKey(_now),
};

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function MobileChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [activeMood, setActiveMood] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !typing, [input, typing]);

  useEffect(() => {
    if (!showScrollBtn) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showScrollBtn]);

  const handleScroll = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollBtn(false);
  }, []);

  useEffect(() => {
    let ignore = false;

    supabase
      .from("messages")
      .select("*")
      .eq("session_id", SESSION_ID)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (ignore) return;
        if (!error && data && data.length > 0) setMessages(data.map(rowToMessage));
        setLoading(false);
      });

    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${SESSION_ID}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => {
            const filtered =
              row.sender === "ai"
                ? prev.filter((m) => typeof m.id !== "string" || !String(m.id).startsWith("streaming-"))
                : prev;
            return filtered.some((m) => m.id === row.id) ? filtered : [...filtered, rowToMessage(row)];
          });
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const persistMessage = useCallback(async (sender: Sender, text: string) => {
    await supabase.from("messages").insert({ session_id: SESSION_ID, sender, text });
  }, []);

  const copyMessage = useCallback(async (id: number | string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch { /* clipboard unavailable */ }
  }, []);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || typing) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    await persistMessage("user", content);
    setTyping(true);

    const tempId = `streaming-${Date.now()}`;
    const now = new Date();
    setMessages((prev) => [
      ...prev,
      { id: tempId, sender: "ai", text: "", time: formatTime(now), dayKey: makeDayKey(now) },
    ]);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .slice(-10)
        .map((m) => ({
          role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));
      history.push({ role: "user", content });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
              accumulated += delta;
              setMessages((prev) =>
                prev.map((m) => (m.id === tempId ? { ...m, text: accumulated } : m))
              );
            }
          } catch { /* skip malformed chunk */ }
        }
      }

      await persistMessage("ai", accumulated || "我在這裡，你說吧。");
    } catch {
      const errorText = "網路出了點問題，請稍後再試。";
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, text: errorText } : m)));
      await persistMessage("ai", errorText);
    } finally {
      setTyping(false);
    }
  };

  // 建立含日期分隔線的渲染清單
  type RenderItem =
    | { type: "separator"; dayKey: string; label: string }
    | { type: "message"; message: Message };

  const renderedItems: RenderItem[] = [];
  let lastDayKey = "";
  for (const message of messages) {
    if (message.dayKey !== lastDayKey) {
      renderedItems.push({ type: "separator", dayKey: message.dayKey, label: formatDayLabel(message.dayKey) });
      lastDayKey = message.dayKey;
    }
    renderedItems.push({ type: "message", message });
  }

  return (
    <div className="relative mx-auto flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden overscroll-none bg-[radial-gradient(circle_at_0%_0%,#fff8ee_0%,#f6f1e7_42%,#edf4ea_100%)]">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background:linear-gradient(120deg,rgba(201,163,98,0.08),transparent_40%),linear-gradient(300deg,rgba(102,128,110,0.08),transparent_35%)]" />

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center justify-between border-b border-stone-200/70 bg-white/65 px-4 py-3 backdrop-blur-xl sm:px-5 sm:py-4 md:px-7">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-stone-500 sm:text-xs">Mindful Session</p>
          <h1 className="mt-0.5 text-lg font-semibold text-stone-800 sm:mt-1 sm:text-xl">心靈導師</h1>
        </div>
        <button
          type="button"
          aria-label="設定"
          className="grid h-10 w-10 min-h-[44px] min-w-[44px] place-items-center rounded-full border border-stone-200 bg-white/80 text-stone-600 shadow-sm transition active:bg-stone-100 sm:hover:bg-stone-50"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
            <path d="M19.4 15a1.4 1.4 0 0 0 .28 1.53l.05.05a1.7 1.7 0 1 1-2.4 2.4l-.05-.05a1.4 1.4 0 0 0-1.53-.28 1.4 1.4 0 0 0-.85 1.28V20a1.7 1.7 0 1 1-3.4 0v-.07a1.4 1.4 0 0 0-.9-1.29 1.4 1.4 0 0 0-1.53.29l-.05.05a1.7 1.7 0 0 1-2.4-2.4l.05-.05a1.4 1.4 0 0 0 .29-1.53 1.4 1.4 0 0 0-1.29-.9H4a1.7 1.7 0 1 1 0-3.4h.07a1.4 1.4 0 0 0 1.29-.9 1.4 1.4 0 0 0-.29-1.53l-.05-.05a1.7 1.7 0 0 1 2.4-2.4l.05.05a1.4 1.4 0 0 0 1.53.29h.02a1.4 1.4 0 0 0 .88-1.29V4a1.7 1.7 0 1 1 3.4 0v.07a1.4 1.4 0 0 0 .85 1.28 1.4 1.4 0 0 0 1.53-.28l.05-.05a1.7 1.7 0 1 1 2.4 2.4l-.05.05a1.4 1.4 0 0 0-.28 1.53v.02a1.4 1.4 0 0 0 1.28.88H20a1.7 1.7 0 1 1 0 3.4h-.07a1.4 1.4 0 0 0-1.29.85V15Z" />
          </svg>
        </button>
      </header>

      {/* Messages */}
      <main
        ref={mainRef}
        onScroll={handleScroll}
        className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 pt-4 sm:px-4 sm:pt-5 md:px-7"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 sm:gap-4">
          {loading && (
            <div className="flex justify-center py-6 text-sm text-stone-400">載入中…</div>
          )}

          {renderedItems.map((item) => {
            if (item.type === "separator") {
              return (
                <div key={`sep-${item.dayKey}`} className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-stone-200/80" />
                  <span className="text-[11px] text-stone-400">{item.label}</span>
                  <div className="h-px flex-1 bg-stone-200/80" />
                </div>
              );
            }

            const { message } = item;
            const isAi = message.sender === "ai";
            const isStreaming = typeof message.id === "string" && message.id.startsWith("streaming-");
            const isCopied = copiedId === message.id;

            return (
              <div
                key={message.id}
                className={`flex items-end gap-2 ${isAi ? "justify-start" : "justify-end"}`}
              >
                {isAi && (
                  <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 text-sm shadow-sm sm:h-8 sm:w-8 sm:text-base">
                    🌿
                  </div>
                )}

                <article
                  className={`group/msg max-w-[85%] rounded-3xl px-3.5 py-2.5 shadow-sm sm:max-w-[80%] sm:px-4 sm:py-3 md:max-w-[70%] ${
                    isAi
                      ? "rounded-bl-sm border border-stone-100 bg-white/95 text-stone-700"
                      : "rounded-br-sm bg-gradient-to-br from-amber-200 to-orange-200 text-stone-800"
                  }`}
                >
                  {message.text ? (
                    <p className="whitespace-pre-wrap text-[14px] leading-[1.65] sm:text-[15px] sm:leading-7">
                      {message.text}
                      {isStreaming && (
                        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-stone-400 align-middle" />
                      )}
                    </p>
                  ) : (
                    <div className="flex items-center gap-1.5 py-0.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" />
                    </div>
                  )}

                  <div className="mt-1.5 flex items-center gap-2 sm:mt-2">
                    {message.text && !isStreaming && (
                      <button
                        type="button"
                        onClick={() => copyMessage(message.id, message.text)}
                        className={`transition-opacity ${
                          isCopied
                            ? "text-emerald-600 opacity-70"
                            : "text-stone-400 opacity-0 active:opacity-60 group-hover/msg:opacity-60"
                        }`}
                        aria-label="複製訊息"
                      >
                        {isCopied ? <CheckIcon /> : <CopyIcon />}
                      </button>
                    )}
                    <p className="ml-auto text-[10px] text-stone-500 sm:text-[11px]">{message.time}</p>
                  </div>
                </article>
              </div>
            );
          })}

          <div ref={chatEndRef} />
        </div>
      </main>

      {/* 捲到底部按鈕 */}
      {showScrollBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-[8.5rem] right-4 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white/90 text-stone-600 shadow-md backdrop-blur transition active:bg-white sm:bottom-36 sm:right-5"
          aria-label="捲到最下方"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {/* Footer */}
      <footer className="relative z-20 shrink-0 border-t border-stone-200/70 bg-white/80 px-3 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-xl sm:px-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-3 md:px-7">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-2.5 flex snap-x gap-1.5 overflow-x-auto pb-0.5 sm:mb-3 sm:gap-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {moodTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setActiveMood((prev) => (prev === tag ? null : tag));
                  setInput((prev) => (prev.length === 0 ? `我現在感到${tag}，` : prev));
                }}
                className={`shrink-0 snap-start rounded-full border px-2.5 py-1 text-xs transition active:scale-95 sm:px-3 sm:py-1.5 sm:text-sm ${
                  activeMood === tag
                    ? "border-amber-400 bg-amber-100 text-amber-800"
                    : "border-stone-200 bg-white text-stone-600 active:border-stone-300"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2 rounded-[1.4rem] border border-stone-200 bg-white px-3 py-2 shadow-[0_4px_20px_rgba(110,98,79,0.10)] sm:rounded-[1.6rem] sm:shadow-[0_8px_28px_rgba(110,98,79,0.12)]">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              disabled={typing}
              onChange={(e) => {
                setInput(e.target.value);
                const ta = e.target;
                ta.style.height = "auto";
                ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={typing ? "正在回覆中…" : "分享你此刻的心情..."}
              className="flex-1 resize-none bg-transparent px-1.5 py-1.5 text-base leading-snug text-stone-700 outline-none placeholder:text-stone-400 disabled:cursor-not-allowed sm:px-2 sm:py-2 sm:text-[15px]"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!canSend}
              className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-orange-400 text-white shadow-md transition active:brightness-90 disabled:cursor-not-allowed disabled:opacity-45 sm:hover:brightness-105"
              aria-label="送出訊息"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M22 2 11 13" />
                <path d="m22 2-7 20-4-9-9-4 20-7Z" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-stone-400 sm:mt-2 sm:text-[11px]">Enter 送出・Shift+Enter 換行</p>
        </div>
      </footer>
    </div>
  );
}

  useEffect(() => {
    let ignore = false;

    supabase
      .from("messages")
      .select("*")
      .eq("session_id", SESSION_ID)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (ignore) return;
        if (!error && data && data.length > 0) {
          setMessages(data.map(rowToMessage));
        }
        setLoading(false);
      });

    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${SESSION_ID}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, rowToMessage(row)]
          );
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const persistMessage = useCallback(async (sender: Sender, text: string) => {
    await supabase.from("messages").insert({ session_id: SESSION_ID, sender, text });
  }, []);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content) return;

    setInput("");
    await persistMessage("user", content);
    setTyping(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .slice(-10)
        .map((m) => ({
          role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));

      history.push({ role: "user", content });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      const json = await res.json();
      const reply: string = json.reply ?? "我在這裡，你說吧。";
      await persistMessage("ai", reply);
    } catch {
      await persistMessage("ai", "網路出了點問題，請稍後再試。");
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="relative mx-auto flex h-screen w-full max-w-3xl flex-col overflow-hidden bg-[radial-gradient(circle_at_0%_0%,#fff8ee_0%,#f6f1e7_42%,#edf4ea_100%)]">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background:linear-gradient(120deg,rgba(201,163,98,0.08),transparent_40%),linear-gradient(300deg,rgba(102,128,110,0.08),transparent_35%)]" />

      <header className="relative z-10 flex items-center justify-between border-b border-stone-200/70 bg-white/65 px-5 py-4 backdrop-blur-xl md:px-7">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Mindful Session</p>
          <h1 className="mt-1 text-xl font-semibold text-stone-800">心靈導師</h1>
        </div>
        <button
          type="button"
          aria-label="設定"
          className="grid h-10 w-10 place-items-center rounded-full border border-stone-200 bg-white/80 text-stone-600 shadow-sm transition hover:bg-stone-50"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
            <path d="M19.4 15a1.4 1.4 0 0 0 .28 1.53l.05.05a1.7 1.7 0 1 1-2.4 2.4l-.05-.05a1.4 1.4 0 0 0-1.53-.28 1.4 1.4 0 0 0-.85 1.28V20a1.7 1.7 0 1 1-3.4 0v-.07a1.4 1.4 0 0 0-.9-1.29 1.4 1.4 0 0 0-1.53.29l-.05.05a1.7 1.7 0 0 1-2.4-2.4l.05-.05a1.4 1.4 0 0 0 .29-1.53 1.4 1.4 0 0 0-1.29-.9H4a1.7 1.7 0 1 1 0-3.4h.07a1.4 1.4 0 0 0 1.29-.9 1.4 1.4 0 0 0-.29-1.53l-.05-.05a1.7 1.7 0 0 1 2.4-2.4l.05.05a1.4 1.4 0 0 0 1.53.29h.02a1.4 1.4 0 0 0 .88-1.29V4a1.7 1.7 0 1 1 3.4 0v.07a1.4 1.4 0 0 0 .85 1.28 1.4 1.4 0 0 0 1.53-.28l.05-.05a1.7 1.7 0 1 1 2.4 2.4l-.05.05a1.4 1.4 0 0 0-.28 1.53v.02a1.4 1.4 0 0 0 1.28.88H20a1.7 1.7 0 1 1 0 3.4h-.07a1.4 1.4 0 0 0-1.29.85V15Z" />
          </svg>
        </button>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-4 pb-36 pt-5 md:px-7">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {loading && (
            <div className="flex justify-center py-6 text-sm text-stone-400">載入中…</div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}>
              <article
                className={`max-w-[84%] rounded-3xl px-4 py-3 shadow-sm md:max-w-[72%] ${
                  message.sender === "user"
                    ? "rounded-tr-md bg-gradient-to-br from-amber-200 to-orange-200 text-stone-800"
                    : "rounded-tl-md border border-stone-100 bg-white/95 text-stone-700"
                }`}
              >
                <p className="whitespace-pre-wrap text-[15px] leading-7">{message.text}</p>
                <p className="mt-2 text-right text-[11px] text-stone-500">{message.time}</p>
              </article>
            </div>
          ))}

          {typing && (
            <div className="flex justify-start">
              <div className="rounded-3xl rounded-tl-md border border-stone-100 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </main>

      <footer className="absolute inset-x-0 bottom-0 z-20 border-t border-stone-200/70 bg-white/75 px-4 pb-[calc(env(safe-area-inset-bottom)+0.8rem)] pt-3 backdrop-blur-xl md:px-7">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-3 flex snap-x gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {moodTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setActiveMood((prev) => (prev === tag ? null : tag));
                  setInput((prev) => (prev.length === 0 ? `我現在感到${tag}，` : prev));
                }}
                className={`shrink-0 snap-start rounded-full border px-3 py-1.5 text-sm transition ${
                  activeMood === tag
                    ? "border-amber-400 bg-amber-100 text-amber-800"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-[1.6rem] border border-stone-200 bg-white px-3 py-2 shadow-[0_8px_28px_rgba(110,98,79,0.12)]">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  sendMessage();
                }
              }}
              placeholder="分享你此刻的心情..."
              className="flex-1 bg-transparent px-2 py-2 text-sm text-stone-700 outline-none placeholder:text-stone-400 md:text-[15px]"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!canSend}
              className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-orange-400 text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="送出訊息"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M22 2 11 13" />
                <path d="m22 2-7 20-4-9-9-4 20-7Z" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
