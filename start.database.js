import { initializeDatabase } from "./initialize.js";
import { readdir } from "fs/promises";
import path from "path";

export async function startInitializing() {
  const files = await readdir("./data");

  const xlsxFiles = files
    .filter((file) => file.endsWith(".xlsx"))
    .map((file) => path.join("./data", file));

  for (const filePath of xlsxFiles) {
    await initializeDatabase(filePath);
  }
}
