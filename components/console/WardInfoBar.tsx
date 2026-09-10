"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Download, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/console/RiskBadge";
import { getWardLocality } from "@/lib/geo/wardNames";
import type { Telemetry } from "@/components/console/TelemetryPanel";
import type { MapWard } from "@/components/map/KolkataMap";

interface Props {
  selectedId: number | null;
  selectedCell: MapWard | null;
  telemetry: Telemetry | null;
  forecast: any;
  onClose: () => void;
  onDownload: () => void;
  children: React.ReactNode;
}

export function WardInfoBar({ selectedId, selectedCell, telemetry, onClose, onDownload, children }: Props) {
  if (!selectedId) return null;

  const ward = selectedCell?.ward ?? (telemetry as any)?.ward ?? null;
  const locality = getWardLocality(ward);

  return (
    <>
      {/* Desktop - right rail */}
      <AnimatePresence>
        {selectedId && (
          <motion.aside
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="hidden w-[420px] shrink-0 flex-col border-l bg-card lg:flex"
          >
            <div className="flex items-center justify-between border-b bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-extrabold">Ward {ward ?? selectedId}</h2>
                  {telemetry?.risk && <RiskBadge category={telemetry.risk.category} />}
                </div>
                {locality ? (
                  <p className="flex items-center gap-1 truncate text-xs font-normal text-primary"><MapPin className="h-3 w-3 text-primary" />{locality}</p>
                ) : (
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3" />Kolkata (M Corp.)</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={onDownload} className="h-8 w-8" aria-label="Download"><Download className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" aria-label="Close"><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="custom-scrollbar flex-1 overflow-y-auto p-4">{children}</div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile - bottom sheet */}
      <AnimatePresence>
        {selectedId && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-hidden rounded-t-2xl border-t bg-card shadow-2xl lg:hidden"
          >
            <div className="flex items-center justify-between border-b p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold">Ward {ward ?? selectedId}</h2>
                  {telemetry?.risk && <RiskBadge category={telemetry.risk.category} />}
                </div>
                {locality ? (
                  <p className="flex items-center gap-1 truncate text-xs font-normal text-primary"><MapPin className="h-3 w-3 text-primary" />{locality}</p>
                ) : (
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3" />Kolkata (M Corp.)</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={onDownload} className="h-8 w-8"><Download className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="custom-scrollbar max-h-[60vh] overflow-y-auto p-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
