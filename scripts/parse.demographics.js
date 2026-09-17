import XLSX from "xlsx";

const fields = [
  "State",
  "District",
  "Subdistt",
  "Town/Village",
  "Ward",
  "EB",
  "Level",
  "Name",
  "TRU",
  "No_HH",
  "TOT_P",
  "TOT_M",
  "TOT_F",
  "P_06",
  "P_LIT",
  "P_ILL",
  "TOT_WORK_P",
  "MAINWORK_P",
  "MAIN_CL_P",
  "MAIN_AL_P",
  "MAIN_HH_P",
  "MAIN_OT_P",
  "MARGWORK_P",
  "MARG_CL_P",
  "MARG_AL_P",
  "MARG_HH_P",
  "MARG_OT_P",
  "MARGWORK_3_6_P",
  "MARG_CL_3_6_P",
  "MARG_AL_3_6_P",
  "MARG_HH_3_6_P",
  "MARG_OT_3_6_P",
  "MARGWORK_0_3_P",
  "MARG_CL_0_3_P",
  "MARG_AL_0_3_P",
  "MARG_HH_0_3_P",
  "MARG_OT_0_3_P",
  "NON_WORK_P",
];

export function parseDemographics(filePath) {
  const workbook = XLSX.readFile(filePath);

  const wardData = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
    });

    for (const row of rows) {
      if (row["Ward"] === null || row["Ward"] === undefined) {
        continue;
      }

      const wardNumber = Number(row["Ward"]);

      if (!wardNumber) {
        continue;
      }

      const wardRecord = {};

      for (const field of fields) {
        wardRecord[field] = row[field] ?? null;
      }

      wardData[String(wardNumber)] = wardRecord;
    }
  }

  return wardData;
}
