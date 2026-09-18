export type Random = { value: number; cursor: number };

export function random(seed: number, cursor: number): Random {
  let t = (seed + Math.imul(cursor + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return { value: ((t ^ (t >>> 15)) >>> 0) / 4294967296, cursor: cursor + 1 };
}

export function shuffle<T>(
  seed: number,
  cursor: number,
  items: readonly T[],
): { items: T[]; cursor: number } {
  const next = [...items];
  let state = cursor;
  for (let index = next.length - 1; index > 0; index -= 1) {
    const draw = random(seed, state);
    state = draw.cursor;
    const swap = Math.floor(draw.value * (index + 1));
    const held = next[index] as T;
    next[index] = next[swap] as T;
    next[swap] = held;
  }
  return { items: next, cursor: state };
}

export function pickIndex(seed: number, cursor: number, length: number): { index: number; cursor: number } {
  if (length <= 0) return { index: 0, cursor };
  const draw = random(seed, cursor);
  return { index: Math.min(length - 1, Math.floor(draw.value * length)), cursor: draw.cursor };
}
