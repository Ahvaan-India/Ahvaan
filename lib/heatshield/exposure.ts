import {
  EXPOSURE_FALLBACK_CELL_AREA_KM2,
  EXPOSURE_NORMALIZATION,
  EXPOSURE_WEIGHTS,
  KM2_PER_DEG2_APPROX,
  VULNERABILITY_FLAGS,
} from "./config";
import { clip } from "./thermal";
import type { PopulationRow } from "../db/schema";

export interface ExposureComponents {
  population: number;
  density: number;
  outdoorWorkers: number;
}

/**
 * Fraction of workers who are outdoor-exposed:
 * (mainAgriLabourers + all marginal agri-labourer splits +
 *  mainHouseholdIndustry + all marginal household-industry splits)
 * over totalWorkers. Household-industry work in India is frequently
 * home-based but poorly ventilated / heat-exposed, hence included;
 * cultivators are deliberately EXCLUDED here (often land-holding
 * supervisors) — revisit if field data says otherwise.
 */
export function outdoorWorkerFraction(pop: PopulationRow): number {
  const outdoor =
    num(pop.mainAgriculturalLabourers) +
    num(pop.marginalAgriculturalLabourers3To6) +
    num(pop.marginalAgriculturalLabourers0To3) +
    num(pop.mainHouseholdIndustryWorkers) +
    num(pop.marginalHouseholdIndustryWorkers3To6) +
    num(pop.marginalHouseholdIndustryWorkers0To3);
  const total = num(pop.totalWorkers);
  if (!total || total <= 0) return 0;
  return clip(outdoor / total);
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) throw new Error("max must exceed min");
  return clip((value - min) / (max - min));
}

/**
 * Derive cell area in km² from GeoJSON geometry bbox when present.
 * Supports Polygon / MultiPolygon by scanning all coordinates; falls back
 * to EXPOSURE_FALLBACK_CELL_AREA_KM2 (1 km²) with a data-quality flag.
 */
export function cellAreaKm2(
  geometry: unknown,
): { areaKm2: number; usedFallback: boolean } {
  try {
    // Live DB stores ward polygons as RAW rings: [[lon,lat],...].
    // Accept them directly, plus GeoJSON Polygon/MultiPolygon objects.
    const ringOrGeom = geometry as unknown;
    if (Array.isArray(ringOrGeom)) {
      const bbox = bboxOfCoords(ringOrGeom);
      if (bbox) return { areaKm2: bbox, usedFallback: false };
      return { areaKm2: EXPOSURE_FALLBACK_CELL_AREA_KM2, usedFallback: true };
    }
    const geom = ringOrGeom as {
      type?: string;
      coordinates?: unknown;
      bbox?: [number, number, number, number];
    } | null;
    if (!geom) return { areaKm2: EXPOSURE_FALLBACK_CELL_AREA_KM2, usedFallback: true };
    if (
      Array.isArray(geom.bbox) &&
      geom.bbox.length === 4 &&
      geom.bbox.every((n) => Number.isFinite(n))
    ) {
      const [minX, minY, maxX, maxY] = geom.bbox;
      const area = Math.abs(maxX - minX) * Math.abs(maxY - minY) * KM2_PER_DEG2_APPROX;
      if (area > 0 && Number.isFinite(area)) return { areaKm2: area, usedFallback: false };
    }
    const coords = geom.coordinates;
    if (!coords) return { areaKm2: EXPOSURE_FALLBACK_CELL_AREA_KM2, usedFallback: true };
    const area = bboxOfCoords(coords);
    if (area) return { areaKm2: area, usedFallback: false };
  } catch {
    // fall through to fallback
  }
  return { areaKm2: EXPOSURE_FALLBACK_CELL_AREA_KM2, usedFallback: true };
}

function bboxOfCoords(coords: unknown): number | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (c: unknown) => {
    if (Array.isArray(c)) {
      if (typeof c[0] === "number" && typeof c[1] === "number") {
        minX = Math.min(minX, c[0]);
        minY = Math.min(minY, c[1]);
        maxX = Math.max(maxX, c[0]);
        maxY = Math.max(maxY, c[1]);
      } else {
        for (const child of c) visit(child);
      }
    }
  };
  visit(coords);
  if ([minX, minY, maxX, maxY].every(Number.isFinite) && maxX > minX && maxY > minY) {
    const area = (maxX - minX) * (maxY - minY) * KM2_PER_DEG2_APPROX;
    if (area > 0 && Number.isFinite(area)) return area;
  }
  return null;
}

/**
 * Exposure score 0–1: w1*Epop + w2*Edensity + w3*Eoutdoor_workers.
 * Returns the score plus components + flags (density fallback flag).
 */
export function computeExposureScore(
  population: PopulationRow,
  geometry: unknown,
): { score: number; components: ExposureComponents; flags: string[] } {
  const flags: string[] = [];
  const totalPop = num(population.totalPopulation);

  const { areaKm2, usedFallback } = cellAreaKm2(geometry);
  if (usedFallback) flags.push(VULNERABILITY_FLAGS.densityFallback);

  const density = areaKm2 > 0 ? totalPop / areaKm2 : totalPop;
  const outdoor = outdoorWorkerFraction(population);

  const ePop = normalize(
    totalPop,
    EXPOSURE_NORMALIZATION.population.min,
    EXPOSURE_NORMALIZATION.population.max,
  );
  const eDensity = normalize(
    density,
    EXPOSURE_NORMALIZATION.density.min,
    EXPOSURE_NORMALIZATION.density.max,
  );
  const eOutdoor = normalize(
    outdoor,
    EXPOSURE_NORMALIZATION.outdoorWorkers.min,
    EXPOSURE_NORMALIZATION.outdoorWorkers.max,
  );

  const score = clip(
    EXPOSURE_WEIGHTS.population * ePop +
      EXPOSURE_WEIGHTS.density * eDensity +
      EXPOSURE_WEIGHTS.outdoorWorkers * eOutdoor,
  );
  return { score, components: { population: ePop, density: eDensity, outdoorWorkers: eOutdoor }, flags };
}
