"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Download, MapPin, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StaticZone } from "@/lib/geo/zones";
import { zoneLabel } from "@/components/map/KolkataMap";

interface Props {
  zone: StaticZone | null;
  onClose: () => void;
  onDownload: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  children: React.ReactNode;
}

export function WardInfoBar({
  zone,
  onClose,
  onDownload,
  isExpanded = false,
  onToggleExpand,
  children,
}: Props) {
  if (!zone) return null;

  return (
    <>
      {/* Desktop — wide floating card over the fullscreen map. All graphs
          and detail render inline (children); expandable for full graph analytics. */}
      <AnimatePresence>
        {zone && (
          <motion.aside
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`fixed bottom-4 right-3 top-[68px] z-30 hidden ${
              isExpanded ? "w-[880px]" : "w-[480px]"
            } max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl transition-[width] duration-300 lg:flex`}
          >
            {/* Left Edge Expand Arrow Toggle Button */}
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-50 flex h-14 w-6 items-center justify-center rounded-r-xl border-y border-r border-border/80 bg-card shadow-xl hover:bg-muted text-foreground transition-all duration-200"
                title={isExpanded ? "Collapse side panel" : "Expand all graph analytics"}
                aria-label={isExpanded ? "Collapse side panel" : "Expand all graph analytics"}
              >
                {isExpanded ? (
                  <ChevronRight className="h-4 w-4 text-primary" />
                ) : (
                  <ChevronLeft className="h-4 w-4 text-primary" />
                )}
              </button>
            )}

            <div className="flex items-center justify-between border-b bg-card p-4 pl-7">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-extrabold text-base truncate">{zoneLabel(zone)}</h2>
                </div>
                <p className="flex items-center gap-1 truncate text-xs font-normal text-primary">
                  <MapPin className="h-3 w-3 text-primary" />
                  {zone.district}
                </p>
              </div>
              <div className="flex gap-1">
                {onToggleExpand && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleExpand}
                    className="h-8 w-8 text-foreground hover:text-primary"
                    title={isExpanded ? "Collapse panel" : "Expand panel"}
                    aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
                  >
                    {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={onDownload} className="h-8 w-8" aria-label="Download">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
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
                <p className="flex items-center gap-1 truncate text-xs font-normal text-primary">
                  <MapPin className="h-3 w-3 text-primary" />
                  {zone.district}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={onDownload} className="h-8 w-8">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

