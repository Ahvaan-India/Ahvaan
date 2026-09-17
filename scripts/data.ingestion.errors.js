import { db } from "../db/index.js";
import { dbWithRetry } from "../dbWithRetry.js";
import { dataIngestionErrorsTable } from "../models/index.js";

export async function storeIngestionError({
  district,
  ward,
  source,
  errorType,
  missingFields = null,
  errorMessage = null,
}) {
  await dbWithRetry(
    () =>
      db.insert(dataIngestionErrorsTable).values({
        district,
        ward: Number(ward),
        source,
        errorType,
        missingFields,
        errorMessage,
      }),
    3,
    2000,
  );
}
