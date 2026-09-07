export async function fetchWithRetry(url, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Request attempt ${attempt}/${retries}`);

      const response = await fetch(url);

      // Rate limited
      if (response.status === 429) {
        console.log("Rate limited (429). Waiting 5 seconds...");

        await new Promise((resolve) => setTimeout(resolve, 5000));

        continue;
      }

      // Server error
      if (response.status >= 500) {
        const body = await response.text();

        console.error(`Server error ${response.status}: ${body}`);

        if (attempt === retries) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const delay = 1000 * 2 ** (attempt - 1);

        console.log(`Retrying in ${delay / 1000} seconds...`);

        await new Promise((resolve) => setTimeout(resolve, delay));

        continue;
      }

      if (!response.ok) {
        const body = await response.text();

        throw new Error(`HTTP ${response.status}: ${body}`);
      }

      return response;
    } catch (error) {
      console.error(
        `Fetch failed (attempt ${attempt}/${retries}):`,
        error.message,
      );

      if (attempt === retries) {
        throw error;
      }

      const delay = 1000 * 2 ** (attempt - 1);

      console.log(`Retrying in ${delay / 1000} seconds...`);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
