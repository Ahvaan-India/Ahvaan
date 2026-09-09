"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalyticsView } from "./AnalyticsView";
import { WardAnalysis } from "./WardAnalysis";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  summary: {
    active: number;
    extreme: number;
    high: number;
    moderate: number;
    wards: number;
    metroHeatLoad: number;
  } | null;
  wards: Array<{
    ward: number | null;
    wardId: number;
    riskScore: number | null;
    category: string | null;
    wbgt: number | null;
    population: number | null;
    exposure?: number | null;
    vulnerability?: number | null;
    thermal?: number | null;
  }>;
  selectedWardId: number | null;
  selectedWard: number | null;
}

export function AnalyticsModal({
  open,
  onClose,
  summary,
  wards,
  selectedWardId,
  selectedWard,
}: Props) {
  const [tab, setTab] = useState<"city" | "ward">("city");
  // ESC to close + lock body scroll while open + force Recharts resize on mobile
  useEffect(() => {
    if (!open) return;
    // When a ward is selected, default to ward tab for faster deep-dive
    if (selectedWardId) setTab("ward");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    const prevTouch = (document.body.style as unknown as Record<string, string>)
      .webkitOverflowScrolling;
    document.body.style.overflow = "hidden";
    // Fix for iOS: prevent background scroll
    document.documentElement.style.overflow = "hidden";
    // Force Recharts to recalc after modal animation completes (mobile width=0 bug)
    const t1 = setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
    const t2 = setTimeout(() => window.dispatchEvent(new Event("resize")), 400);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overflow = "";
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex bg-black/50 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-background sm:mx-auto sm:h-auto sm:max-h-[90vh] sm:max-w-[1280px] sm:rounded-2xl sm:border sm:shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b bg-card px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-base font-extrabold">Visual Analysis</h2>
                <div className="mt-1 flex gap-1">
                  <button
                    onClick={() => setTab("city")}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      tab === "city"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    Full City
                  </button>
                  <button
                    onClick={() => setTab("ward")}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      tab === "ward"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    Ward
                  </button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close analytics"
                className="h-11 w-11 shrink-0 rounded-full sm:h-9 sm:w-9"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background p-3 sm:p-4 lg:p-6">
              <div className="min-w-0 w-full">
                {tab === "city" ? (
                  <AnalyticsView summary={summary} wards={wards} />
                ) : (
                  <WardAnalysis wardId={selectedWardId} ward={selectedWard} />
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
