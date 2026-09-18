"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search, X, Menu, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNav } from "@/lib/navContext";
import {
  getWardDisplayName,
  getWardLocality,
  matchesWardQuery,
} from "@/lib/geo/wardNames";
import { APP_CONFIG } from "@/lib/config/appConfig";
import { useState, useMemo } from "react";

/**
 * Clean, minimal navbar — single 56px bar, no double rows.
 * Page nav lives in the sidebar; the bar holds brand, search (maps),
 * watch status and the alert action. Search sits in the flex flow
 * (never absolutely overlaid) so nothing can overlap on narrow screens.
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
  watchLabel?: string;
  syncedAt?: string | null;
  syncDetail?: string | null;
  timezone?: string;
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
  const isMap = pathname === "/maps";
  const [focused, setFocused] = useState(false);
  const { navOpen, setNavOpen } = useNav();

  const suggestions = useMemo(() => {
    if (!wards || !searchQuery?.trim()) return [];
    const q = searchQuery.trim();
    return wards
      .filter((w) =>
        matchesWardQuery(w.ward, w.wardName, getWardLocality(w.ward), q),
      )
      .slice(0, APP_CONFIG.search.maxSuggestions);
  }, [wards, searchQuery]);
  const showDropdown = focused && suggestions.length > 0 && isMap;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="relative mx-auto flex h-[56px] max-w-[1600px] items-center gap-2 px-2 sm:gap-3 sm:px-4">
        {/* LEFT: drawer toggler (mobile) + brand */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1 h-9 w-9 shrink-0 rounded-full lg:hidden"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Link
            href="/maps"
            className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
          >
            <img
              src={APP_CONFIG.logoPath}
              alt={`${APP_CONFIG.name} logo`}
              width={30}
              height={30}
              className="h-7 w-7 rounded-lg shadow-sm sm:h-8 sm:w-8"
            />
            <span className="hidden flex-col leading-none min-[400px]:flex">
              <span className="text-[13px] font-extrabold tracking-tight sm:text-[14px]">
                {APP_CONFIG.name}
              </span>
              <span className="text-[9px] font-semibold tracking-widest text-muted-foreground sm:text-[10px]">
                {APP_CONFIG.subtitle}
              </span>
            </span>
          </Link>
        </div>

        {/* CENTRE: search takes the flexible middle (never overlaid) */}
        {isMap && onSearchChange ? (
          <div className="hidden min-w-0 flex-1 justify-center px-1 sm:flex">
            <div className="relative flex w-full max-w-md items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 180)}
                placeholder={APP_CONFIG.search.placeholder}
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
                          <span className="block text-sm font-semibold leading-none">
                            {getWardDisplayName(w.ward, w.wardName)}
                          </span>
                          {loc && (
                            <span className="block text-xs text-muted-foreground">
                              {loc}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1" aria-hidden />
        )}

        {/* RIGHT SECTION: pinned right on all screens (ml-auto covers
            mobile, where the centre search is hidden and adds no flex) */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-chatbot"))}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-full border border-primary/20 bg-card px-3 text-xs font-bold text-foreground shadow-sm hover:bg-accent sm:px-3.5 sm:text-sm"
          >
            <Bot className="h-4 w-4 text-red-600" />
            <span className="hidden sm:inline">AI Assistant</span>
            <span className="sm:hidden">AI</span>
          </Button>
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
      {/* Mobile search - full-width below header, consistent */}
      {isMap && onSearchChange && (
        <div className="border-t bg-card px-3 py-2.5 sm:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 180)}
              placeholder="Search ward…"
              className="h-10 w-full rounded-xl border bg-muted/40 py-2 pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {searchQuery ? (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full hover:bg-muted"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {showDropdown && (
              <div className="absolute left-0 right-0 top-[48px] z-30 max-h-[320px] overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">
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
                        <span className="block text-sm font-semibold leading-none">
                          {getWardDisplayName(w.ward, w.wardName)}
                        </span>
                        {loc && (
                          <span className="block text-xs text-muted-foreground">
                            {loc}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
