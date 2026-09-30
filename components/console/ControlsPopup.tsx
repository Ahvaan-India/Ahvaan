"use client";

import {
  Layers,
  X,
  Check,
  Thermometer,
  ThermometerSun,
  Sun,
  Wind,
  Droplet,
  Droplets,
  ShieldAlert,
  Users,
  Flame,
  Globe,
  Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export type MapLayer =
  | "risk"
  | "htsi"
  | "wbgt"
  | "hi"
  | "utci"
  | "wbt"
  | "temp"
  | "humidity"
  | "wind"
  | "solar"
  | "vulnerability";

export interface LayerMeta {
  id: MapLayer;
  label: string;
  icon: LucideIcon;
  desc: string;
  category: "INDEX" | "WEATHER";
  colorClass: string;
}

const LAYERS: LayerMeta[] = [
  { id: "risk", label: "Heat Risk", icon: ShieldAlert, desc: "Population-weighted risk index", category: "INDEX", colorClass: "text-red-500" },
  { id: "htsi", label: "HTSI", icon: Flame, desc: "Heat Stress Index (0.0–1.0)", category: "INDEX", colorClass: "text-orange-500" },
  { id: "wbgt", label: "WBGT", icon: Sun, desc: "Wet-bulb globe temp (°C)", category: "INDEX", colorClass: "text-amber-500" },
  { id: "hi", label: "Heat Index", icon: ThermometerSun, desc: "Apparent temperature (°C)", category: "INDEX", colorClass: "text-rose-500" },
  { id: "utci", label: "UTCI", icon: Globe, desc: "Universal thermal climate (°C)", category: "INDEX", colorClass: "text-indigo-500" },
  { id: "wbt", label: "WBT", icon: Droplets, desc: "Wet-bulb temperature (°C)", category: "INDEX", colorClass: "text-teal-500" },
  { id: "vulnerability", label: "Vulnerability", icon: Users, desc: "Socioeconomic index (0.0–1.0)", category: "INDEX", colorClass: "text-violet-500" },

  { id: "temp", label: "Temperature", icon: Thermometer, desc: "Dry bulb ambient temp (°C)", category: "WEATHER", colorClass: "text-orange-500" },
  { id: "humidity", label: "Humidity", icon: Droplet, desc: "Relative humidity (%)", category: "WEATHER", colorClass: "text-sky-500" },
  { id: "wind", label: "Wind Speed", icon: Wind, desc: "Wind velocity (m/s)", category: "WEATHER", colorClass: "text-emerald-500" },
  { id: "solar", label: "Solar Radiation", icon: Sun, desc: "Shortwave irradiance (W/m²)", category: "WEATHER", colorClass: "text-yellow-500" },
];

export function ControlsPopup({
  open,
  onClose,
  layer,
  onLayerChange,
  gradientEnabled,
  onGradientToggle,
}: {
  open: boolean;
  onClose: () => void;
  layer: MapLayer;
  onLayerChange: (l: MapLayer) => void;
  gradientEnabled: boolean;
  onGradientToggle: (enabled: boolean) => void;
}) {
  const activeLayerObj = LAYERS.find((l) => l.id === layer) ?? LAYERS[0];
  const indexLayers = LAYERS.filter((l) => l.category === "INDEX");
  const weatherLayers = LAYERS.filter((l) => l.category === "WEATHER");

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/30 backdrop-blur-xs"
            onClick={onClose}
          />

          {/* Controls Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="custom-scrollbar fixed inset-x-3 bottom-16 z-50 max-h-[80vh] overflow-y-auto overscroll-contain rounded-3xl border border-border/80 bg-card/95 p-0 shadow-2xl backdrop-blur-2xl sm:left-3 sm:right-auto sm:bottom-[100px] sm:w-[420px] sm:max-h-[82vh]"
            style={{ transformOrigin: "bottom left" }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card/95 px-5 py-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
                  <Layers className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold tracking-tight text-foreground">Map Layers & Controls</h2>
                  <p className="text-xs text-muted-foreground">
                    Active: <span className="font-bold text-primary">{activeLayerObj.label}</span>
                  </p>
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
              {/* Indices & Risk Models */}
              <div>
                <span className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground">
                  <Activity className="h-3.5 w-3.5 text-primary" /> Risk Models & Indices
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {indexLayers.map((l) => {
                    const Icon = l.icon;
                    const selected = layer === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => onLayerChange(l.id)}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all duration-150",
                          selected
                            ? "border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/40"
                            : "border-border/60 bg-card hover:border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/60",
                            selected && "bg-primary/20",
                          )}
                        >
                          <Icon className={cn("h-4 w-4", l.colorClass)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold leading-tight text-foreground truncate">{l.label}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{l.desc}</p>
                        </div>
                        {selected && (
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Weather Drivers */}
              <div>
                <span className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground">
                  <Sun className="h-3.5 w-3.5 text-amber-500" /> Weather Drivers
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {weatherLayers.map((l) => {
                    const Icon = l.icon;
                    const selected = layer === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => onLayerChange(l.id)}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all duration-150",
                          selected
                            ? "border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/40"
                            : "border-border/60 bg-card hover:border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/60",
                            selected && "bg-primary/20",
                          )}
                        >
                          <Icon className={cn("h-4 w-4", l.colorClass)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold leading-tight text-foreground truncate">{l.label}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{l.desc}</p>
                        </div>
                        {selected && (
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Heatpoint Gradient Mode Toggle */}
              <Card className="border-border/60 bg-muted/20 shadow-none rounded-2xl">
                <CardContent className="flex items-center justify-between gap-2 p-3.5">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Flame className="h-4 w-4 text-orange-500" /> Heatpoint Gradient
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Render high-density tile glows</p>
                  </div>

                  <div className="flex overflow-hidden rounded-full border border-border/80 bg-card p-0.5 text-xs font-bold shadow-inner">
                    <button
                      onClick={() => onGradientToggle(false)}
                      className={cn(
                        "rounded-full px-3.5 py-1 transition-all duration-150",
                        !gradientEnabled
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-pressed={!gradientEnabled}
                    >
                      OFF
                    </button>
                    <button
                      onClick={() => onGradientToggle(true)}
                      className={cn(
                        "rounded-full px-3.5 py-1 transition-all duration-150",
                        gradientEnabled
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-pressed={gradientEnabled}
                    >
                      ON
                    </button>
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
