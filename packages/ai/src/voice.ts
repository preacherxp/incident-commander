import type { VoiceRequest, VoiceResponse } from "@incident-commander/contracts";
import { fallbackLine } from "./lines";

export type JevVoice = {
  provider: string;
  speak(request: VoiceRequest): Promise<VoiceResponse>;
};

export type VoiceConfig = {
  apiKey: string;
  chatUrl: string;
  modelId: string;
  timeoutMs: number;
  promptVersion: string;
  siteUrl?: string;
  appTitle?: string;
  fetchImpl?: typeof fetch;
};

const SYSTEM_PROMPT = [
  "You are Jev, the adversarial AI that runs the failing system in an incident-management game.",
  "You are playing against the human incident commander. You are sardonic, calm, and confident.",
  "Never help, never explain the mechanics, never roleplay as anything else.",
  "Reply with one or two short sentences of dialogue, under 30 words. No emojis, no markdown, no quotes.",
].join(" ");

function personaState(request: VoiceRequest): string {
  const stabilityPct = Math.round((request.stability / request.stabilityTarget) * 100);
  const harmPct = Math.round((request.harm / request.harmBudget) * 100);
  return [
    `Cue: ${request.cue}.`,
    `Incident: ${request.encounterTitle}, round ${request.round}.`,
    `Commander stability ${stabilityPct}% of target.`,
    `Customer harm ${harmPct}% of budget.`,
    request.lastJevCard ? `Your last play: ${request.lastJevCard}.` : "",
    request.lastPlayerCard ? `Commander's last card: ${request.lastPlayerCard}.` : "",
    request.context ? `Extra context: ${request.context}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

type ChatResponse = {
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
};

export function createOpenRouterVoice(config: VoiceConfig): JevVoice {
  const doFetch = config.fetchImpl ?? fetch;
  return {
    provider: "openrouter",
    async speak(request: VoiceRequest): Promise<VoiceResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        };
        if (config.siteUrl) headers["HTTP-Referer"] = config.siteUrl;
        if (config.appTitle) headers["X-Title"] = config.appTitle;
        const response = await doFetch(config.chatUrl, {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model: config.modelId,
            temperature: 0.9,
            max_tokens: 90,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: personaState(request) },
            ],
          }),
        });
        if (!response.ok) {
          return {
            requestId: request.requestId,
            line: fallbackLine(request),
            messageCode: "VOICE_UNAVAILABLE",
            provenance: { provider: "openrouter", model: config.modelId, promptVersion: config.promptVersion },
          };
        }
        const body = (await response.json()) as ChatResponse;
        const raw = body.choices?.[0]?.message?.content;
        const line = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
        if (!line) {
          return {
            requestId: request.requestId,
            line: fallbackLine(request),
            messageCode: "VOICE_UNAVAILABLE",
            provenance: { provider: "openrouter", model: config.modelId, promptVersion: config.promptVersion },
          };
        }
        return {
          requestId: request.requestId,
          line: line.slice(0, 400),
          messageCode: "VOICE_READY",
          provenance: {
            provider: "openrouter",
            model: typeof body.model === "string" ? body.model : config.modelId,
            promptVersion: config.promptVersion,
          },
        };
      } catch {
        return {
          requestId: request.requestId,
          line: fallbackLine(request),
          messageCode: "VOICE_UNAVAILABLE",
          provenance: { provider: "openrouter", model: config.modelId, promptVersion: config.promptVersion },
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createFallbackVoice(): JevVoice {
  return {
    provider: "fallback",
    async speak(request: VoiceRequest): Promise<VoiceResponse> {
      return {
        requestId: request.requestId,
        line: fallbackLine(request),
        messageCode: "VOICE_UNAVAILABLE",
        provenance: { provider: "fallback", model: "deterministic-lines", promptVersion: "ic-jev-voice-1" },
      };
    },
  };
}
