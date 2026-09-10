"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface WardContextType {
  selectedId: number | null;
  setSelectedId: (id: number | null) => void;
}

const WardContext = createContext<WardContextType | null>(null);

export function WardProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  return <WardContext.Provider value={{ selectedId, setSelectedId }}>{children}</WardContext.Provider>;
}

export function useWard() {
  const ctx = useContext(WardContext);
  if (!ctx) throw new Error("useWard must be used within WardProvider");
  return ctx;
}
