/**
 * Hook de arranque de Next.js. Se ejecuta una vez cuando arranca el servidor.
 * Aquí inicializamos la base de datos (aplica migraciones) y —desde la Fase 2—
 * el watcher de la carpeta data/inbox/.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getDb } = await import("./lib/db");
  getDb();
  console.log("[second-brain] base de datos lista");

  // Fase 2:
  // const { startInboxWatcher } = await import("./lib/watcher");
  // startInboxWatcher();
}
