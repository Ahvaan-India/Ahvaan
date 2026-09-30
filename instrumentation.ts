/**
 * Server boot hook for Next.js background runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Server initialization if needed
  }
}

