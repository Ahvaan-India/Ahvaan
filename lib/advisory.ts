/**
 * Advisory evaluation over BACKEND values (no local index math).
 * Operational band defaults, documented — tune against official guidance:
 *   HTSI bands 30 / 50 / 65 / 80 (0–100 scale)
 *   WBGT bands 27 / 30 / 33 (°C)
 *   Heat-index bands 33 / 39 / 45 (°C)
 *   Temperature fallback bands 37 / 40 / 45 (°C, used only when no index)
 */

export type AdvisoryLevel = "LOW" | "MODERATE" | "HIGH" | "EXTREME";

export interface AdvisoryInput {
  htsi?: number | null;
  wbgt?: number | null;
  heatIndex?: number | null;
  tempMax?: number | null;
}

export interface Advisory {
  level: AdvisoryLevel;
  triggers: string[];
  advisory: string;
}

const RANK: Record<AdvisoryLevel, number> = {
  LOW: 0,
  MODERATE: 1,
  HIGH: 2,
  EXTREME: 3,
};

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function band(v: number, edges: [number, number, number]): AdvisoryLevel {
  if (v >= edges[2]) return "EXTREME";
  if (v >= edges[1]) return "HIGH";
  if (v >= edges[0]) return "MODERATE";
  return "LOW";
}

const ADVICE: Record<AdvisoryLevel, string> = {
  LOW: "Conditions look manageable. Stay hydrated and follow routine heat guidance.",
  MODERATE:
    "Heat is building up. Increase fluid intake, limit afternoon sun exposure, and check on vulnerable people.",
  HIGH: "High heat. Restrict strenuous outdoor work 12–4pm, ensure water and shade, watch for heat exhaustion.",
  EXTREME:
    "Extreme heat. Avoid peak outdoor exposure 11am–4pm, open cooling shelters, check elderly hourly.",
};

export function evaluateAdvisory(input: AdvisoryInput, label: string): Advisory {
  const triggers: string[] = [];
  let level: AdvisoryLevel = "LOW";
  const consider = (l: AdvisoryLevel, text: string | null) => {
    if (RANK[l] > RANK[level]) level = l;
    if (text && RANK[l] >= RANK.HIGH) triggers.push(text);
  };

  const htsi = num(input.htsi);
  if (htsi !== null) {
    const b = band(htsi, [30, 50, 65]);
    consider(b, `HTSI ${htsi.toFixed(0)}/100 (${b})`);
  }
  const wbgt = num(input.wbgt);
  if (wbgt !== null) {
    const b = band(wbgt, [27, 30, 33]);
    consider(b, `WBGT ${wbgt.toFixed(1)}°C (${b})`);
  }
  const hi = num(input.heatIndex);
  if (hi !== null) {
    const b = band(hi, [33, 39, 45]);
    consider(b, `Heat index ${hi.toFixed(1)}°C (${b})`);
  }
  if (htsi === null && wbgt === null && hi === null) {
    const t = num(input.tempMax);
    if (t !== null) {
      const b = band(t, [37, 40, 45]);
      consider(b, `Max temp ${t.toFixed(1)}°C (${b})`);
    }
  }

  if (triggers.length === 0 && level === "LOW") {
    const anyValue =
      htsi !== null || wbgt !== null || hi !== null || num(input.tempMax) !== null;
    triggers.push(anyValue ? "All indices below High bands" : "Insufficient data for evaluation");
  }
  return { level, triggers, advisory: `${label}: ${ADVICE[level]}` };
}

export interface HeatAdvisoryItem {
  icon: string;
  title: string;
  action: string;
}

export interface HeatCategoryInfo {
  level: "EXTREME" | "HIGH" | "MODERATE" | "LOW";
  title: string;
  riskRangeLabel: string;
  htsiRangeLabel: string;
  wbgtRangeLabel: string;
  hexColor: string;
  borderClass: string;
  bgGradientClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
  accentTextClass: string;
  cardBorderClass: string;
  items: HeatAdvisoryItem[];
}

export const HEAT_CATEGORIES: Record<AdvisoryLevel, HeatCategoryInfo> = {
  EXTREME: {
    level: "EXTREME",
    title: "Extreme Heat Emergency",
    riskRangeLabel: "0.70 – 1.00",
    htsiRangeLabel: "0.80 – 1.00",
    wbgtRangeLabel: "≥ 33.0°C",
    hexColor: "#dc2626",
    borderClass: "border-red-500/40",
    bgGradientClass: "from-red-500/15 via-amber-500/5 to-transparent",
    badgeBgClass: "bg-red-600/15 border-red-500/40",
    badgeTextClass: "text-red-600 dark:text-red-400",
    accentTextClass: "text-red-700 dark:text-red-300",
    cardBorderClass: "border-red-500/30 bg-red-500/5",
    items: [
      {
        icon: "🚨",
        title: "Emergency Work Stoppage",
        action: "Cease heavy outdoor labor 11:00 AM – 4:00 PM. Mandatory 15-min shade break every 30 mins.",
      },
      {
        icon: "💧",
        title: "Intense Electrolyte Hydration",
        action: "Drink 4+ liters of water daily with ORS or electrolyte solutions. Avoid caffeine & alcohol.",
      },
      {
        icon: "🏥",
        title: "Cooling Center Activation",
        action: "Open municipal cooling shelters & shaded transit rest centers immediately.",
      },
      {
        icon: "👴",
        title: "Hourly Vulnerable Welfare Checks",
        action: "Conduct hourly checks on senior citizens, infants, and outdoor workers in high-vulnerability blocks.",
      },
      {
        icon: "🚑",
        title: "Heat Stroke Emergency Action",
        action: "If high body temp, confusion, or nausea occurs, move to shade, apply ice packs & call emergency medical services.",
      },
    ],
  },
  HIGH: {
    level: "HIGH",
    title: "High Heat Warning",
    riskRangeLabel: "0.55 – 0.69",
    htsiRangeLabel: "0.65 – 0.79",
    wbgtRangeLabel: "30.0°C – 32.9°C",
    hexColor: "#ea580c",
    borderClass: "border-orange-500/40",
    bgGradientClass: "from-orange-500/15 via-amber-500/5 to-transparent",
    badgeBgClass: "bg-orange-600/15 border-orange-500/40",
    badgeTextClass: "text-orange-600 dark:text-orange-400",
    accentTextClass: "text-orange-700 dark:text-orange-300",
    cardBorderClass: "border-orange-500/30 bg-orange-500/5",
    items: [
      {
        icon: "☀️",
        title: "Limit Afternoon Exposure",
        action: "Restrict non-essential outdoor physical activity between 12:00 PM and 3:30 PM.",
      },
      {
        icon: "💧",
        title: "Frequent Fluid Intake",
        action: "Drink 3-4 liters of water daily. Use lemon water, buttermilk, or ORS regularly.",
      },
      {
        icon: "👕",
        title: "Protective Attire & Shade",
        action: "Wear loose, light-colored cotton clothing, UV-blocking sunglasses, and wide-brimmed hats.",
      },
      {
        icon: "🏠",
        title: "Indoor Cooling & Ventilation",
        action: "Keep living areas shaded during peak afternoon heat; use fans and damp curtains.",
      },
    ],
  },
  MODERATE: {
    level: "MODERATE",
    title: "Moderate Heat Caution",
    riskRangeLabel: "0.35 – 0.54",
    htsiRangeLabel: "0.50 – 0.64",
    wbgtRangeLabel: "27.0°C – 29.9°C",
    hexColor: "#d97706",
    borderClass: "border-amber-500/40",
    bgGradientClass: "from-amber-500/15 via-yellow-500/5 to-transparent",
    badgeBgClass: "bg-amber-600/15 border-amber-500/40",
    badgeTextClass: "text-amber-600 dark:text-amber-400",
    accentTextClass: "text-amber-700 dark:text-amber-300",
    cardBorderClass: "border-amber-500/30 bg-amber-500/5",
    items: [
      {
        icon: "💧",
        title: "Maintain Regular Hydration",
        action: "Carry a reusable water bottle and sip water continuously throughout the day.",
      },
      {
        icon: "🧢",
        title: "Shaded Outdoor Breaks",
        action: "Take frequent shaded breaks when working outdoors or traveling across the city.",
      },
      {
        icon: "🧒",
        title: "Child & Elderly Precaution",
        action: "Ensure infants and elderly family members remain in well-ventilated rooms.",
      },
      {
        icon: "🚗",
        title: "Vehicle Safety Notice",
        action: "Never leave children, elderly, or pets inside parked vehicles even for a few minutes.",
      },
    ],
  },
  LOW: {
    level: "LOW",
    title: "Low Heat Risk",
    riskRangeLabel: "0.00 – 0.34",
    htsiRangeLabel: "< 0.50",
    wbgtRangeLabel: "< 27.0°C",
    hexColor: "#059669",
    borderClass: "border-emerald-500/40",
    bgGradientClass: "from-emerald-500/15 via-teal-500/5 to-transparent",
    badgeBgClass: "bg-emerald-600/15 border-emerald-500/40",
    badgeTextClass: "text-emerald-600 dark:text-emerald-400",
    accentTextClass: "text-emerald-700 dark:text-emerald-300",
    cardBorderClass: "border-emerald-500/30 bg-emerald-500/5",
    items: [
      {
        icon: "🌿",
        title: "Normal Daily Activities",
        action: "Conditions are comfortable. Continue regular daily outdoor activities.",
      },
      {
        icon: "💧",
        title: "Standard Hydration",
        action: "Drink regular water during exercise or sports activities.",
      },
      {
        icon: "🕶️",
        title: "UV Eye Protection",
        action: "Use sunglasses and light sun protection during peak sun hours.",
      },
    ],
  },
};

export function getCategoryForZone(
  risk: number | null,
  htsi: number | null,
  wbgt: number | null,
  temp: number | null,
  layer?: string
): HeatCategoryInfo {
  const r = risk !== null ? risk : null;
  const h = htsi !== null ? (htsi > 1 ? htsi / 100 : htsi) : null;
  const w = wbgt !== null ? wbgt : null;
  const t = temp !== null ? temp : null;

  if (layer === "risk") {
    if (r !== null) {
      if (r >= 0.70) return HEAT_CATEGORIES.EXTREME;
      if (r >= 0.55) return HEAT_CATEGORIES.HIGH;
      if (r >= 0.35) return HEAT_CATEGORIES.MODERATE;
      return HEAT_CATEGORIES.LOW;
    }
  } else if (layer === "htsi") {
    if (h !== null) {
      if (h >= 0.80) return HEAT_CATEGORIES.EXTREME;
      if (h >= 0.65) return HEAT_CATEGORIES.HIGH;
      if (h >= 0.50) return HEAT_CATEGORIES.MODERATE;
      return HEAT_CATEGORIES.LOW;
    }
  } else if (layer === "wbgt") {
    if (w !== null) {
      if (w >= 33.0) return HEAT_CATEGORIES.EXTREME;
      if (w >= 30.0) return HEAT_CATEGORIES.HIGH;
      if (w >= 27.0) return HEAT_CATEGORIES.MODERATE;
      return HEAT_CATEGORIES.LOW;
    }
  } else if (layer === "temp") {
    if (t !== null) {
      if (t >= 40.0) return HEAT_CATEGORIES.EXTREME;
      if (t >= 37.0) return HEAT_CATEGORIES.HIGH;
      if (t >= 32.0) return HEAT_CATEGORIES.MODERATE;
      return HEAT_CATEGORIES.LOW;
    }
  }

  if (
    (r !== null && r >= 0.70) ||
    (h !== null && h >= 0.80) ||
    (w !== null && w >= 33.0) ||
    (t !== null && t >= 40.0)
  ) {
    return HEAT_CATEGORIES.EXTREME;
  }
  if (
    (r !== null && r >= 0.55) ||
    (h !== null && h >= 0.65) ||
    (w !== null && w >= 30.0) ||
    (t !== null && t >= 37.0)
  ) {
    return HEAT_CATEGORIES.HIGH;
  }
  if (
    (r !== null && r >= 0.35) ||
    (h !== null && h >= 0.50) ||
    (w !== null && w >= 27.0) ||
    (t !== null && t >= 32.0)
  ) {
    return HEAT_CATEGORIES.MODERATE;
  }
  return HEAT_CATEGORIES.LOW;
}
