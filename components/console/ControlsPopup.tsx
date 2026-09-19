"use client";

import { Layers, Filter, X, Check, Flame, Thermometer, Sun, Wind, Droplet, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export type MapLayer =
  | "thermal"
  | "wbgt"
  | "hi"
  | "utci"
  | "temp"
  | "humidity"
  | "wind"
  | "solar";

const LAYERS: Array<{ id: MapLayer; label: string; icon: LucideIcon; desc: string }> = [
  { id: "thermal", label: "HTSI / Thermal", icon: Thermometer, desc: "Heat stress index (0–100)" },
  { id: "wbgt", label: "WBGT Index", icon: Sun, desc: "Wet-bulb globe temp (°C)" },
  { id: "hi", label: "Heat Index", icon: Flame, desc: "Apparent temperature (°C)" },
  { id: "utci", label: "UTCI Index", icon: Sun, desc: "Universal climate index (°C)" },
  { id: "temp", label: "Temperature", icon: Thermometer, desc: "Ambient temp (°C)" },
  { id: "humidity", label: "Humidity", icon: Droplet, desc: "Relative humidity (%)" },
  { id: "wind", label: "Wind Speed", icon: Wind, desc: "Velocity (m/s)" },
  { id: "solar", label: "Solar Radiation", icon: Sun, desc: "Irradiance (W/m²)" },
];

const CATEGORY_FILTERS = [
  { id: "LOW", label: "Low", color: "#14b8a6", bg: "bg-teal-500/15 border-teal-500/30 text-teal-700 dark:text-teal-300" },
  { id: "MODERATE", label: "Moderate", color: "#eab308", bg: "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300" },
  { id: "HIGH", label: "High", color: "#ef4444", bg: "bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-300" },
  { id: "VERY_HIGH", label: "Extreme", color: "#991b1b", bg: "bg-red-900/15 border-red-900/30 text-red-800 dark:text-red-300" },
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
  const activeLayerObj = LAYERS.find((l) => l.id === layer) ?? LAYERS[0];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Subtle backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/30 backdrop-blur-xs"
            onClick={onClose}
          />

          {/* Floating Glassmorphic Control Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="custom-scrollbar fixed inset-x-3 bottom-16 z-50 max-h-[75vh] overflow-y-auto overscroll-contain rounded-2xl border border-border/80 bg-card/95 p-0 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-4 sm:w-[380px] sm:max-h-[80vh]"
            style={{ transformOrigin: "bottom right" }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight">Map Layers & Filters</h2>
                  <p className="text-[11px] text-muted-foreground">Active: <span className="font-semibold text-foreground">{activeLayerObj.label}</span></p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-muted"
                onClick={onClose}
                aria-label="Close controls"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4 p-4">
              {/* Layers Selection */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" /> Visual Layers
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {LAYERS.map((l) => {
                    const Icon = l.icon;
                    const selected = layer === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => onLayerChange(l.id)}
                        className={cn(
                          "relative flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all duration-150",
                          selected
                            ? "border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/40"
                            : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                          {selected && (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-2.5 w-2.5 stroke-[3]" />
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold leading-tight">{l.label}</p>
                          <p className="mt-0.5 text-[10px] font-medium leading-tight opacity-75">{l.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filters Card */}
              <Card className="border-border/60 bg-muted/20 shadow-none">
                <CardContent className="space-y-4 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Filter className="h-3.5 w-3.5 text-primary" /> Ward Filter
                    </span>
                    <button
                      onClick={() =>
                        onFilterChange({
                          cats: new Set(["LOW", "MODERATE", "HIGH", "VERY_HIGH"]),
                          popMin: 0,
                        })
                      }
                      className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" /> Reset
                    </button>
                  </div>

                  {/* Category Pills */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-2">
                      <span>Risk Levels</span>
                      <span className="tabular-nums text-foreground text-[11px] font-bold">
                        {filters.cats.size}/4 active
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {CATEGORY_FILTERS.map((c) => {
                        const active = filters.cats.has(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => {
                              const next = new Set(filters.cats);
                              if (active) next.delete(c.id);
                              else next.add(c.id);
                              onFilterChange({ ...filters, cats: next });
                            }}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-bold transition-all",
                              active
                                ? `${c.bg} shadow-xs ring-1 ring-border/40`
                                : "border-border/40 bg-card/60 text-muted-foreground hover:bg-muted opacity-60"
                            )}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: c.color }}
                            />
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Population Slider */}
                  <div className="rounded-xl border border-border/60 bg-card/80 p-3">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-muted-foreground">Min Population</span>
                      <span className="tabular-nums font-bold text-primary">
                        ≥ {filters.popMin.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3">
                      <span className="text-[10px] font-bold text-muted-foreground">0</span>
                      <input
                        type="range"
                        min={0}
                        max={50000}
                        step={2500}
                        value={filters.popMin}
                        onChange={(e) =>
                          onFilterChange({ ...filters, popMin: Number(e.target.value) })
                        }
                        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary focus:outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
                      />
                      <span className="text-[10px] font-bold text-muted-foreground">50k</span>
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
