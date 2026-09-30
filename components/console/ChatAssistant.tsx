"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bot, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

/**
 * AI assistant panel, anchored bottom-right above the AI button that
 * triggers it. Zone-grounded answers via /api/chat (Cloudflare Workers AI).
 */
export function ChatAssistant({
  open,
  onClose,
  ulid,
}: {
  open: boolean;
  onClose: () => void;
  ulid: string | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages.slice(-5), { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, ulid, history: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Assistant failed.");
      setMessages([...next, { role: "assistant", content: data.answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assistant failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/20"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-[216px] right-3 z-50 flex max-h-[min(480px,calc(100dvh-320px))] w-[340px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl"
            style={{ transformOrigin: "bottom right" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold">
                <Bot className="h-4 w-4 text-red-600" /> Ahvaan Assistant
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={onClose}
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div ref={scrollRef} className="custom-scrollbar min-h-[140px] flex-1 space-y-2 overflow-y-auto p-3">
              {messages.length === 0 && (
                <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  Ask about the selected zone's temperature, indices or
                  vulnerability — answers come from live backend data.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {m.content}
                </div>
              ))}
              {busy && (
                <div className="w-fit rounded-2xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                  Thinking…
                </div>
              )}
              {error && (
                <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 border-t p-2.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, 500))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="Ask about this zone…"
                className="h-10 min-w-0 flex-1 rounded-full border bg-muted/40 px-3.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full"
                disabled={busy || !input.trim()}
                onClick={send}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
