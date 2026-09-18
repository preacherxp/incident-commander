import { describe, expect, test } from "bun:test";
import type { VoiceRequest } from "@incident-commander/contracts";
import { createFallbackVoice, createOpenRouterVoice, fallbackLine } from "../src/index";

const request: VoiceRequest = {
  requestId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  cue: "threat_revealed",
  encounterTitle: "Friday, 16:58",
  round: 2,
  stability: 40,
  stabilityTarget: 100,
  harm: 20,
  harmBudget: 100,
  lastJevCard: "bad-deploy",
  lastPlayerCard: "restart",
};

describe("fallback voice", () => {
  test("is deterministic per run, cue and round", () => {
    const first = fallbackLine(request);
    const second = fallbackLine({ ...request });
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });

  test("the fallback voice still returns a usable line", async () => {
    const voice = createFallbackVoice();
    const response = await voice.speak(request);
    expect(response.messageCode).toBe("VOICE_UNAVAILABLE");
    expect(response.line).toBe(fallbackLine(request));
  });
});

describe("openrouter voice", () => {
  test("returns the model line when the provider answers", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          model: "test/model",
          choices: [{ message: { content: "  You are already behind.  " } }],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const voice = createOpenRouterVoice({
      apiKey: "test",
      chatUrl: "https://example.invalid/chat",
      modelId: "test/model",
      timeoutMs: 1000,
      promptVersion: "test",
      fetchImpl,
    });
    const response = await voice.speak(request);
    expect(response.messageCode).toBe("VOICE_READY");
    expect(response.line).toBe("You are already behind.");
  });

  test("falls back to a canned line when the provider fails", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const voice = createOpenRouterVoice({
      apiKey: "test",
      chatUrl: "https://example.invalid/chat",
      modelId: "test/model",
      timeoutMs: 1000,
      promptVersion: "test",
      fetchImpl,
    });
    const response = await voice.speak(request);
    expect(response.messageCode).toBe("VOICE_UNAVAILABLE");
    expect(response.line).toBe(fallbackLine(request));
  });
});
