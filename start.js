import cron from "node-cron";
import { DateTime } from "luxon";

import { initializeDatabase } from "./initialize.js";
import { updateForecast } from "./scripts/update.forecast.js";

const TIMEZONE = "Asia/Kolkata";
const CRON_SCHEDULE = "5 0 * * *";

function getNextUpdateTime() {
  const now = DateTime.now().setZone(TIMEZONE);

  let nextUpdate = now.set({
    hour: 0,
    minute: 5,
    second: 0,
    millisecond: 0,
  });

  // If today's 00:05 has already passed,
  // the next update is tomorrow at 00:05.
  if (nextUpdate <= now) {
    nextUpdate = nextUpdate.plus({ days: 1 });
  }

  return nextUpdate;
}

async function start() {
  try {
    console.log("Starting database backend...");

    // Run initialization once on startup
    await initializeDatabase();

    console.log("Database initialization completed.");

    // Run forecast update once on startup
    await updateForecast();

    console.log("Initial forecast update completed.");

    // Run both every day at 00:05:00 Asia/Kolkata
    cron.schedule(
      CRON_SCHEDULE,
      async () => {
        const updateTime = DateTime.now()
          .setZone(TIMEZONE)
          .toFormat("yyyy-MM-dd HH:mm:ss");

        console.log(
          `\nRunning scheduled database update at ${updateTime} ${TIMEZONE}...`,
        );

        try {
          await initializeDatabase();

          console.log("Scheduled database initialization completed.");

          await updateForecast();

          console.log("Scheduled forecast update completed.");

          const nextUpdate = getNextUpdateTime().toFormat(
            "yyyy-MM-dd HH:mm:ss",
          );

          console.log(`Next scheduled update: ${nextUpdate} ${TIMEZONE}`);
        } catch (error) {
          console.error("Scheduled database update failed:", error);
        }
      },
      {
        timezone: TIMEZONE,
      },
    );

    const nextUpdate = getNextUpdateTime().toFormat("yyyy-MM-dd HH:mm:ss");

    console.log("\nDaily scheduler started.");
    console.log(`Schedule: Every day at 00:05:00 ${TIMEZONE}`);
    console.log(`Next update: ${nextUpdate} ${TIMEZONE}`);
  } catch (error) {
    console.error("Database backend failed to start:", error);
    process.exit(1);
  }
}

start();
