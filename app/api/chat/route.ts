import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODEL_COOKIE,
  isOpenRouterModel,
} from "@/lib/openrouter-models";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `你是「心靈導師」，一位專注於身心靈健康的 AI 陪伴者。
你的語氣溫柔、有耐心，擅長傾聽並給予情緒支持。
回覆請使用繁體中文，每次回覆控制在 2-4 句話，避免長篇大論。
不要提供醫療診斷，如果用戶有緊急安全危機，請溫和地建議尋求專業協助。`;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 500 });
  }

  let body: { messages?: ChatMessage[]; model?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const userMessages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
  const requestedModel = typeof body.model === "string" ? body.model : undefined;

  let selectedModel = DEFAULT_OPENROUTER_MODEL;
  if (requestedModel && isOpenRouterModel(requestedModel)) {
    selectedModel = requestedModel;
  } else {
    const cookieStore = await cookies();
    const cookieModel = cookieStore.get(OPENROUTER_MODEL_COOKIE)?.value;
    if (cookieModel && isOpenRouterModel(cookieModel)) {
      selectedModel = cookieModel;
    }
  }

  const payload = {
    model: selectedModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...userMessages,
    ],
    max_tokens: 300,
    temperature: 0.75,
    stream: true,
  };

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://tszwai.com",
      "X-Title": "Mindful Guide",
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    return new Response(JSON.stringify({ error: errorText }), { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
