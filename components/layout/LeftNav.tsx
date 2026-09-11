"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, BarChart3, Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useNav } from "@/lib/navContext";

const NAV = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "Maps", href: "/maps", icon: Map },
  { label: "Analysis", href: "/analysis", icon: BarChart3 },
  { label: "Alerts & Actions", href: "/alerts", icon: Bell },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((n) => {
        const active =
          pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </>
  );
}

/** Sidebar footer: branding on the left, bare theme toggler on the right. */
function SideFooter() {
  return (
    <div className="flex items-center justify-between border-t p-3">
      <div className="px-1 text-xs text-muted-foreground">
        <p className="font-semibold">Ahvaan</p>
        <p>Kolkata heat-risk</p>
      </div>
      <ThemeToggle />
    </div>
  );
}

export function LeftNav() {
  const { navOpen: open, setNavOpen: setOpen } = useNav();

  return (
    <>
      {/* Mobile: backdrop + drawer (navbar z-40, drawer above) */}
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[70] flex w-[260px] flex-col border-r bg-card shadow-2xl transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b px-3 py-3">
          <Link
            href="/maps"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2"
          >
            <img
              src="/logo.svg"
              alt="Ahvaan logo"
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg shadow-sm"
            />
            <span className="flex flex-col leading-none">
              <span className="text-[14px] font-extrabold tracking-tight">
                Ahvaan
              </span>
              <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                KOLKATA
              </span>
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
        <SideFooter />
      </aside>

      {/* Desktop: persistent sidebar with nav + theme */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card lg:flex">
        <nav className="flex-1 space-y-1 p-3">
          <NavLinks />
        </nav>
        <SideFooter />
      </aside>
    </>
  );
}
