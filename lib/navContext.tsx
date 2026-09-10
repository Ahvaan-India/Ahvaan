"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface NavContextType {
  navOpen: boolean;
  setNavOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
}

const NavContext = createContext<NavContextType | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  return <NavContext.Provider value={{ navOpen, setNavOpen }}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
