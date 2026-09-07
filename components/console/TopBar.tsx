"use client";

import { Bell, LayoutDashboard, BarChart3, Map, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WardClock } from "@/components/WardClock";

const NAV = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#alerts", label: "Alerts", icon: Bell },
  { href: "#trajectory", label: "Analytics", icon: BarChart3 },
  { href: "#telemetry", label: "Wards", icon: Map },
];

/**
 * Top Navbar: Brand logo + Section Navigation + Watch Badge & Sync Status + Ward Clock + Theme Toggle + WhatsApp Action.
 * Cleanly aligned with Flexbox, fixed height, responsive breakpoints, and no line wraps.
 */
export function TopBar({
  watchLabel,
  syncedAt,
  syncDetail,
  timezone,
  onSendAlert,
}: {
  watchLabel: string;
  syncedAt: string | null;
  syncDetail: string | null;
  timezone: string;
  onSendAlert: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
        {/* Left Section: Brand Logo & Main Navigation */}
        <div className="flex items-center gap-4 sm:gap-6">
          <a
            href="#"
            className="flex items-center gap-2 text-base font-extrabold tracking-tight text-foreground hover:opacity-90 transition-opacity"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white font-black text-sm shadow-sm">
              HW
            </span>
            <span className="flex items-center gap-1.5">
              <span>HeatWatch</span>
              <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 border border-red-500/20">
                Kolkata
              </span>
            </span>
          </a>

          <div className="hidden md:block h-4 w-[1px] bg-border" />

          {/* Desktop Section Links */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Sections">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <n.icon className="h-3.5 w-3.5" aria-hidden />
                <span>{n.label}</span>
              </a>
            ))}
          </nav>
        </div>

        {/* Center Section: Watch Level Badge & Live Sync Status (Visible on larger screens) */}
        <div className="hidden lg:flex items-center gap-3 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs">
          <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
            {watchLabel}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>
              {syncedAt
                ? `Updated ${new Date(syncedAt).toLocaleTimeString("en-IN", {
                    timeZone: timezone,
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Syncing…"}
            </span>
          </span>
          {syncDetail && <span className="tabular-nums text-muted-foreground/80">({syncDetail})</span>}
        </div>

        {/* Right Section: Ward Clock, Theme Toggle & WhatsApp Action */}
        <div className="flex items-center gap-2.5">
          {/* Live Ward Clock */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1.5 text-xs font-mono tabular-nums text-muted-foreground shadow-xs">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
            <WardClock timeZone={timezone} />
          </div>

          {/* Theme Mode Switcher */}
          <ThemeToggle />

          {/* WhatsApp Alert Button */}
          <Button
            onClick={onSendAlert}
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-2 shadow-xs rounded-lg h-9 px-3.5 transition-transform active:scale-95"
          >
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Send WhatsApp Alert</span>
            <span className="sm:hidden">Alert</span>
          </Button>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar (visible below header on small screens) */}
      <div className="flex md:hidden items-center justify-around border-t border-border/60 bg-background/80 px-2 py-1.5">
        {NAV.map((n) => (
          <a
            key={n.label}
            href={n.href}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <n.icon className="h-3.5 w-3.5" aria-hidden />
            <span>{n.label}</span>
          </a>
        ))}
      </div>
    </header>
  );
}
