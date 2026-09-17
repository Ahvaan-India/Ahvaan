import {
  pgTable,
  integer,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";

import { locationsTable } from "./locations.js";

export const weatherTable = pgTable("weather", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),

  locationId: integer()
    .notNull()
    .references(() => locationsTable.id),

  timestamp: timestamp({
    mode: "string",
  }).notNull(),

  temperature2m: doublePrecision(),
  relativeHumidity2m: doublePrecision(),
  dewPoint2m: doublePrecision(),
  apparentTemperature: doublePrecision(),

  windSpeed10m: doublePrecision(),
  windDirection10m: doublePrecision(),
  windGusts10m: doublePrecision(),

  shortwaveRadiation: doublePrecision(),
  directRadiation: doublePrecision(),
  diffuseRadiation: doublePrecision(),

  precipitation: doublePrecision(),
  rain: doublePrecision(),
});
