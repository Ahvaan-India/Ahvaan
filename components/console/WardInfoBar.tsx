"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Download, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StaticZone } from "@/lib/geo/zones";
import { zoneLabel } from "@/components/map/KolkataMap";

interface Props {
  zone: StaticZone | null;
  onClose: () => void;
  onDownload: () => void;
  children: React.ReactNode;
}

export function WardInfoBar({ zone, onClose, onDownload, children }: Props) {
  if (!zone) return null;

  return (
    <>
      {/* Desktop — wide floating card over the fullscreen map. All graphs
          and detail render inline (children); no footer navigation. */}
      <AnimatePresence>
        {zone && (
          <motion.aside
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-4 right-3 top-[68px] z-30 hidden w-[480px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl lg:flex"
          >
            <div className="flex items-center justify-between border-b bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-extrabold text-base truncate">{zoneLabel(zone)}</h2>
                </div>
                <p className="flex items-center gap-1 truncate text-xs font-normal text-primary"><MapPin className="h-3 w-3 text-primary" />{zone.district}</p>
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
        {zone && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-30 flex max-h-[70vh] flex-col overflow-hidden rounded-t-2xl border-t bg-card shadow-2xl lg:hidden"
          >
            <div className="flex shrink-0 items-center justify-between border-b p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-base truncate">{zone.name}</h2>
                </div>
                <p className="flex items-center gap-1 truncate text-xs font-normal text-primary"><MapPin className="h-3 w-3 text-primary" />{zone.district}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={onDownload} className="h-8 w-8"><Download className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

