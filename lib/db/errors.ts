/**
 * Typed error for "location exists but has no usable data in the window".
 * The API layer maps this to 422 (insufficient/partial data), NOT 500
 * a silent garbage score is worse than an explicit gap.
 */
export class DataGapError extends Error {
  readonly code = "DATA_GAP";
  readonly locationId: number;
  readonly detail: string;

  constructor(locationId: number, detail: string) {
    super(`Insufficient data for location ${locationId}: ${detail}`);
    this.name = "DataGapError";
    this.locationId = locationId;
    this.detail = detail;
  }
}

/** Thrown when a locationId resolves to no row. API maps to 404. */
export class LocationNotFoundError extends Error {
  readonly code = "LOCATION_NOT_FOUND";
  readonly locationId: number;

  constructor(locationId: number) {
    super(`Location ${locationId} not found`);
    this.name = "LocationNotFoundError";
    this.locationId = locationId;
  }
}
