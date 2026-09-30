/**
 * App-owned Mongo collections: OTP codes, users, zone subscriptions.
 * Everything the website WRITES lives here — Postgres is read-only.
 */

import type { Collection, Db, Document, WithId } from "mongodb";
import { getMongoDb } from "./client";

export interface OtpDoc {
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumed: boolean;
  createdAt: Date;
}

export interface UserDoc {
  _id?: unknown;
  email: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface SubscriptionDoc {
  _id?: unknown;
  email: string;
  ulid: string;
  createdAt: Date;
}

async function col<T extends Document>(db: Db, name: string): Promise<Collection<T>> {
  return db.collection<T>(name);
}

export async function otps(): Promise<Collection<OtpDoc>> {
  return col<OtpDoc>(await getMongoDb(), "otp_codes");
}

export async function users(): Promise<Collection<UserDoc>> {
  return col<UserDoc>(await getMongoDb(), "app_users");
}

export async function subscriptions(): Promise<Collection<SubscriptionDoc>> {
  return col<SubscriptionDoc>(await getMongoDb(), "app_subscriptions");
}

/** Idempotent indexes for the auth flow (also run by `npm run auth:setup`). */
export async function ensureAuthIndexes(): Promise<void> {
  const db = await getMongoDb();
  await db.collection("otp_codes").createIndex({ email: 1, createdAt: -1 });
  await db.collection("app_users").createIndex({ email: 1 }, { unique: true });
  await db
    .collection("app_subscriptions")
    .createIndex({ email: 1, ulid: 1 }, { unique: true });
}
