"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWard } from "@/lib/wardContext";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Which ward in Kolkata has the highest heat risk?",
  "What is the heat condition in Ward 12?",
  "What safety precautions should I take in extreme heat?",
  "How does the Ahvaan HeatShield engine calculate risk?",
];

/**
 * Ahvaan Assistant (Cloudflare Workers AI).
 * Triggered from the header AI Assistant button (or custom event 'toggle-chatbot').
 * Positioned in top-right below the navbar to prevent any overlap with map controls,
 * category pills, or legend bars.
 */
export function ChatbotWidget() {
  const { selectedId } = useWard();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-chatbot", handleToggle);
    return () => window.removeEventListener("toggle-chatbot", handleToggle);
  }, []);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [msgs, open]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    setError(null);
    const next: Msg[] = [...msgs, { role: "user" as const, content: message }];
    setMsgs(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          locationId: selectedId,
          history: next.slice(-6),
        }),
      });
      const rawText = await res.text();
      let data: { answer?: string; error?: string } = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          res.ok
            ? "Invalid response format from server."
            : `Server returned error (${res.status}): ${rawText.slice(0, 80) || "Unknown error"}`
        );
      }
      if (!res.ok) throw new Error(data.error || `Assistant unavailable (HTTP ${res.status})`);
      setMsgs([...next, { role: "assistant", content: data.answer ?? "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assistant unavailable");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <Card className="fixed top-[62px] right-3 sm:right-6 z-[70] flex max-h-[80vh] w-[min(94vw,420px)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl backdrop-blur-md">
      <CardHeader className="flex flex-row items-center gap-2 border-b bg-muted/30 py-3 px-4">
        <Bot className="h-5 w-5 text-red-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm font-bold flex items-center gap-1.5 leading-none">
            Ahvaan AI Assistant
          </CardTitle>
          <p className="text-[11px] text-muted-foreground truncate leading-snug">
            Citywide Telemetry & Microclimate Knowledge Base
          </p>
        </div>
        {selectedId !== null && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary">
            Ward {selectedId}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted"
          onClick={() => setOpen(false)}
          aria-label="Close Assistant"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
        {msgs.length === 0 && (
          <div className="space-y-3 p-1">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
              👋 Hello! I am your <strong>Ahvaan Heat Resilience Assistant</strong>.
              I have full real-time access to all 144 Kolkata wards, hourly microclimate metrics, and emergency heat protocols.
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Suggested Queries
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-border/70 bg-muted/40 p-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent hover:border-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm",
              m.role === "user"
                ? "self-end bg-red-600 font-medium text-white"
                : "self-start border border-border bg-muted/50 text-foreground",
            )}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="self-start flex items-center gap-1.5 rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Bot className="h-3.5 w-3.5 animate-pulse text-red-600" />
            Analyzing ward telemetry dataset…
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </CardContent>
      <form
        className="flex shrink-0 gap-2 border-t bg-card p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Kolkata heat risk, wards, or protocols…"
          maxLength={500}
          className="h-9 min-w-0 flex-1 rounded-xl border border-input bg-muted/30 px-3 text-xs placeholder:text-muted-foreground focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || sending}
          className="h-9 w-9 shrink-0 rounded-xl bg-red-600 text-white shadow hover:bg-red-700"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}
