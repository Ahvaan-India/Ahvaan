/**
 * Server boot hook & global error handler for Next.js background workers.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("unhandledRejection", (reason) => {
      // Prevent build worker exit on transient worker promises
      const msg = reason instanceof Error ? reason.message : String(reason);
      if (msg.includes("PageNotFoundError") || msg.includes("/_document")) {
        return;
      }
      console.warn("Handled background unhandledRejection:", msg);
    });
  }
}
