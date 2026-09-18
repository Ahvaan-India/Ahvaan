/**
 * Centralized Alert Severity Levels & Advisory Templates.
 */

export enum AlertLevel {
  LOW = "LOW",
  MODERATE = "MODERATE",
  HIGH = "HIGH",
  EXTREME = "EXTREME",
}

export const ALERT_LEVEL_RANK: Record<AlertLevel, number> = {
  [AlertLevel.LOW]: 0,
  [AlertLevel.MODERATE]: 1,
  [AlertLevel.HIGH]: 2,
  [AlertLevel.EXTREME]: 3,
};

export const ALERT_LEVEL_COLORS: Record<AlertLevel, { fill: string; border: string; badge: string }> = {
  [AlertLevel.LOW]: {
    fill: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    border: "border-teal-500/30",
    badge: "bg-teal-500 text-white",
  },
  [AlertLevel.MODERATE]: {
    fill: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    border: "border-yellow-500/30",
    badge: "bg-yellow-500 text-black",
  },
  [AlertLevel.HIGH]: {
    fill: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    border: "border-orange-500/30",
    badge: "bg-orange-500 text-white",
  },
  [AlertLevel.EXTREME]: {
    fill: "bg-red-500/10 text-red-600 dark:text-red-400",
    border: "border-red-500/30",
    badge: "bg-red-600 text-white",
  },
};

export const ALERT_ADVISORY_TEMPLATES: Record<AlertLevel, (wardLabel: string) => string> = {
  [AlertLevel.EXTREME]: (wardLabel: string) =>
    `${wardLabel}: Extreme heat condition. Deploy emergency water/shade stations; activate cooling centers; monitor vulnerable elderly hourly; notify local hospitals.`,
  [AlertLevel.HIGH]: (wardLabel: string) =>
    `${wardLabel}: High heat hazard. Limit outdoor work between 12 PM - 4 PM; maintain hydration; monitor vulnerable groups; reschedule non-essential outdoor labor.`,
  [AlertLevel.MODERATE]: (wardLabel: string) =>
    `${wardLabel}: Moderate heat elevation. Stay hydrated, take regular resting breaks, and watch for early heat illness symptoms.`,
  [AlertLevel.LOW]: (wardLabel: string) =>
    `${wardLabel}: Normal temperature parameters. Standard operations with routine heat awareness.`,
};
