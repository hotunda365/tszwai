"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, type MessageRow } from "@/lib/supabase";

type Sender = "ai" | "user";

type Message = {
  id: number | string;
  sender: Sender;
  text: string;
  time: string;
};

const moodTags = ["焦慮", "平靜", "悲傷", "迷惘", "疲憊", "期待"];

const SESSION_ID = "default";

const WELCOME: Message = {
  id: "welcome",
  sender: "ai",
  text: "你好，我在這裡陪你。你可以慢慢說，今天最想被理解的是哪一部分？",
  time: "—",
};

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sender: row.sender,
    text: row.text,
    time: formatTime(new Date(row.created_at)),
  };
}

export default function MobileChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [activeMood, setActiveMood] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0, [input]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

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
