#!/usr/bin/env tsx
/**
 * `npm run auth:setup` — prepares app-owned storage.
 * - MongoDB (MONGO_URL): creates auth indexes (idempotent).
 * - Postgres: drops the legacy phone/email app_* tables. Postgres stays
 *   strictly read-only afterwards (backend forecast/analysis tables untouched).
 */

import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

function loadEnvFiles(): void {
  for (const name of [".env", ".env.local"]) {
    const abs = path.resolve(process.cwd(), name);
    if (!existsSync(abs)) continue;
    const raw = readFileSync(abs, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      if (!key || process.env[key] !== undefined) continue;
      let val = trimmed.slice(idx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnvFiles();

import { ensureAuthIndexes } from "../lib/mongo/auth";
import { getDb } from "../lib/db/index";
import { sql } from "drizzle-orm";

async function main(): Promise<void> {
  await ensureAuthIndexes();
  console.log("auth:setup — Mongo indexes ready (otp_codes, app_users, app_subscriptions).");

  if (!process.env.POSTGRES_URL) {
    console.log("auth:setup — POSTGRES_URL unset, skipping legacy table cleanup.");
    return;
  }
  const db = getDb();
  await db.execute(sql`DROP TABLE IF EXISTS app_subscriptions`);
  await db.execute(sql`DROP TABLE IF EXISTS app_otp_codes`);
  await db.execute(sql`DROP TABLE IF EXISTS app_users`);
  console.log("auth:setup — legacy Postgres app_* tables dropped (Postgres is read-only now).");
}

main().catch((err) => {
  console.error("auth:setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
