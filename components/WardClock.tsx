"use client";

import { useEffect, useState } from "react";
import {
  formatDateInTimezone,
  formatInTimezone,
  utcOffsetLabel,
} from "@/lib/geo/timezone";

/**
 * Live ward-local clock for the location bar. Ticks every second in the
 * ward's IANA timezone (Asia/Kolkata for all Kolkata wards). The timezone
 * is derived per-ward by the API (RiskResponse.meta.timezone), not from
 * the viewer's browser, so a Delhi viewer still sees Kolkata wall-time.
 */
export function WardClock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <span title={`Timezone: ${timeZone}`}>
      {formatDateInTimezone(now, timeZone)} ·{" "}
      {formatInTimezone(now, timeZone)} ({utcOffsetLabel(timeZone, now)})
    </span>
  );
}
