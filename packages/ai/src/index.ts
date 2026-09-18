import { createFallbackVoice, createOpenRouterVoice, type JevVoice } from "./voice";

export * from "./voice";
export * from "./lines";

export type VoiceEnv = Record<string, string | undefined>;

export function createVoiceFromEnv(env: VoiceEnv): JevVoice {
  const provider = (env.AI_PROVIDER ?? "disabled").toLowerCase();
  const apiKey = env.OPENROUTER_API_KEY ?? env.OPENCODE_API_KEY;
  if (provider !== "openrouter" || !apiKey) return createFallbackVoice();
  return createOpenRouterVoice({
    apiKey,
    chatUrl: env.OPENROUTER_CHAT_URL ?? "https://openrouter.ai/api/v1/chat/completions",
    modelId: env.OPENROUTER_VOICE_MODEL_ID ?? "openai/gpt-4o-mini",
    timeoutMs: Number.parseInt(env.VOICE_TIMEOUT_MS ?? "8000", 10) || 8000,
    promptVersion: env.VOICE_PROMPT_VERSION ?? "ic-jev-voice-1",
    siteUrl: env.OPENROUTER_SITE_URL,
    appTitle: env.OPENROUTER_APP_TITLE,
  });
}
