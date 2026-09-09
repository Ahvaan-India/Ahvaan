"use client";

import { X, MapPin, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/console/RiskBadge";
import type { Telemetry } from "@/components/console/TelemetryPanel";
import type { MapWard } from "@/components/map/KolkataMap";
import type { AlertOption } from "@/components/console/SendAlertModal";

interface Props {
  open: boolean;
  onClose: () => void;
  wardId: number | null;
  ward: number | null;
  wardName: string | null;
  selectedCell: MapWard | null;
  telemetry: Telemetry | null;
  forecast: { days: Array<{ date: string; risk: number; category: string; tempMin: number; tempMax: number; wbgtMax?: number; heatIndexMax?: number; mortality?: { index: number; band: string } }> } | undefined;
  alertOptions: AlertOption[];
  onSendAlert: (id: number) => void;
  onAnalyticsOpen: () => void;
  onDownload: () => void;
  children: React.ReactNode;
}

export function WardPopup({
  open,
  onClose,
  wardId,
  ward,
  wardName,
  selectedCell,
  telemetry,
  onDownload,
  children,
}: Props) {
  if (!open || wardId === null) return null;

  return (
    <AnimatePresence>
      {open && wardId !== null && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/10"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            onClick={onClose}
          >
            <div
              className="relative flex max-h-[88vh] w-full max-w-[580px] flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_20px_60px_-12px_rgba(0,0,0,0.25)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-card px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-extrabold tracking-tight">
                      {ward !== null ? `Ward ${ward}` : `Location ${wardId}`}
                    </h2>
                    {telemetry?.risk && <RiskBadge category={telemetry.risk.category} />}
                  </div>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">Kolkata (M Corp.)</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" onClick={onDownload} aria-label="Download ward data" className="h-8 gap-1.5 rounded-full px-3 text-xs font-semibold">
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close popup" className="h-8 w-8 rounded-full">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="custom-scrollbar flex-1 overflow-y-auto overscroll-contain bg-background">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
