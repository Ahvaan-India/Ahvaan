"use client";

import { Layers, Filter, Map as MapIcon, EyeOff, Flame, Thermometer, Sun, Wind, Droplet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RISK_COLORS } from "@/components/map/KolkataMap";

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
  { id: "thermal", label: "HTSI / Thermal", icon: Thermometer, desc: "0–100" },
  { id: "wbgt", label: "WBGT", icon: Sun, desc: "°C shade" },
  { id: "hi", label: "Heat Index", icon: Flame, desc: "°C feels-like" },
  { id: "utci", label: "UTCI", icon: Sun, desc: "°C climate" },
  { id: "temp", label: "Temp", icon: Thermometer, desc: "°C air" },
  { id: "humidity", label: "Humidity", icon: Droplet, desc: "% relative" },
  { id: "wind", label: "Wind", icon: Wind, desc: "m/s speed" },
  { id: "solar", label: "Solar", icon: Sun, desc: "W/m² radiation" },
];

export function LeftSidebar({
  layer,
  onLayerChange,
  filters,
  onFilterChange,
  legend,
  collapsed,
  onCollapsedChange,
}: {
  layer: MapLayer;
  onLayerChange: (l: MapLayer) => void;
  filters: { cats: Set<string>; popMin: number };
  onFilterChange: (f: { cats: Set<string>; popMin: number }) => void;
  legend: { title: string; colors: string[]; labels: string[] };
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
}) {
  if (collapsed) {
    return (
      <div className="hidden w-12 shrink-0 flex-col items-center gap-2 border-r bg-card py-3 lg:flex">
        <Button variant="ghost" size="icon" onClick={() => onCollapsedChange(false)} aria-label="Expand layers">
          <Layers className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onCollapsedChange(false)} aria-label="Expand filters">
          <Filter className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r bg-card p-3 lg:flex">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold flex items-center gap-1.5"><Layers className="h-4 w-4" /> Layers</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onCollapsedChange(true)} aria-label="Collapse">
          <EyeOff className="h-4 w-4" />
        </Button>
      </div>
      <Card>
        <CardContent className="grid grid-cols-2 gap-1.5 p-2">
          {LAYERS.map((l) => {
            const Icon = l.icon;
            return (
              <button
                key={l.id}
                onClick={() => onLayerChange(l.id)}
                className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold", layer === l.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-accent")}
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5"><Filter className="h-4 w-4" /> Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Risk category</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {["LOW", "MODERATE", "HIGH", "VERY_HIGH"].map((c) => {
                const active = filters.cats.has(c);
                return (
                  <button
                    key={c}
                    onClick={() => {
                      const next = new Set(filters.cats);
                      if (active) next.delete(c); else next.add(c);
                      onFilterChange({ ...filters, cats: next });
                    }}
                    className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", active ? "bg-foreground text-background" : "bg-muted hover:bg-accent")}
                  >
                    {c === "VERY_HIGH" ? "Extreme" : c}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Min population</p>
            <input
              type="range"
              min={0}
              max={50000}
              step={5000}
              value={filters.popMin}
              onChange={(e) => onFilterChange({ ...filters, popMin: Number(e.target.value) })}
              className="mt-1 w-full"
            />
            <p className="text-xs tabular-nums text-muted-foreground">≥ {filters.popMin.toLocaleString("en-IN")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5"><MapIcon className="h-4 w-4" /> Legend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs font-semibold">{legend.title}</p>
          <div className="flex items-center gap-1">
            {legend.colors.map((c) => (
              <span key={c} className="h-3 flex-1 rounded" style={{ background: c }} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{legend.labels[0]}</span>
            <span>{legend.labels[legend.labels.length - 1]}</span>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
