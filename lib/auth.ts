/**
 * Email+OTP session helpers (server only). Cookie sessions signed with
 * HMAC-SHA256 — no extra dependencies.
 *
 * Cookie: `ahvaan_session` = base64url(payload) + "." + hex(hmac).
 * Payload: { email, exp } (30 days). Secret: SESSION_SECRET env.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { isValidEmail } from "./email/compose";

const COOKIE_NAME = "ahvaan_session";
const SESSION_DAYS = 30;

function secret(): string {
  const s = (process.env.SESSION_SECRET ?? "").trim();
  if (!s) {
    throw new Error(
      "SESSION_SECRET is not set. Add a random string to .env (see .env.example).",
    );
  }
  return s;
}

function b64urlEncode(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}

function b64urlDecode(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export interface Session {
  email: string;
  exp: number;
}

/** Mint a session token for a verified email address. */
export function mintSession(email: string): string {
  const payload = b64urlEncode(
    JSON.stringify({ email, exp: Date.now() + SESSION_DAYS * 86_400_000 }),
  );
  return `${payload}.${sign(payload)}`;
}

/** Verify a session token (cookie value). Null when invalid/expired. */
export function verifySession(token: string | null | undefined): Session | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(sign(payload), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(b64urlDecode(payload)) as Session;
    if (!data.email || typeof data.exp !== "number" || data.exp < Date.now()) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}; ${
    process.env.NODE_ENV === "production" ? "Secure;" : ""
  }`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;`;
}

/** Email from the request's session cookie (null when logged out). */
export function sessionEmailFrom(req: Request): string | null {
  const header = req.headers.get("cookie") ?? "";
  const m = header.match(/(?:^|;\s*)ahvaan_session=([^;]+)/);
  return verifySession(m?.[1] ?? null)?.email ?? null;
}

/** Normalized email address (lowercased), or null when invalid. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return isValidEmail(email) ? email : null;
}

export { COOKIE_NAME };
