"use client";

import useSWR from "swr";
import type { RiskResponse } from "@/lib/heatshield/types";

const fetcher = async (url: string): Promise<RiskResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string; detail?: string }).detail ||
        (body as { error?: string }).error ||
        `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<RiskResponse>;
};

/**
 * Minimal end-to-end wiring check: client-side fetch of the risk endpoint.
 * Drop this into any dashboard page; replace the hardcoded id with map state.
 */
export function RiskCard({ locationId }: { locationId: number }) {
  const { data, error, isLoading } = useSWR<RiskResponse>(
    `/api/risk/${locationId}`,
    fetcher,
  );

  if (isLoading) return <div className="card">Loading risk…</div>;
  if (error)
    return (
      <div className="card">
        <strong>Risk unavailable</strong>
        <p className="muted">{(error as Error).message}</p>
      </div>
    );
  if (!data) return null;

  return (
    <div className="card">
      <h2>
        Location {data.locationId} {data.compositeRisk.category}
      </h2>
      <p>
        Composite risk: <strong>{data.compositeRisk.value.toFixed(3)}</strong>{" "}
        (T={data.scores.thermalStress.toFixed(2)} E=
        {data.scores.exposure.toFixed(2)} V=
        {data.scores.vulnerability.toFixed(2)} P=
        {data.scores.persistence.toFixed(2)})
      </p>
      <p className="muted">
        WBGT {data.indicators.wbgt.toFixed(1)}°C · Heat index{" "}
        {data.indicators.heatIndex.toFixed(1)}°C · UTCI{" "}
        {data.indicators.utciAvailable ? data.indicators.utci : "n/a"} ·
        Confidence {data.confidence.score.toFixed(2)}
      </p>
      {data.confidence.dataQualityFlags.length > 0 && (
        <p className="muted">
          Data flags: {data.confidence.dataQualityFlags.join(", ")}
        </p>
      )}
      <p className="muted">{data.disclaimer}</p>
    </div>
  );
}
