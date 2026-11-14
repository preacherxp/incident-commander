export type SoundCue = "contain" | "recover" | "shield" | "counter" | "damage" | "victory";

// Short synthesized cues; no audio downloads or background music.
export function playSound(context: AudioContext, cue: SoundCue) {
  const notes: Record<SoundCue, number[]> = {
    contain: [330, 440], recover: [440, 660], shield: [220, 330],
    counter: [523, 784, 1047], damage: [165, 110], victory: [523, 659, 784, 1047],
  };
  notes[cue].forEach((frequency, i) => {
    const start = context.currentTime + i * .07;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = cue === "damage" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(.07, start + .008);
    gain.gain.exponentialRampToValueAtTime(.001, start + .16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + .18);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}
