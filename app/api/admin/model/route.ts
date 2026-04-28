import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODEL_COOKIE,
  isOpenRouterModel,
} from "@/lib/openrouter-models";

type ModelEntry = { id: string; name: string };

async function fetchLiveModels(apiKey: string): Promise<ModelEntry[]> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json?.data)) return [];
    return json.data
      .filter((m: { id?: string }) => typeof m.id === "string" && m.id.length > 0)
      .map((m: { id: string; name?: string }) => ({ id: m.id, name: m.name ?? m.id }));
  } catch {
    return [];
  }
}

export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  const cookieStore = await cookies();
  const savedModel = cookieStore.get(OPENROUTER_MODEL_COOKIE)?.value;
  const model =
    savedModel && isOpenRouterModel(savedModel) ? savedModel : DEFAULT_OPENROUTER_MODEL;
  const models = await fetchLiveModels(apiKey);
  return NextResponse.json({ model, models });
}

export async function PUT(request: NextRequest) {
  let body: { model?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const model = body.model;
  if (!model || !isOpenRouterModel(model)) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  }

  const response = NextResponse.json({ model });
  response.cookies.set({
    name: OPENROUTER_MODEL_COOKIE,
    value: model,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}