"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface WardContextType {
  /** Selected zone unique_location_id (heatmaps are zone-addressed). */
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

const WardContext = createContext<WardContextType | null>(null);

export function WardProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return <WardContext.Provider value={{ selectedId, setSelectedId }}>{children}</WardContext.Provider>;
}

export function useWard() {
  const ctx = useContext(WardContext);
  if (!ctx) throw new Error("useWard must be used within WardProvider");
  return ctx;
}
