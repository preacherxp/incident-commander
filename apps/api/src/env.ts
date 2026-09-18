import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  AI_PROVIDER: z.enum(["openrouter", "disabled"]).default("disabled"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENCODE_API_KEY: z.string().optional(),
  OPENROUTER_CHAT_URL: z.string().url().default("https://openrouter.ai/api/v1/chat/completions"),
  OPENROUTER_VOICE_MODEL_ID: z.string().default("openai/gpt-4o-mini"),
  OPENROUTER_SITE_URL: z.string().optional(),
  OPENROUTER_APP_TITLE: z.string().default("Incident Commander"),
  VOICE_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  VOICE_PROMPT_VERSION: z.string().default("ic-jev-voice-1"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.string().default("development"),
  WEB_DIST_PATH: z.string().optional(),
  HOST: z.string().default("0.0.0.0"),
});

export type ApiEnv = z.infer<typeof envSchema> & { isProduction: boolean };

export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${issues.join("\n")}`);
  }
  return { ...parsed.data, isProduction: parsed.data.NODE_ENV === "production" };
}
