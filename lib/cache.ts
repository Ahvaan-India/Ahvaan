// Tiny in-memory TTL cache for Vercel serverless (per-instance).
// Each serverless instance keeps its own Map; entries live only for TTL.
// Good for 30-60s deduping of heavy snapshot queries without external Redis.

type Entry = { data: unknown; expires: number };
const store = new Map<string, Entry>();

export function getCached<T>(key: string): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    store.delete(key);
    return null;
  }
  return e.data as T;
}

export function setCached(key: string, data: unknown, ttlMs: number): void {
  store.set(key, { data, expires: Date.now() + ttlMs });
  // Soft cap: keep at most 200 keys to avoid unbounded growth in long-lived dev server
  if (store.size > 200) {
    const first = store.keys().next().value as string | undefined;
    if (first) store.delete(first);
  }
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== null) return hit;
  const data = await fn();
  setCached(key, data, ttlMs);
  return data;
}
