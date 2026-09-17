import cron from "node-cron";
import { DateTime } from "luxon";

import { initializeEngine } from "./initialize.js";
import { updateAnalysis } from "./scripts/update.analysis.js";

const TIMEZONE = "Asia/Kolkata";
const CRON_SCHEDULE = "10 0 * * *";

function getNextUpdateTime() {
  const now = DateTime.now().setZone(TIMEZONE);

  let nextUpdate = now.set({
    hour: 0,
    minute: 10,
    second: 0,
    millisecond: 0,
  });

  // If today's 00:10 has already passed,
  // the next update is tomorrow at 00:10.
  if (nextUpdate <= now) {
    nextUpdate = nextUpdate.plus({ days: 1 });
  }

  return nextUpdate;
}

async function start() {
  try {
    console.log("Starting Risk Engine backend...");

    // --------------------------------------------
    // 1. Run initialization once on startup
    // --------------------------------------------

    await initializeEngine();

    console.log("Engine initialization completed.");

    // --------------------------------------------
    // 2. Run analysis update once on startup
    // --------------------------------------------

    await updateAnalysis();

    console.log("Initial analysis update completed.");

    // --------------------------------------------
    // 3. Run analysis update every day at 00:10
    // --------------------------------------------

    cron.schedule(
      CRON_SCHEDULE,
      async () => {
        const updateTime = DateTime.now()
          .setZone(TIMEZONE)
          .toFormat("yyyy-MM-dd HH:mm:ss");

        console.log(
          `\nRunning scheduled analysis update at ${updateTime} ${TIMEZONE}...`,
        );

        try {
          await updateAnalysis();

          console.log("Scheduled analysis update completed.");

          const nextUpdate = getNextUpdateTime().toFormat(
            "yyyy-MM-dd HH:mm:ss",
          );

          console.log(`Next scheduled update: ${nextUpdate} ${TIMEZONE}`);
        } catch (error) {
          console.error("Scheduled analysis update failed:", error);
        }
      },
      {
        timezone: TIMEZONE,
      },
    );

    // --------------------------------------------
    // 4. Scheduler information
    // --------------------------------------------

    const nextUpdate = getNextUpdateTime().toFormat("yyyy-MM-dd HH:mm:ss");

    console.log("\nDaily analysis scheduler started.");
    console.log(`Schedule: Every day at 00:10:00 ${TIMEZONE}`);
    console.log(`Next update: ${nextUpdate} ${TIMEZONE}`);
  } catch (error) {
    console.error("Risk Engine failed to start:", error);
    process.exit(1);
  }
}

start();
