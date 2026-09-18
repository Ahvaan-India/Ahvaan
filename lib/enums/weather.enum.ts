/**
 * Weather & Thermal Comfort Enums and Thresholds.
 */

export enum WeatherQualifier {
  EXTREME = "Extreme",
  HIGH = "High",
  ELEVATED = "Elevated",
  MODERATE = "Moderate",
  LOW = "Low",
  BREEZY = "Breezy",
  VERY_HIGH = "Very high",
}

export const WEATHER_THRESHOLDS = {
  temperature: {
    extreme: 40,
    high: 35,
    elevated: 30,
  },
  humidity: {
    veryHigh: 85,
    elevated: 70,
    moderate: 40,
  },
  wind: {
    breezy: 4.0,
    moderate: 1.5,
  },
  solar: {
    extreme: 600,
    high: 400,
    moderate: 150,
  },
  wbgt: {
    extreme: 32.5,
    high: 30.0,
    moderate: 28.0,
  },
  heatIndex: {
    extreme: 54.0,
    high: 41.0,
    moderate: 32.0,
  },
  htsi: {
    extreme: 80.0,
    high: 60.0,
    moderate: 40.0,
  },
} as const;

export const METRIC_EXPLANATIONS = {
  compositeRisk:
    "Composite Heat Risk Index (0–100%) synthesized from Real-time Thermal Stress (50%), Population Exposure (30%), and Demographics Vulnerability (20%).",
  wbgt:
    "Wet Bulb Globe Temperature (°C): Gold-standard outdoor heat stress index incorporating humidity, wind, and direct solar radiation.",
  htsi:
    "Heat-Targeted Stress Index (0–100): Multi-variable heat hazard indicator combining microclimate exposure and population sensitivity.",
  utci:
    "Universal Thermal Climate Index (°C): Equivalent human thermal comfort feeling based on heat exchange modeling.",
  heatIndex:
    "NWS Heat Index (°C): Relative thermal strain index measuring perceived temperature from ambient air heat and relative humidity.",
  vulnerability:
    "Demographics Vulnerability (0–1.0): Composite metric weighting elderly population share (>60 yrs), young children, outdoor workforce, informal housing density, and AC availability.",
  exposure:
    "Cell Exposure Index (0–1.0): Scaled metric based on total population count, population density (people/km²), and outdoor worker fraction.",
  thermal:
    "Thermal Sub-Index (0–1.0): Multi-metric thermal stress derived from WBGT (50%), Heat Index (30%), and UTCI (20%).",
  nightRecovery:
    "Nighttime Thermal Recovery: Indicates degree of cooling during night hours (22:00-06:00). Poor recovery increases heat mortality risk.",
  persistence:
    "72-Hour Heat Persistence: Cumulative exposure to elevated temperatures over consecutive daytime cycles.",
} as const;
