export async function dbWithRetry(operation, retries = 3, delay = 2000) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      console.error(
        `Database operation failed (attempt ${attempt}/${retries}):`,
        error.message,
      );

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
