export type OpenRouterModel = string;

export const DEFAULT_OPENROUTER_MODEL: OpenRouterModel = "mistralai/mistral-7b-instruct";

export const OPENROUTER_MODEL_COOKIE = "openrouter_model";

export function isOpenRouterModel(value: string): value is OpenRouterModel {
  return value.trim().length > 0;
}