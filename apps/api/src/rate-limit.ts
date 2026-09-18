export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    if (now - this.lastSweep > this.windowMs) {
      this.sweep(now);
      this.lastSweep = now;
    }
    const windowStart = now - this.windowMs;
    const entries = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);
    if (entries.length >= this.limit) {
      const oldest = entries[0] ?? now;
      return { allowed: false, retryAfterSeconds: Math.ceil((oldest + this.windowMs - now) / 1000) };
    }
    entries.push(now);
    this.hits.set(key, entries);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private sweep(now: number): void {
    const windowStart = now - this.windowMs;
    for (const [key, entries] of this.hits) {
      const kept = entries.filter((timestamp) => timestamp > windowStart);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }
}
