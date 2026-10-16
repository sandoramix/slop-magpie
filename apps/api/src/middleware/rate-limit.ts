/** Fixed-window counter per key, in memory (single API instance). */
export interface FailureLimiter {
  isBlocked(key: string, now?: number): boolean;
  /** Returns true when this failure crossed the limit. */
  recordFailure(key: string, now?: number): boolean;
}

export function createFailureLimiter(options: { max: number; windowMs: number }): FailureLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  const current = (key: string, now: number) => {
    const w = windows.get(key);
    if (w && w.resetAt > now) return w;
    windows.delete(key);
    return undefined;
  };

  const sweep = (now: number) => {
    if (windows.size < 1000) return;
    for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
  };

  return {
    isBlocked(key, now = Date.now()) {
      return (current(key, now)?.count ?? 0) >= options.max;
    },
    recordFailure(key, now = Date.now()) {
      sweep(now);
      const w = current(key, now) ?? { count: 0, resetAt: now + options.windowMs };
      w.count += 1;
      windows.set(key, w);
      return w.count === options.max;
    },
  };
}
