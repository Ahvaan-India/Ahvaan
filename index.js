import XLSX from "xlsx";
import { addLocation } from "./scripts/add.locations.js";
import { getWardData } from "./scripts/get.ward.js";
import { fetchDetails } from "./scripts/fetch.weather.js";
import { addPopulation } from "./scripts/add.population.js";

const workbook = XLSX.readFile("./data/kolkata.xlsx");

console.log("Sheets:", workbook.SheetNames);

// Columns needed
const fields = [
  "State", // 1
  "District", // 2
  "Subdistt", // 3
  "Town/Village", // 4
  "Ward", // 5
  "EB", // 6
  "Level", // 7
  "Name", // 8
  "TRU", // 9
  "No_HH", // 10
  "TOT_P", // 11
  "TOT_M", // 12
  "TOT_F", // 13
  "P_06", // 14
  "P_LIT", // 23
  "P_ILL", // 26
  "TOT_WORK_P", // 29
  "MAINWORK_P", // 32
  "MAIN_CL_P", // 35
  "MAIN_AL_P", // 38
  "MAIN_HH_P", // 41
  "MAIN_OT_P", // 44
  "MARGWORK_P", // 47
  "MARG_CL_P", // 50
  "MARG_AL_P", // 53
  "MARG_HH_P", // 56
  "MARG_OT_P", // 59
  "MARGWORK_3_6_P", // 62
  "MARG_CL_3_6_P", // 65
  "MARG_AL_3_6_P", // 68
  "MARG_HH_3_6_P", // 71
  "MARG_OT_3_6_P", // 74
  "MARGWORK_0_3_P", // 77
  "MARG_CL_0_3_P", // 80
  "MARG_AL_0_3_P", // 83
  "MARG_HH_0_3_P", // 86
  "MARG_OT_0_3_P", // 89
  "NON_WORK_P", // 92
];

const wardData = {};

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];

  console.log("\n==============================");
  console.log("SHEET:", sheetName);
  console.log("==============================");
  console.log("Range:", sheet["!ref"]);

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
  });

  console.log("Rows:", rows.length);

  for (const row of rows) {
    const ward = row["Ward"];

    if (
      ward === null ||
      ward === undefined ||
      String(ward).trim() === "" ||
      String(ward).trim() === "0000"
    ) {
      continue;
    }

    const wardRecord = {};

    for (const field of fields) {
      wardRecord[field] = row[field] ?? null;
    }

    wardData[String(ward).trim()] = wardRecord;
  }
}

async function initializeData() {
  for (const [ward, data] of Object.entries(wardData)) {
    console.log(`\n==============================`);
    console.log(`Processing Ward ${ward}`);
    console.log(`==============================`);

    const wardNumber = Number(ward);

    const wardAPIData = await getWardData(wardNumber);

    const locationID = await addLocation(
      wardAPIData.latitude,
      wardAPIData.longitude,
      wardAPIData.geometry[0],
    );

    await fetchDetails(wardAPIData.latitude, wardAPIData.longitude, locationID);

    await addPopulation(data, locationID);

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function main() {
  try {
    await initializeData();

    console.log("\n================================");
    console.log("ALL WARDS PROCESSED SUCCESSFULLY");
    console.log("================================");
  } catch (error) {
    console.error("\n================================");
    console.error("INITIALIZATION FAILED");
    console.error("================================");
    console.error(error);
  }
}

main();
