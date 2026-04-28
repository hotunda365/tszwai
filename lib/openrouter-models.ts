export const OPENROUTER_MODELS = [
  "mistralai/mistral-7b-instruct",
  "openai/gpt-4o-mini",
  "openai/gpt-4.1-mini",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-3.5-haiku",
] as const;

export type OpenRouterModel = (typeof OPENROUTER_MODELS)[number];

export const DEFAULT_OPENROUTER_MODEL: OpenRouterModel = "mistralai/mistral-7b-instruct";

export const OPENROUTER_MODEL_COOKIE = "openrouter_model";

export function isOpenRouterModel(value: string): value is OpenRouterModel {
  return OPENROUTER_MODELS.includes(value as OpenRouterModel);
}