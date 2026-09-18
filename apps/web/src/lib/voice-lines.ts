import type { VoiceCue, VoiceRequest } from "@incident-commander/contracts";

const LINES: Record<VoiceCue, string[]> = {
  opening: [
    "Fresh shift, commander. I have been warming up the graph for you.",
    "Another incident. I do enjoy watching you triage.",
    "The pager is yours. Try to keep up.",
  ],
  threat_revealed: [
    "I have already chosen my next move.",
    "Something is queuing up behind this one.",
    "You cannot counter what you cannot read.",
  ],
  threat_resolved: [
    "That landed exactly where I wanted.",
    "Your customers felt that one.",
    "Predictable, commander.",
  ],
  threat_blocked: ["Fine. You read that one.", "Enjoy the small win.", "One counter is not a strategy."],
  player_ahead: [
    "Comfortable? Good.",
    "You are winning the round, not the shift.",
    "Keep spending focus. I will wait.",
  ],
  jev_ahead: ["Momentum is mine.", "The graph is bending my way.", "You are reacting now. I prefer that."],
  draft: [
    "Take your little upgrade. I will take the next incident.",
    "Choose carefully. It will not be enough.",
    "A new card. How reassuring.",
  ],
  victory: ["You held. This time.", "Well played, commander. I will remember it."],
  defeat: ["Your shift ends here.", "I told you the graph does not forgive."],
};

function hash(value: string): number {
  let state = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    state ^= value.charCodeAt(index);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return state;
}

export function fallbackLineFor(request: VoiceRequest): string {
  const options = LINES[request.cue];
  const key = `${request.runId}:${request.cue}:${request.round}`;
  return options[hash(key) % options.length] as string;
}
