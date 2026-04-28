import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODEL_COOKIE,
  OPENROUTER_MODELS,
  isOpenRouterModel,
} from "@/lib/openrouter-models";

export async function GET() {
  const cookieStore = await cookies();
  const selectedModel = cookieStore.get(OPENROUTER_MODEL_COOKIE)?.value;
  const model = selectedModel && isOpenRouterModel(selectedModel)
    ? selectedModel
    : DEFAULT_OPENROUTER_MODEL;

  return NextResponse.json({ model, models: OPENROUTER_MODELS });
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