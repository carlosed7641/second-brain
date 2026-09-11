import { unlink } from "node:fs/promises";
import { getDb } from "./db";
import type { Chunk } from "./chunk";
import type { FileRow, FileStatus } from "./types";
import { DEFAULT_CATEGORY, isCategory, type Category } from "./categories";

/** Helpers de acceso a datos para archivos y sus chunks. */

export function getFile(id: string): FileRow | undefined {
  return getDb().prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRow | undefined;
}

export function getFileByHash(hash: string): FileRow | undefined {
  return getDb().prepare("SELECT * FROM files WHERE hash = ?").get(hash) as FileRow | undefined;
}

export function listFiles(): FileRow[] {
  return getDb()
    .prepare("SELECT * FROM files ORDER BY datetime(created_at) DESC")
    .all() as FileRow[];
}

export interface NewFile {
  id: string;
  path: string;
  original_name: string;
  category?: string;
  mime: string;
  ext: string;
  size_bytes: number;
  hash: string;
}

export function insertFile(f: NewFile): FileRow {
  const category: Category =
    f.category && isCategory(f.category) ? f.category : DEFAULT_CATEGORY;
  getDb()
    .prepare(
      `INSERT INTO files (id, path, original_name, category, mime, ext, size_bytes, hash, status)
       VALUES (@id, @path, @original_name, @category, @mime, @ext, @size_bytes, @hash, 'pending')`,
    )
    .run({ ...f, category });
  return getFile(f.id)!;
}

/**
 * Actualiza el nombre visible y/o la categoría de un archivo. Campos omitidos
 * (`undefined`) no se tocan. No renombra ni mueve nada en disco: solo cambia
 * cómo se muestra/organiza en la app.
 */
export function updateFile(
  id: string,
  patch: { original_name?: string; category?: string },
): FileRow | undefined {
  if (!getFile(id)) return undefined;
  const name = patch.original_name?.trim() || null; // "" o undefined -> no tocar
  const category = patch.category && isCategory(patch.category) ? patch.category : null;
  getDb()
    .prepare(
      `UPDATE files SET
         original_name = COALESCE(?, original_name),
         category      = COALESCE(?, category)
       WHERE id = ?`,
    )
    .run(name, category, id);
  return getFile(id);
}

export function setStatus(
  id: string,
  status: FileStatus,
  detail?: string | null,
  error?: string | null,
): void {
  getDb()
    .prepare(
      `UPDATE files SET status = ?, status_detail = ?, error = ?,
         indexed_at = CASE WHEN ? = 'indexed' THEN datetime('now') ELSE indexed_at END
       WHERE id = ?`,
    )
    .run(status, detail ?? null, error ?? null, status, id);
}

/** Inserta chunks + vectores + FTS en una transacción. */
export function saveChunks(fileId: string, chunks: Chunk[], embeddings: number[][]): void {
  const db = getDb();
  const insChunk = db.prepare(
    `INSERT INTO chunks (id, file_id, idx, content, page, char_start, char_end, token_count)
     VALUES (@id, @file_id, @idx, @content, @page, @char_start, @char_end, @token_count)`,
  );
  const insVec = db.prepare(
    "INSERT INTO chunk_vec (chunk_id, file_id, embedding) VALUES (?, ?, ?)",
  );
  const insFts = db.prepare(
    "INSERT INTO chunks_fts (chunk_id, file_id, content) VALUES (?, ?, ?)",
  );

  const tx = db.transaction(() => {
    chunks.forEach((c, i) => {
      const id = `${fileId}:${c.idx}`;
      insChunk.run({ id, file_id: fileId, ...c });
      insVec.run(id, fileId, JSON.stringify(embeddings[i]));
      insFts.run(id, fileId, c.content);
    });
    db.prepare("UPDATE files SET chunk_count = ? WHERE id = ?").run(chunks.length, fileId);
  });
  tx();
}

/** Borra chunks/vectores/FTS/metadatos de un archivo (para reindexar). */
export function clearChunks(fileId: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM chunks WHERE file_id = ?").run(fileId);
    db.prepare("DELETE FROM chunk_vec WHERE file_id = ?").run(fileId);
    db.prepare("DELETE FROM chunks_fts WHERE file_id = ?").run(fileId);
    db.prepare("DELETE FROM doc_metadata WHERE file_id = ?").run(fileId);
    db.prepare("UPDATE files SET chunk_count = 0 WHERE id = ?").run(fileId);
  });
  tx();
}

/** Elimina el archivo por completo: BD (chunks incluidos) + disco. */
export async function deleteFileCompletely(id: string): Promise<boolean> {
  const file = getFile(id);
  if (!file) return false;
  clearChunks(id); // chunks / chunk_vec / chunks_fts / doc_metadata (tablas virtuales sin cascade)
  getDb().prepare("DELETE FROM files WHERE id = ?").run(id);
  await unlink(file.path).catch(() => {});
  return true;
}
