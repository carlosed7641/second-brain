import { createHash } from "node:crypto";
import { readFile, rename, unlink, copyFile } from "node:fs/promises";
import path from "node:path";
import { FILES_DIR, ensureDataDirs } from "./config";
import { getDb } from "./db";
import { extract, isSupported } from "./extract";
import { chunkPages } from "./chunk";
import { embedDocuments } from "./embed";
import {
  clearChunks,
  getFile,
  getFileByHash,
  insertFile,
  saveChunks,
  setStatus,
} from "./files";
import { extractAndStoreMetadata } from "./metadata";
import type { FileRow } from "./types";

/**
 * Orquesta la ingesta de un archivo: extraer -> trocear -> embeddings -> guardar
 * -> metadatos. Un único worker en serie (una ingesta a la vez) evita saturar la
 * API de embeddings y la escritura en SQLite.
 */

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".json": "application/json",
  ".log": "text/plain",
  ".rtf": "application/rtf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

let chain: Promise<unknown> = Promise.resolve();

/** Encola una ingesta y devuelve una promesa que resuelve al terminar. */
export function enqueueIngest<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => {});
  return run as Promise<T>;
}

export interface IngestInput {
  /** Ruta del archivo YA colocado dentro de data/files/. */
  absPath: string;
  originalName: string;
  category?: string;
}

export async function ingestFile(input: IngestInput): Promise<FileRow> {
  ensureDataDirs();
  const { absPath, originalName, category } = input;
  const ext = path.extname(originalName).toLowerCase();

  if (!isSupported(originalName)) {
    await unlink(absPath).catch(() => {});
    throw new Error(`Tipo de archivo no soportado: ${ext || "(sin extensión)"}`);
  }

  const buf = await readFile(absPath);
  const hash = createHash("sha256").update(buf).digest("hex");

  const dup = getFileByHash(hash);
  if (dup) {
    if (path.resolve(dup.path) !== path.resolve(absPath)) await unlink(absPath).catch(() => {});
    console.log(`[ingest] duplicado (${originalName}) — ya indexado como ${dup.id}`);
    return dup;
  }

  const id = crypto.randomUUID();
  insertFile({
    id,
    path: absPath,
    original_name: originalName,
    category,
    mime: MIME_BY_EXT[ext] ?? "application/octet-stream",
    ext,
    size_bytes: buf.byteLength,
    hash,
  });

  return runPipeline(id, absPath, originalName);
}

/**
 * Pipeline de extraer -> trocear -> embeber -> guardar -> metadatos, para un
 * archivo YA registrado en `files` (con `id`). Lo comparten `ingestFile` (tras
 * insertar la fila) y `reindexFile` (que reutiliza la fila existente, sin pasar
 * por la comprobación de duplicados: sería un "duplicado" de sí mismo).
 */
async function runPipeline(id: string, absPath: string, originalName: string): Promise<FileRow> {
  try {
    setStatus(id, "extracting");
    const { pages, pageCount, ocr } = await extract(absPath);
    getDb()
      .prepare("UPDATE files SET page_count = ?, ocr = ? WHERE id = ?")
      .run(pageCount ?? null, ocr ? 1 : 0, id);

    setStatus(id, "chunking");
    const chunks = chunkPages(pages);
    if (chunks.length === 0) {
      setStatus(id, "error", null, "No se pudo extraer texto del documento");
      return getFile(id)!;
    }

    setStatus(id, "embedding", `${chunks.length} fragmentos`);
    const embeddings = await embedDocuments(chunks.map((c) => c.content));
    saveChunks(id, chunks, embeddings);

    setStatus(id, "metadata");
    await extractAndStoreMetadata(getFile(id)!).catch((e) =>
      console.warn(`[ingest] metadatos fallaron (${originalName}):`, e),
    );

    setStatus(id, "indexed", `${chunks.length} fragmentos${ocr ? " · OCR" : ""}`);
    console.log(`[ingest] ${originalName} -> indexado (${chunks.length} chunks)`);
    return getFile(id)!;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(id, "error", null, msg);
    console.error(`[ingest] ${originalName} -> error:`, msg);
    return getFile(id)!;
  }
}

/**
 * Reindexa un archivo ya existente: borra sus chunks/vectores y vuelve a correr
 * el pipeline directamente (sin pasar por `ingestFile`, que lo detectaría como
 * "duplicado de sí mismo" por tener el mismo hash y no haría nada).
 */
export async function reindexFile(id: string): Promise<FileRow> {
  const file = getFile(id);
  if (!file) throw new Error("Archivo no encontrado");
  clearChunks(id);
  return runPipeline(id, file.path, file.original_name);
}

/** Mueve un archivo suelto a data/files/ con un nombre único y lo ingesta. */
export async function ingestLooseFile(
  srcPath: string,
  originalName: string,
  category?: string,
): Promise<FileRow> {
  ensureDataDirs();
  const ext = path.extname(originalName);
  const dest = path.join(FILES_DIR, `${crypto.randomUUID()}${ext}`);
  try {
    await rename(srcPath, dest);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await copyFile(srcPath, dest); // distinto sistema de archivos
    await unlink(srcPath).catch(() => {});
  }
  return ingestFile({ absPath: dest, originalName, category });
}
