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
  "What is the heat risk in this ward?",
  "What should I do in this heat?",
  "How does Ahvaan work?",
];

/**
 * Floating Ahvaan Assistant (Cloudflare Workers AI). Mounted once in the
 * root layout so it is available on every page; it follows the globally
 * selected ward for grounded answers. Stateless — history lives only in
 * this tab, nothing is stored server-side.
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Assistant unavailable");
      setMsgs([...next, { role: "assistant", content: data.answer ?? "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assistant unavailable");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open Ahvaan Assistant"
        className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full bg-red-600 text-white shadow-xl hover:bg-red-700"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </Button>
      {open && (
        <Card className="fixed bottom-[76px] right-5 z-50 flex max-h-[70vh] w-[min(92vw,380px)] flex-col overflow-hidden shadow-2xl">
          <CardHeader className="flex flex-row items-center gap-2 border-b py-3">
            <Bot className="h-4 w-4 text-red-600" />
            <CardTitle className="text-sm">Ahvaan Assistant</CardTitle>
            {selectedId !== null && (
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                Ward {selectedId}
              </span>
            )}
          </CardHeader>
          <CardContent className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Ask about ward heat risk, safety steps, or how Ahvaan works.
                  Answers use live ward data only.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
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
                  "max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm",
                  m.role === "user"
                    ? "self-end bg-red-600 text-white"
                    : "self-start bg-muted text-foreground",
                )}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <p className="self-start text-xs text-muted-foreground">Thinking…</p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div ref={bottomRef} />
          </CardContent>
          <form
            className="flex shrink-0 gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about heat risk…"
              maxLength={500}
              className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sending}
              className="h-9 w-9 shrink-0 bg-red-600 text-white hover:bg-red-700"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
