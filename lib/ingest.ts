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

export interface RegisterResult {
  file: FileRow;
  /** false si era un duplicado ya indexado (no hay nada que procesar). */
  isNew: boolean;
}

/**
 * Registra el archivo en la BD: dedupe por hash + `INSERT`. Es rápido (leer
 * bytes + un hash + una consulta) y se ejecuta **síncronamente con la petición
 * HTTP que sube el archivo** — a diferencia del pipeline pesado (extraer,
 * trocear, embeddings), que va a la cola. Así, en cuanto la API responde, la
 * fila ya existe y el cliente la ve de inmediato al refrescar — sin esto hay
 * una carrera: el cliente puede refrescar antes de que la fila exista.
 */
export async function registerFile(
  absPath: string,
  originalName: string,
  category?: string,
): Promise<RegisterResult> {
  ensureDataDirs();
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
    return { file: dup, isNew: false };
  }

  const id = crypto.randomUUID();
  const file = insertFile({
    id,
    path: absPath,
    original_name: originalName,
    category,
    mime: MIME_BY_EXT[ext] ?? "application/octet-stream",
    ext,
    size_bytes: buf.byteLength,
    hash,
  });
  return { file, isNew: true };
}

/** Ejecuta el pipeline pesado para un archivo ya registrado. Encolar esto, no `registerFile`. */
export async function processFile(id: string): Promise<FileRow> {
  const file = getFile(id);
  if (!file) throw new Error("Archivo no encontrado");
  return runPipeline(id, file.path, file.original_name);
}

/** Azúcar para el watcher: registra + procesa en un solo paso encolado. */
export async function ingestFile(input: IngestInput): Promise<FileRow> {
  const { file, isNew } = await registerFile(input.absPath, input.originalName, input.category);
  if (!isNew) return file;
  return processFile(file.id);
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
 * Prepara un archivo para reindexar: borra sus chunks/vectores y lo deja en
 * 'pending' — síncrono, para que se refleje ya en `GET /api/files`. El trabajo
 * pesado se encola aparte con `processFile(id)`.
 */
export function prepareReindex(id: string): FileRow {
  const file = getFile(id);
  if (!file) throw new Error("Archivo no encontrado");
  clearChunks(id);
  setStatus(id, "pending");
  return getFile(id)!;
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
