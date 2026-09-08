"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = () => setIsMobile(m.matches);
    handler();
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

export function useOptimizedMotion() {
  const prefersReduced = useReducedMotion();
  const isMobile = useIsMobile();
  const reduce = !!prefersReduced || isMobile;
  return { isMobile, reduceMotion: reduce };
}
