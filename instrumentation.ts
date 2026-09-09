/**
 * Hook de arranque de Next.js. Se ejecuta una vez cuando arranca el servidor:
 * inicializa la base de datos (aplica migraciones) y arranca el watcher de
 * data/inbox/.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getDb } = await import("./lib/db");
  getDb();
  console.log("[second-brain] base de datos lista");

  const { startInboxWatcher } = await import("./lib/watcher");
  await startInboxWatcher();
}
