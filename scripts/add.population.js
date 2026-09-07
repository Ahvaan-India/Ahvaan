import "dotenv/config";

import { db } from "../db/index.js";
import { populationTable } from "../models/index.js";

export async function addPopulation(data, locationId) {
  try {
    console.log(`Adding population data for Ward ${data.Ward}...`);

    const [population] = await db
      .insert(populationTable)
      .values({
        locationId,

        // Census identification
        state: Number(data.State),

        district: Number(data.District),

        ward: Number(data.Ward),

        enumerationBlock:
          data.EB !== null && data.EB !== undefined ? Number(data.EB) : null,

        level: data.Level,

        wardName: data.Name,

        tru: data.TRU,

        // Population
        totalPopulation: Number(data.TOT_P),

        malePopulation: Number(data.TOT_M),

        femalePopulation: Number(data.TOT_F),

        children0To6: Number(data.P_06),

        // Literacy
        literatePopulation: Number(data.P_LIT),

        illiteratePopulation: Number(data.P_ILL),

        // Total workers
        totalWorkers: Number(data.TOT_WORK_P),

        // Main workers
        mainWorkers: Number(data.MAINWORK_P),

        mainCultivators: Number(data.MAIN_CL_P),

        mainAgriculturalLabourers: Number(data.MAIN_AL_P),

        mainHouseholdIndustryWorkers: Number(data.MAIN_HH_P),

        mainOtherWorkers: Number(data.MAIN_OT_P),

        // Marginal workers
        marginalWorkers: Number(data.MARGWORK_P),

        marginalCultivators: Number(data.MARG_CL_P),

        marginalAgriculturalLabourers: Number(data.MARG_AL_P),

        marginalHouseholdIndustryWorkers: Number(data.MARG_HH_P),

        marginalOtherWorkers: Number(data.MARG_OT_P),

        // Marginal workers: 3–6 months
        marginalWorkers3To6: Number(data.MARGWORK_3_6_P),

        marginalCultivators3To6: Number(data.MARG_CL_3_6_P),

        marginalAgriculturalLabourers3To6: Number(data.MARG_AL_3_6_P),

        marginalHouseholdIndustryWorkers3To6: Number(data.MARG_HH_3_6_P),

        marginalOtherWorkers3To6: Number(data.MARG_OT_3_6_P),

        // Marginal workers: 0–3 months
        marginalWorkers0To3: Number(data.MARGWORK_0_3_P),

        marginalCultivators0To3: Number(data.MARG_CL_0_3_P),

        marginalAgriculturalLabourers0To3: Number(data.MARG_AL_0_3_P),

        marginalHouseholdIndustryWorkers0To3: Number(data.MARG_HH_0_3_P),

        marginalOtherWorkers0To3: Number(data.MARG_OT_0_3_P),

        // Non-workers
        nonWorkers: Number(data.NON_WORK_P),

        // Census year
        year: 2011,
      })
      .returning({
        id: populationTable.id,
      });

    console.log(`Population created with ID: ${population.id}`);

    return population.id;
  } catch (error) {
    console.error(`Failed to add population data for Ward ${data.Ward}:`);

    console.error(error);

    throw error;
  }
}
