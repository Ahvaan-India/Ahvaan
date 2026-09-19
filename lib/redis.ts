/**
 * Redis cache layer between the website and Postgres.
 *
 * Topology:  Browser/SWR → Next API route → Redis (this module) → Postgres.
 * Every DB read on the website path goes through `withRedisCache()` so
 * repeat dashboard hits never touch Postgres. Writes (engine updater,
 * snapshot refresh) invalidate the affected keys.
 *
 * - If `REDIS_URL` is set, uses ioredis (lazy-connect, serverless-safe).
 * - If not set (local dev without redis), falls back to the same in-memory
 *   TTL map semantics so the site works with zero infra.
 * - All helpers are fail-open: a Redis outage logs once and falls through
 *   to Postgres rather than 500ing the request.
 */

type MemEntry = { raw: string; expires: number };
const memStore = new Map<string, MemEntry>();

function memGet(key: string): string | null {
  const e = memStore.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    memStore.delete(key);
    return null;
  }
  return e.raw;
}

function memSet(key: string, raw: string, ttlSeconds: number): void {
  memStore.set(key, { raw, expires: Date.now() + ttlSeconds * 1000 });
  if (memStore.size > 1000) {
    const first = memStore.keys().next().value as string | undefined;
    if (first) memStore.delete(first);
  }
}

function memDel(prefix: string): void {
  for (const k of [...memStore.keys()]) {
    if (k === prefix || k.startsWith(prefix)) memStore.delete(k);
  }
}

// Lazy singleton so importing this module never opens a socket at build time.
type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttl: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
  status?: string;
};

let client: RedisLike | null = null;
let warned = false;

function warnOnce(msg: unknown): void {
  if (!warned) {
    warned = true;
    console.warn("[redis] fail-open:", msg instanceof Error ? msg.message : msg);
  }
}

async function getClient(): Promise<RedisLike | null> {
  // Only connect to external Redis in production or if explicitly enabled in dev
  const isProd = process.env.NODE_ENV === "production";
  const forceEnable = process.env.ENABLE_REDIS_DEV === "true";
  if (!isProd && !forceEnable) return null;

  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (client) return client;
  try {
    // Dynamic import keeps `ioredis` optional for dev without redis.
    const mod = (await import("ioredis")) as unknown as {
      default: new (url: string, opts: Record<string, unknown>) => RedisLike;
    };
    client = new mod.default(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
  } catch (err) {
    warnOnce(err);
    client = null;
  }
  return client;
}

export function isRedisConfigured(): boolean {
  const isProd = process.env.NODE_ENV === "production";
  const forceEnable = process.env.ENABLE_REDIS_DEV === "true";
  return Boolean(process.env.REDIS_URL) && (isProd || forceEnable);
}

/**
 * Connectivity probe for /api/health: writes + reads + deletes a probe key.
 * Never throws — reports `{ reachable, latencyMs }` so the dashboard can
 * show whether Redis is actually serving traffic or everything is falling
 * back to Postgres + in-memory.
 */
export async function redisStatus(): Promise<{
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
}> {
  const configured = isRedisConfigured();
  if (!configured) return { configured, reachable: false, latencyMs: null };
  const t0 = Date.now();
  try {
    const key = "ahvaan:health:probe";
    await redisSet(key, { t: t0 }, 30);
    const hit = await redisGet<{ t: number }>(key);
    await redisDel(key);
    if (!hit) return { configured, reachable: false, latencyMs: null };
    return { configured, reachable: true, latencyMs: Date.now() - t0 };
  } catch {
    return { configured, reachable: false, latencyMs: null };
  }
}

export async function redisGet<T>(key: string): Promise<T | null> {
  const c = await getClient();
  try {
    if (c) {
      const raw = await c.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    }
  } catch (err) {
    warnOnce(err);
  }
  const raw = memGet(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const raw = JSON.stringify(value);
  const c = await getClient();
  try {
    if (c) {
      await c.set(key, raw, "EX", ttlSeconds);
    }
  } catch (err) {
    warnOnce(err);
  }
  memSet(key, raw, ttlSeconds);
}

export async function redisDel(keyOrPrefix: string): Promise<void> {
  const c = await getClient();
  try {
    if (c) {
      if (keyOrPrefix.endsWith("*")) {
        const keys = await c.keys(keyOrPrefix);
        if (keys.length > 0) await c.del(...keys);
      } else {
        await c.del(keyOrPrefix);
      }
    }
  } catch (err) {
    warnOnce(err);
  }
  memDel(keyOrPrefix.replace(/\*$/, ""));
}

/**
 * Read-through cache: Redis (or memory fallback) first, `fn` (Postgres)
 * on miss, then populate with `ttlSeconds`. Always fail-open to Postgres.
 */
export async function withRedisCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<{ data: T; cached: boolean }> {
  try {
    const hit = await redisGet<T>(key);
    if (hit !== null) return { data: hit, cached: true };
  } catch (err) {
    warnOnce(err);
  }
  const data = await fn();
  if (data !== null && data !== undefined) {
    try {
      await redisSet(key, data, ttlSeconds);
    } catch (err) {
      warnOnce(err);
    }
  }
  return { data, cached: false };
}

// ---------------------------------------------------------------------------
// Key names + TTLs (single place so invalidation stays correct)
// ---------------------------------------------------------------------------

export const REDIS_TTL = {
  analysisDay: 6 * 3_600, // engine days are immutable once computed
  location: 3_600,
  population: 3_600,
  weatherWindow: 300, // model data refreshes ~hourly
  wards: 3_600,
  board: 120, // city board: per-ward ranges + in-memory math, rebuilt at most every 2 min
  heatmap: 60,
  summary: 60,
  forecast: 120, // per-ward outlook (slowest single-ward read)
  telemetry: 60, // per-ward detail panel (re-requested on every hover)
  trend: 300, // history series move slowly
} as const;

export const redisKeys = {
  analysis: (locationId: number, date: string) =>
    `ahvaan:analysis:${locationId}:${date}`,
  analysisRange: (locationId: number, from: string, to: string) =>
    `ahvaan:analysis:${locationId}:${from}:${to}`,
  showcase: (locationId: number) => `ahvaan:showcase:${locationId}`,
  location: (id: number) => `ahvaan:loc:${id}`,
  population: (id: number) => `ahvaan:pop:${id}`,
  weatherWindow: (id: number, hours: number) => `ahvaan:wx:${id}:${hours}`,
  wards: "ahvaan:wards",
  heatmap: "ahvaan:heatmap",
  summary: "ahvaan:summary",
};

export async function invalidateAnalysis(
  locationId: number,
  date?: string,
): Promise<void> {
  if (date) {
    await redisDel(redisKeys.analysis(locationId, date));
  } else {
    await redisDel(`ahvaan:analysis:${locationId}:*`);
  }
  await redisDel(redisKeys.showcase(locationId));
  await redisDel(`ahvaan:telemetry:${locationId}`);
  await redisDel(redisKeys.heatmap);
  await redisDel(redisKeys.summary);
  await redisDel("ahvaan:board:*");
}

export async function invalidateWard(locationId: number): Promise<void> {
  await redisDel(redisKeys.location(locationId));
  await redisDel(redisKeys.population(locationId));
  await redisDel(`ahvaan:wx:${locationId}:*`);
  await invalidateAnalysis(locationId);
  await redisDel(redisKeys.heatmap);
  await redisDel(redisKeys.summary);
  await redisDel(redisKeys.wards);
  await redisDel("ahvaan:board:*");
}
