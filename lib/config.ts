import path from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Configuración central. Los paths se resuelven una vez. Las claves de API
 * viven en lib/settings.ts (pantalla de configuración, con el `.env` como
 * respaldo).
 */

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
export const INBOX_DIR = path.join(DATA_DIR, "inbox");
export const FILES_DIR = path.join(DATA_DIR, "files");
export const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(DATA_DIR, "second-brain.db");

export const CHAT_MODEL = process.env.CHAT_MODEL ?? "claude-opus-5";
export const FAST_MODEL = process.env.FAST_MODEL ?? "claude-haiku-4-5";
export const EMBED_MODEL = process.env.EMBED_MODEL ?? "voyage-3.5-lite";
export const EMBED_DIM = Number(process.env.EMBED_DIM ?? 1024);

/** Presupuesto de tokens para el contexto recuperado que se envía a Claude. */
export const CONTEXT_TOKEN_BUDGET = Number(process.env.CONTEXT_TOKEN_BUDGET ?? 12_000);
/** Nº de fragmentos a recuperar por consulta antes de recortar por presupuesto. */
export const RETRIEVE_TOP_K = Number(process.env.RETRIEVE_TOP_K ?? 8);

let dirsReady = false;
/** Crea data/, data/inbox/ y data/files/ si no existen. Idempotente. */
export function ensureDataDirs(): void {
  if (dirsReady) return;
  for (const dir of [DATA_DIR, INBOX_DIR, FILES_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
  dirsReady = true;
}
