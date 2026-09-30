/**
 * MongoDB client for app-owned writes (auth + user data).
 * Postgres stays strictly read-only (backend forecast/analysis tables).
 *
 * Lazy singleton: importing this module never opens a socket at build time.
 * Connection string comes from MONGO_URL.
 */

import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

function mongoUrl(): string {
  const url = (process.env.MONGO_URL ?? "").trim();
  if (!url) {
    throw new Error(
      "MONGO_URL is not set. Add your MongoDB connection string to .env (see .env.example).",
    );
  }
  return url;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (client) return client;
  client = new MongoClient(mongoUrl(), {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  });
  await client.connect();
  return client;
}

/** App database handle (default db from the connection string). */
export async function getMongoDb(): Promise<Db> {
  if (db) return db;
  const c = await getMongoClient();
  db = c.db();
  return db;
}
