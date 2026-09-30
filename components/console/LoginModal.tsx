"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, MessageSquareText, LogOut, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Email+OTP login panel, anchored top-right under the account button.
 * Handles login, shows the signed-in address, zone subscriptions, logout.
 */
export function LoginModal({
  open,
  onClose,
  email,
  subscriptions,
  onAuthChange,
}: {
  open: boolean;
  onClose: () => void;
  email: string | null;
  subscriptions: Array<{ ulid: string; label: string; district: string | null }>;
  onAuthChange: () => void;
}) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [emailInput, setEmailInput] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reset = () => {
    setStep("email");
    setCode("");
    setError(null);
    setInfo(null);
    setBusy(false);
  };

  const requestOtp = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not send code.");
      setStep("otp");
      setInfo(
        data.simulated
          ? `Demo mode (email not configured): ${data.devOtp ? `code is ${data.devOtp}` : "check server logs"}.`
          : "Code sent by email. It expires in 10 minutes.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Verification failed.");
      reset();
      onAuthChange();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    reset();
    onAuthChange();
  };

  const unsubscribe = async (ulid: string) => {
    await fetch("/api/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ulid }),
    });
    onAuthChange();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/30 backdrop-blur-xs"
            onClick={() => {
              reset();
              onClose();
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed right-3 top-[68px] z-50 w-[320px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border bg-card shadow-2xl"
            style={{ transformOrigin: "top right" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-bold">
                {email ? "Account" : "Login with email"}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => {
                  reset();
                  onClose();
                }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="custom-scrollbar max-h-[60vh] space-y-3 overflow-y-auto p-4">
              {!email ? (
                step === "email" ? (
                  <div className="space-y-2.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Email address
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3">
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <input
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="you@example.com"
                        inputMode="email"
                        className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <Button className="w-full" disabled={busy || !emailInput.includes("@")} onClick={requestOtp}>
                      {busy ? "Sending…" : "Send code"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      6-digit code
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3">
                      <MessageSquareText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="••••••"
                        inputMode="numeric"
                        className="h-10 w-full bg-transparent text-sm tracking-[0.3em] outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <Button className="w-full" disabled={busy || code.length !== 6} onClick={verifyOtp}>
                      {busy ? "Verifying…" : "Verify & login"}
                    </Button>
                    <button
                      onClick={() => setStep("email")}
                      className="w-full text-center text-xs font-semibold text-primary hover:underline"
                    >
                      Use a different email
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                    <span className="truncate text-sm font-bold">{email}</span>
                    <button
                      onClick={logout}
                      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Logout
                    </button>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Ward alerts ({subscriptions.length})
                    </p>
                    {subscriptions.length === 0 ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        No ward alerts yet. Open any zone and tap “Get alerts”
                        — an automated alert is sent immediately.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {subscriptions.map((s) => (
                          <div
                            key={s.ulid}
                            className="flex items-center gap-2 rounded-xl border px-2.5 py-2"
                          >
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                              {s.label}
                            </span>
                            <button
                              onClick={() => unsubscribe(s.ulid)}
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                                "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {error && (
                <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              {info && (
                <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {info}
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
