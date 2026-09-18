import { createDatabase } from "@incident-commander/db";
import { createVoiceFromEnv } from "@incident-commander/ai";
import { createApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const { db, close } = createDatabase(env.DATABASE_URL, { max: 10 });

const voice = createVoiceFromEnv({
  AI_PROVIDER: env.AI_PROVIDER,
  OPENROUTER_API_KEY: env.OPENROUTER_API_KEY ?? env.OPENCODE_API_KEY,
  OPENROUTER_CHAT_URL: env.OPENROUTER_CHAT_URL,
  OPENROUTER_VOICE_MODEL_ID: env.OPENROUTER_VOICE_MODEL_ID,
  OPENROUTER_SITE_URL: env.OPENROUTER_SITE_URL,
  OPENROUTER_APP_TITLE: env.OPENROUTER_APP_TITLE,
  VOICE_TIMEOUT_MS: String(env.VOICE_TIMEOUT_MS),
  VOICE_PROMPT_VERSION: env.VOICE_PROMPT_VERSION,
});

const app = createApp({ env, db, voice, ...(env.WEB_DIST_PATH ? { webDistPath: env.WEB_DIST_PATH } : {}) });

const server = Bun.serve({
  port: env.PORT,
  hostname: env.HOST,
  fetch: app.fetch,
  idleTimeout: 30,
});

console.log(`Incident Commander API listening on http://localhost:${server.port}`);
console.log(`Jev voice provider: ${voice.provider}`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; draining.`);
  await server.stop();
  await close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
