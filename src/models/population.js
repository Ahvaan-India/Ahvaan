import { pgTable, integer, varchar } from "drizzle-orm/pg-core";
import { locationsTable } from "./locations.js";

export const populationTable = pgTable("population", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),

  locationId: integer()
    .notNull()
    .references(() => locationsTable.id),

  // Census identification
  state: integer().notNull(),

  district: integer().notNull(),

  ward: integer().notNull(),

  enumerationBlock: integer(),

  level: varchar("level", { length: 50 }),

  wardName: varchar("ward_name", { length: 255 }).notNull(),

  tru: varchar("tru", { length: 20 }),

  // Population
  totalPopulation: integer().notNull(),

  malePopulation: integer().notNull(),

  femalePopulation: integer().notNull(),

  children0To6: integer().notNull(),

  // Literacy
  literatePopulation: integer().notNull(),

  illiteratePopulation: integer().notNull(),

  // Total workers
  totalWorkers: integer().notNull(),

  // Main workers
  mainWorkers: integer().notNull(),

  mainCultivators: integer().notNull(),

  mainAgriculturalLabourers: integer().notNull(),

  mainHouseholdIndustryWorkers: integer().notNull(),

  mainOtherWorkers: integer().notNull(),

  // Marginal workers
  marginalWorkers: integer().notNull(),

  marginalCultivators: integer().notNull(),

  marginalAgriculturalLabourers: integer().notNull(),

  marginalHouseholdIndustryWorkers: integer().notNull(),

  marginalOtherWorkers: integer().notNull(),

  // Marginal workers: 3–6 months
  marginalWorkers3To6: integer().notNull(),

  marginalCultivators3To6: integer().notNull(),

  marginalAgriculturalLabourers3To6: integer().notNull(),

  marginalHouseholdIndustryWorkers3To6: integer().notNull(),

  marginalOtherWorkers3To6: integer().notNull(),

  // Marginal workers: 0–3 months
  marginalWorkers0To3: integer().notNull(),

  marginalCultivators0To3: integer().notNull(),

  marginalAgriculturalLabourers0To3: integer().notNull(),

  marginalHouseholdIndustryWorkers0To3: integer().notNull(),

  marginalOtherWorkers0To3: integer().notNull(),

  // Non-workers
  nonWorkers: integer().notNull(),

  // Census year
  year: integer().notNull().default(2011),
});
