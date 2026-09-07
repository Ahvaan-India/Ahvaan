"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface MapWard {
  locationId: number;
  ward: number | null;
  wardName: string | null;
  lat: number;
  long: number;
  totalPopulation: number | null;
  ring: Array<[number, number]>;
}

const W = 640;
const H = 560;

/** Equirectangular projection with cos(lat) correction for Kolkata. */
function project(
  lon: number,
  lat: number,
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
): [number, number] {
  const midLat = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat);
  const x =
    ((lon - bounds.minLon) * kx) /
    ((bounds.maxLon - bounds.minLon) * kx || 1);
  const y = 1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1);
  return [x * W, y * H];
}

/**
 * Kolkata ward SVG map. Hover highlights a ward and reports it via
 * onHover (detail panel follows the hovered ward); click pins the
 * selection. Fill intensity scales with population so dense wards stand
 * out even before any risk overlay exists.
 */
export function WardMap({
  wards,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: {
  wards: MapWard[];
  selectedId: number | null;
  hoveredId: number | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
}) {
  const bounds = useMemo(() => {
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const w of wards) {
      for (const [lon, lat] of w.ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    if (!wards.length || !Number.isFinite(minLon)) {
      return { minLon: 88.2, maxLon: 88.5, minLat: 22.4, maxLat: 22.7 };
    }
    const padLon = (maxLon - minLon) * 0.05 || 0.01;
    const padLat = (maxLat - minLat) * 0.05 || 0.01;
    return {
      minLon: minLon - padLon,
      maxLon: maxLon + padLon,
      minLat: minLat - padLat,
      maxLat: maxLat + padLat,
    };
  }, [wards]);

  const maxPop = useMemo(
    () => Math.max(1, ...wards.map((w) => w.totalPopulation ?? 0)),
    [wards],
  );

  if (wards.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-[380px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Kolkata ward map"
      onMouseLeave={() => onHover(null)}
    >
      {wards.map((w) => {
        if (w.ring.length === 0) return null;
        const pts = w.ring
          .map(([lon, lat]) => project(lon, lat, bounds).join(","))
          .join(" ");
        const isSel = w.locationId === selectedId;
        const isHov = w.locationId === hoveredId;
        const density = (w.totalPopulation ?? 0) / maxPop;
        const fill = isSel
          ? "#c0392b"
          : isHov
            ? "#e67e22"
            : `rgba(41, 98, 255, ${0.15 + density * 0.55})`;
        return (
          <polygon
            key={w.locationId}
            points={pts}
            fill={fill}
            stroke={isSel || isHov ? "#111" : "#fff"}
            strokeWidth={isSel || isHov ? 1.2 : 0.4}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => onHover(w.locationId)}
            onClick={() => onSelect(w.locationId)}
          />
        );
      })}
    </svg>
  );
}
