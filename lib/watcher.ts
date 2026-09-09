import path from "node:path";
import { INBOX_DIR, ensureDataDirs } from "./config";
import { enqueueIngest, ingestLooseFile } from "./ingest";

/**
 * Vigila data/inbox/. Cuando aparece un archivo (y termina de escribirse), lo
 * mueve a data/files/ y lo encola para ingesta. Arrancado desde
 * instrumentation.ts; se protege con un flag en globalThis para no duplicar el
 * watcher en el hot-reload de desarrollo.
 */

const g = globalThis as unknown as { __sbWatcher?: boolean };

export async function startInboxWatcher(): Promise<void> {
  if (g.__sbWatcher) return;
  g.__sbWatcher = true;
  ensureDataDirs();

  const chokidar = await import("chokidar");
  const watcher = chokidar.watch(INBOX_DIR, {
    ignoreInitial: false, // procesa lo que ya estuviera en inbox al arrancar
    depth: 0,
    ignored: (p: string) => path.basename(p).startsWith("."),
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 300 },
  });

  watcher.on("add", (filePath: string) => {
    const name = path.basename(filePath);
    console.log(`[watcher] nuevo en inbox: ${name}`);
    enqueueIngest(() => ingestLooseFile(filePath, name)).catch((e) =>
      console.error(`[watcher] fallo con ${name}:`, e instanceof Error ? e.message : e),
    );
  });

  watcher.on("error", (err: unknown) => console.error("[watcher] error:", err));
  console.log(`[watcher] vigilando ${INBOX_DIR}`);
}
