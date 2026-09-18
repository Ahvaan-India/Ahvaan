/**
 * Server boot hook: warm the city-board cache in the background so the
 * first dashboard load (heatmap/summary) is instant instead of paying the
 * cold board build (~141 small weather queries + in-memory risk math).
 * Fire-and-forget — a warm failure only means the first request builds it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { getBoard } = await import("./lib/board");
      getBoard(2).catch(() => {});
    } catch {
      // never break boot
    }
  }
}
