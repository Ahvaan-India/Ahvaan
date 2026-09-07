import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Pooled Postgres client for Vercel serverless (Node.js runtime).
 *
 * - Uses `postgres-js` with `max: 1`-style pooling per invocation-friendly
 *   defaults; serverless functions are stateless/short-lived so we must not
 *   open a raw long-lived pool per invocation.
 * - Connection string comes from POSTGRES_URL (Vercel project settings).
 * - Reuses the client across invocations via the global cache so warm
 *   invocations don't reconnect on every request.
 */

const globalForDb = globalThis as unknown as {
  __heatshield_client?: ReturnType<typeof postgres>;
  __heatshield_db?: ReturnType<typeof drizzle<typeof schema>>;
};

function getClient() {
  if (!globalForDb.__heatshield_client) {
    const url = process.env.POSTGRES_URL;
    if (!url) {
      throw new Error(
        "POSTGRES_URL is not set. Configure it in Vercel project settings / .env.local",
      );
    }
    globalForDb.__heatshield_client = postgres(url, {
      // Serverless-friendly: small pool, quick idle close.
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return globalForDb.__heatshield_client;
}

export function getDb() {
  if (!globalForDb.__heatshield_db) {
    globalForDb.__heatshield_db = drizzle(getClient(), { schema });
  }
  return globalForDb.__heatshield_db;
}
