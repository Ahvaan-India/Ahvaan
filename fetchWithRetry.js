export async function fetchWithRetry(url, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Request attempt ${attempt}/${retries}`);

      const response = await fetch(url);

      // Rate limited
      if (response.status === 429) {
        if (attempt === retries) {
          return {
            success: false,
            status: response.status,
            error: "Rate limited after all retry attempts",
          };
        }

        console.log("Rate limited (429). Waiting 5 seconds...");

        await new Promise((resolve) => setTimeout(resolve, 5000));

        continue;
      }

      // Server error
      if (response.status >= 500) {
        const body = await response.text();

        console.error(`Server error ${response.status}: ${body}`);

        if (attempt === retries) {
          return {
            success: false,
            status: response.status,
            error: body || response.statusText,
          };
        }

        const delay = 1000 * 2 ** (attempt - 1);

        console.log(`Retrying in ${delay / 1000} seconds...`);

        await new Promise((resolve) => setTimeout(resolve, delay));

        continue;
      }

      // Other HTTP errors (400, 401, 403, 404, etc.)
      // These usually shouldn't be retried.
      if (!response.ok) {
        const body = await response.text();

        return {
          success: false,
          status: response.status,
          error: body || response.statusText,
        };
      }

      // Successful request
      return {
        success: true,
        response,
      };
    } catch (error) {
      console.error(
        `Fetch failed (attempt ${attempt}/${retries}):`,
        error.message,
      );

      // All attempts exhausted
      if (attempt === retries) {
        return {
          success: false,
          error: error.message,
        };
      }

      // Exponential backoff: 1s → 2s → 4s → 8s
      const delay = 1000 * 2 ** (attempt - 1);

      console.log(`Retrying in ${delay / 1000} seconds...`);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
