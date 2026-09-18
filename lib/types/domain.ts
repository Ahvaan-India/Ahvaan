/**
 * Consolidated Domain Models & TypeScript Contracts.
 */

import type { RiskCategoryKey } from "@/lib/enums/risk.enum";
import type { AlertLevel } from "@/lib/enums/alert.enum";
import type { DeltaDir } from "@/lib/console";

export interface WardLocation {
  wardId: number;
  ward: number | null;
  wardName: string | null;
  district?: string | null;
  lat?: number | null;
  long?: number | null;
}

export interface RiskSummary {
  value: number;
  category: RiskCategoryKey | string;
  displayCategory: string;
  thermal: number;
  exposure: number;
  vulnerability: number;
  persistence: number;
  recovery: number;
  wbgt: number;
  heatIndex: number;
  utci: number | null;
  confidence: number;
  computedAt: string;
}

export interface MacroTelemetry {
  temp: number | null;
  realFeel: number | null;
  humidity: number | null;
  wind: number | null;
  solar: number | null;
  timestamp: string | null;
  qualifiers: {
    temp: string | null;
    humidity: string | null;
    wind: string | null;
    solar: string | null;
  };
  deltas: {
    temp: DeltaDir;
    humidity: DeltaDir;
    wind: DeltaDir;
    solar: DeltaDir;
  };
}

export interface WardDemographics {
  totalPopulation: number;
  elderlyPct: number;
  elderlyCutoff: string;
  elderlyDefaulted: boolean;
  childrenPct: number;
  outdoorWorkerPct: number;
  informalIndex: number;
  informalDefaulted: boolean;
  settlementDensity: string;
}

export interface Telemetry {
  wardId: number;
  ward: number | null;
  wardName: string | null;
  timezone: string;
  risk: RiskSummary | null;
  macro: MacroTelemetry;
  demographics: WardDemographics;
}

export interface WardAlert {
  level: AlertLevel;
  triggers: string[];
  headline: string;
  advisory: string;
}

export interface AlertInput {
  riskScore?: number | null;
  category?: string | null;
  htsiMax?: number | null;
  wbgtMax?: number | null;
  heatIndexMax?: number | null;
}

export interface ShowcaseHour {
  hour: string;
  htsi: number | null;
  wbgt: number | null;
  hi: number | null;
  utci: number | null;
  wbt: number | null;
  temp: number | null;
  humidity: number | null;
  wind: number | null;
  solar: number | null;
}

export interface ShowcaseDay {
  forecastDate: string;
  hours: number;
  summary: Record<string, unknown>;
  hourly: ShowcaseHour[];
}

export interface ShowcasePayload {
  locationId: number;
  ward: number | null;
  wardName: string | null;
  district: string | null;
  lat: number | null;
  long: number | null;
  timezone: string;
  source: string;
  from: string;
  to: string;
  days: ShowcaseDay[];
  current: Record<string, unknown> | null;
  prototypeNote?: string;
}
