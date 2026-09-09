"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BarChart3, Map, Search, Flame, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  getWardDisplayName,
  getWardLocality,
  matchesWardQuery,
} from "@/lib/geo/wardNames";
import { useState, useMemo } from "react";

const NAV = [
  { label: "Map", icon: Map, href: "/", isMap: true },
  {
    label: "Analytics",
    icon: BarChart3,
    href: "#analytics",
    action: "analytics" as const,
  },
];

/**
 * Clean, minimal navbar  single 56px bar, no double rows.
 * Center search (map page) is Google-Maps-like, with clear action.
 */
export function TopBar({
  watchLabel,
  syncedAt,
  syncDetail,
  timezone,
  onSendAlert,
  searchQuery,
  onSearchChange,
  onAnalyticsOpen,
  wards,
  onSelectWard,
}: {
  watchLabel: string;
  syncedAt: string | null;
  syncDetail: string | null;
  timezone: string;
  onSendAlert: () => void;
  searchQuery?: string;
  onSearchChange?: (v: string) => void;
  onAnalyticsOpen?: () => void;
  wards?: Array<{
    ward: number | null;
    wardName: string | null;
    wardId: number;
  }>;
  onSelectWard?: (wardId: number) => void;
}) {
  const pathname = usePathname();
  const isMap = pathname === "/";
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    if (!wards || !searchQuery?.trim()) return [];
    const q = searchQuery.trim();
    return wards
      .filter((w) =>
        matchesWardQuery(w.ward, w.wardName, getWardLocality(w.ward), q),
      )
      .slice(0, 8);
  }, [wards, searchQuery]);
  const showDropdown = focused && suggestions.length > 0 && isMap;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="relative mx-auto flex h-[56px] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left: Brand + Nav */}
        <div className="flex items-center gap-3 justify-self-start">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
          >
            <img src="/logo.svg" alt="Ahvaan logo" width={32} height={32} className="h-8 w-8 rounded-lg shadow-sm" />
            <span className="hidden sm:flex flex-col leading-none">
              <span className="text-[14px] font-extrabold tracking-tight">Ahvaan</span>
              <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">KOLKATA</span>
            </span>
          </Link>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) => {
              const isAnalytics = "action" in n;
              if (isAnalytics) {
                return (
                  <button
                    key={n.label}
                    onClick={onAnalyticsOpen}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <n.icon className="h-3.5 w-3.5" />
                    {n.label}
                  </button>
                );
              }
              return (
                <Link
                  key={n.label}
                  href={n.href}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm"
                >
                  <n.icon className="h-3.5 w-3.5" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Centre: Search — truly centred via absolute, always visible */}
        {isMap && onSearchChange ? (
          <div className="absolute left-1/2 top-1/2 flex min-w-0 max-w-[280px] -translate-x-1/2 -translate-y-1/2 sm:max-w-md sm:w-full">
            <div className="relative flex w-full max-w-md items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 180)}
                placeholder="Search ward…"
                className="h-9 w-full rounded-full border bg-muted/40 py-2 pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery ? (
                <button
                  onClick={() => onSearchChange("")}
                  className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full hover:bg-muted"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {showDropdown && (
                <div className="absolute left-0 right-0 top-[44px] z-30 max-h-[320px] overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">
                  {suggestions.map((w) => {
                    const loc = getWardLocality(w.ward);
                    return (
                      <button
                        key={w.wardId}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelectWard?.(w.wardId);
                          setFocused(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-accent"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                          {w.ward ?? "·"}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-none">{getWardDisplayName(w.ward, w.wardName)}</span>
                          {loc && <span className="block text-xs text-muted-foreground">{loc}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Right cluster */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 xl:flex">
            <span className="rounded-full bg-orange-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {watchLabel}
            </span>
            {syncedAt && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span className="tabular-nums hidden lg:inline">
                  {new Date(syncedAt).toLocaleTimeString("en-IN", {
                    timeZone: timezone,
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {syncDetail && (
                  <span className="tabular-nums text-muted-foreground/70">
                    · {syncDetail}
                  </span>
                )}
              </span>
            )}
          </div>

          <ThemeToggle />

          <Button
            onClick={onSendAlert}
            size="sm"
            className="h-9 rounded-full bg-red-600 px-3.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 sm:px-4 sm:text-sm"
          >
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Send Alert</span>
            <span className="sm:hidden">Alert</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
