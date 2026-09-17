import { db } from "../db/index.js";
import { populationTable } from "../models/index.js";

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const number = Number(value);

  return Number.isNaN(number) ? 0 : number;
};

export async function storeDemographics(data, locationId) {
  await db.insert(populationTable).values({
    locationId,

    // Census identification
    state: toNumber(data.State),
    district: toNumber(data.District),
    ward: toNumber(data.Ward),
    enumerationBlock: toNumber(data.EB),
    level: data.Level,
    wardName: data.Name,
    tru: data.TRU,

    // Population
    totalPopulation: toNumber(data.TOT_P),
    malePopulation: toNumber(data.TOT_M),
    femalePopulation: toNumber(data.TOT_F),
    children0To6: toNumber(data.P_06),

    // Literacy
    literatePopulation: toNumber(data.P_LIT),
    illiteratePopulation: toNumber(data.P_ILL),

    // Total workers
    totalWorkers: toNumber(data.TOT_WORK_P),

    // Main workers
    mainWorkers: toNumber(data.MAINWORK_P),
    mainCultivators: toNumber(data.MAIN_CL_P),
    mainAgriculturalLabourers: toNumber(data.MAIN_AL_P),
    mainHouseholdIndustryWorkers: toNumber(data.MAIN_HH_P),
    mainOtherWorkers: toNumber(data.MAIN_OT_P),

    // Marginal workers
    marginalWorkers: toNumber(data.MARGWORK_P),
    marginalCultivators: toNumber(data.MARG_CL_P),
    marginalAgriculturalLabourers: toNumber(data.MARG_AL_P),
    marginalHouseholdIndustryWorkers: toNumber(data.MARG_HH_P),
    marginalOtherWorkers: toNumber(data.MARG_OT_P),

    // Marginal workers: 3–6 months
    marginalWorkers3To6: toNumber(data.MARGWORK_3_6_P),
    marginalCultivators3To6: toNumber(data.MARG_CL_3_6_P),
    marginalAgriculturalLabourers3To6: toNumber(data.MARG_AL_3_6_P),
    marginalHouseholdIndustryWorkers3To6: toNumber(data.MARG_HH_3_6_P),
    marginalOtherWorkers3To6: toNumber(data.MARG_OT_3_6_P),

    // Marginal workers: 0–3 months
    marginalWorkers0To3: toNumber(data.MARGWORK_0_3_P),
    marginalCultivators0To3: toNumber(data.MARG_CL_0_3_P),
    marginalAgriculturalLabourers0To3: toNumber(data.MARG_AL_0_3_P),
    marginalHouseholdIndustryWorkers0To3: toNumber(data.MARG_HH_0_3_P),
    marginalOtherWorkers0To3: toNumber(data.MARG_OT_0_3_P),

    // Non-workers
    nonWorkers: toNumber(data.NON_WORK_P),

    // year defaults to 2011
  });

  console.log(`Stored demographic data for Ward ${data.Ward}`);

  return {
    locationId,
    ward: toNumber(data.Ward),
  };
}
