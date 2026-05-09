import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODEL_COOKIE,
  isOpenRouterModel,
} from "@/lib/openrouter-models";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GUEST_COOKIE = "guest_id";
const GUEST_LIMIT = 5;

const SYSTEM_PROMPT = `你是「心靈導師」，一位專注於身心靈健康的 AI 陪伴者。
你的語氣溫柔、有耐心，擅長傾聽並給予情緒支持。
回覆請使用繁體中文，每次回覆控制在 2-4 句話，避免長篇大論。
不要提供醫療診斷，如果用戶有緊急安全危機，請溫和地建議尋求專業協助。`;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function todayUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function hasValidSessionToken(
  sessionToken: string | undefined,
  supabaseServer: any
): Promise<boolean> {
  if (!sessionToken) return false;

  const { data: sessionRow, error } = await supabaseServer
    .from("sessions")
    .select("expires_at")
    .eq("token", sessionToken)
    .maybeSingle();

  if (error || !sessionRow) return false;

  return new Date((sessionRow as { expires_at: string }).expires_at) > new Date();
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
  }

  const supabaseServer = createClient(supabaseUrl, supabaseKey);
  const cookieStore = await cookies();

  const sessionToken = cookieStore.get("session_token")?.value;
  const isAuthenticated = await hasValidSessionToken(sessionToken, supabaseServer);

  if (!isAuthenticated) {
    let guestId = cookieStore.get(GUEST_COOKIE)?.value;
    if (!guestId) {
      guestId = crypto.randomUUID();
      cookieStore.set(GUEST_COOKIE, guestId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    const day = todayUtcDateKey();
    const { data: quotaRow, error: quotaError } = await supabaseServer
      .from("guest_daily_quota")
      .select("question_count")
      .eq("guest_id", guestId)
      .eq("day", day)
      .maybeSingle();

    if (quotaError) {
      return NextResponse.json({ error: "Failed to check guest quota" }, { status: 500 });
    }

    const currentCount = quotaRow?.question_count ?? 0;
    if (currentCount >= GUEST_LIMIT) {
      return NextResponse.json(
        { error: "GUEST_LIMIT_REACHED", limit: GUEST_LIMIT },
        { status: 429 }
      );
    }

    if (quotaRow) {
      const { error: updateError } = await supabaseServer
        .from("guest_daily_quota")
        .update({ question_count: currentCount + 1, updated_at: new Date().toISOString() })
        .eq("guest_id", guestId)
        .eq("day", day);

      if (updateError) {
        return NextResponse.json({ error: "Failed to update guest quota" }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabaseServer.from("guest_daily_quota").insert({
        guest_id: guestId,
        day,
        question_count: 1,
      });

      if (insertError) {
        return NextResponse.json({ error: "Failed to initialize guest quota" }, { status: 500 });
      }
    }
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
