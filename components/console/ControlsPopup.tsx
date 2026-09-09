"use client";

import { Layers, Filter, Map as MapIcon, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Flame, Thermometer, Sun, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export type MapLayer = "risk" | "thermal" | "wbgt" | "hi" | "exposure" | "vulnerability";

const LAYERS: Array<{ id: MapLayer; label: string; icon: LucideIcon; desc: string }> = [
  { id: "risk", label: "Composite Risk", icon: Flame, desc: "Overall 0–1" },
  { id: "thermal", label: "Thermal Stress", icon: Thermometer, desc: "WBGT+HI" },
  { id: "wbgt", label: "WBGT", icon: Sun, desc: "°C shade" },
  { id: "hi", label: "Heat Index", icon: Thermometer, desc: "°C feels-like" },
  { id: "exposure", label: "Exposure", icon: Users, desc: "Pop density" },
  { id: "vulnerability", label: "Vulnerability", icon: Shield, desc: "0–1" },
];

export function ControlsPopup({
  open,
  onClose,
  layer,
  onLayerChange,
  filters,
  onFilterChange,
}: {
  open: boolean;
  onClose: () => void;
  layer: MapLayer;
  onLayerChange: (l: MapLayer) => void;
  filters: { cats: Set<string>; popMin: number };
  onFilterChange: (f: { cats: Set<string>; popMin: number }) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/10"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="custom-scrollbar fixed inset-x-3 bottom-20 z-50 max-h-[65vh] overflow-y-auto overscroll-contain rounded-2xl border bg-card shadow-xl sm:left-auto sm:right-3 sm:w-[360px] sm:max-h-[72vh]"
            style={{ transformOrigin: "bottom right" }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-gradient-to-r from-card to-muted/20 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-extrabold"><Layers className="h-4 w-4" /> Map Controls</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} aria-label="Close controls">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3 p-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Layers</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-1.5 p-2 pt-0">
                  {LAYERS.map((l) => {
                    const Icon = l.icon;
                    return (
                      <button
                        key={l.id}
                        onClick={() => onLayerChange(l.id)}
                        className={cn("flex items-center gap-1.5 rounded-xl border px-2.5 py-2.5 text-left text-xs font-semibold transition-colors", layer === l.id ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-muted/40 hover:bg-accent")}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="leading-none">
                          {l.label}
                          <span className="block text-[10px] font-normal opacity-70">{l.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" /> Filters</CardTitle>
                    <button
                      onClick={() => onFilterChange({ cats: new Set(["LOW", "MODERATE", "HIGH", "VERY_HIGH"]), popMin: 0 })}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Reset
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-3 pt-0">
                  <div>
                    <p className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                      Risk category
                      <span className="text-[11px] font-normal tabular-nums">{filters.cats.size}/4 selected</span>
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {[
                        { id: "LOW", label: "Low", color: "#14b8a6", bg: "bg-teal-500/10 border-teal-500/20", dot: "bg-teal-500" },
                        { id: "MODERATE", label: "Moderate", color: "#eab308", bg: "bg-amber-500/10 border-amber-500/20", dot: "bg-amber-500" },
                        { id: "HIGH", label: "High", color: "#f97316", bg: "bg-orange-500/10 border-orange-500/20", dot: "bg-orange-500" },
                        { id: "VERY_HIGH", label: "Extreme", color: "#991b1b", bg: "bg-red-500/10 border-red-500/20", dot: "bg-red-600" },
                      ].map((c) => {
                        const active = filters.cats.has(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => {
                              const next = new Set(filters.cats);
                              if (active) next.delete(c.id); else next.add(c.id);
                              onFilterChange({ ...filters, cats: next });
                            }}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-all",
                              active ? "bg-foreground text-background border-foreground shadow-sm" : `hover:bg-accent ${c.bg}`
                            )}
                          >
                            <span className={cn("h-2.5 w-2.5 rounded-full", active ? "bg-background" : c.dot)} style={active ? undefined : { background: c.color }} />
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-muted-foreground">Min population</span>
                      <span className="tabular-nums text-primary">≥ {filters.popMin.toLocaleString("en-IN")}</span>
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground">0</span>
                      <input
                        type="range"
                        min={0}
                        max={50000}
                        step={2500}
                        value={filters.popMin}
                        onChange={(e) => onFilterChange({ ...filters, popMin: Number(e.target.value) })}
                        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                      />
                      <span className="text-[11px] text-muted-foreground">50k</span>
                    </div>
                    <div className="mt-1 flex h-1.5 gap-px overflow-hidden rounded-full opacity-60">
                      {[0.3, 0.5, 0.8, 1, 0.7, 0.4, 0.2].map((h, i) => (
                        <div key={i} className="flex-1 bg-primary/30" style={{ height: `${h * 100}%`, alignSelf: "end" }} />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
