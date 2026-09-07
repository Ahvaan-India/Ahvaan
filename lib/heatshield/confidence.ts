import {
  CONFIDENCE_WEIGHTS,
  VULNERABILITY_SUB_SCORE_COUNT,
} from "./config";
import { clip } from "./thermal";
import type { ConfidenceInput } from "./types";

/**
 * Confidence 0–1: completeness/trust score.
 *  confidence = 0.6*coverage + 0.2*utciFactor + 0.2*vulnCompleteness
 * where coverage = present/expected weather rows (capped at 1),
 * utciFactor = 1 if available else 0, and vulnCompleteness = 1 minus the
 * share of vulnerability sub-scores that used defaults.
 *
 * Default-usage is detected from dataQualityFlags entries containing
 * "default" (elderly_pct_default, informal_housing_default,
 * ac_access_default, …), capped at VULNERABILITY_SUB_SCORE_COUNT.
 */
export function computeConfidenceScore({
  weatherRowCount,
  expectedRowCount,
  utciAvailable,
  dataQualityFlags,
}: ConfidenceInput): number {
  const expected = expectedRowCount > 0 ? expectedRowCount : 1;
  const coverage = clip(weatherRowCount / expected, 0, 1);
  const utciFactor = utciAvailable ? 1 : 0;

  const defaultCount = Math.min(
    dataQualityFlags.filter((f) => f.toLowerCase().includes("default")).length,
    VULNERABILITY_SUB_SCORE_COUNT,
  );
  const vulnCompleteness = clip(
    1 - defaultCount / VULNERABILITY_SUB_SCORE_COUNT,
    0,
    1,
  );

  return clip(
    CONFIDENCE_WEIGHTS.coverage * coverage +
      CONFIDENCE_WEIGHTS.utci * utciFactor +
      CONFIDENCE_WEIGHTS.vulnerabilityCompleteness * vulnCompleteness,
    0,
    1,
  );
}
