import { getDb } from "./db";
import { embedQuery } from "./embed";
import { RETRIEVE_TOP_K } from "./config";
import type { Category } from "./categories";
import type { RetrievedChunk } from "./types";

/**
 * Búsqueda híbrida: vector (sqlite-vec KNN) + palabra clave (FTS5), fusionados
 * con Reciprocal Rank Fusion. Devuelve los `k` mejores fragmentos hidratados con
 * el nombre y la categoría de su archivo.
 */

const RRF_K = 60;

export interface HybridSearchOptions {
  k?: number;
  /** Nº de candidatos que pide cada método antes de fusionar. */
  pool?: number;
  /** Limitar a un archivo concreto (p. ej. "muéstrame mi contrato"). */
  fileId?: string;
}

export async function hybridSearch(
  query: string,
  { k = RETRIEVE_TOP_K, pool = 40, fileId }: HybridSearchOptions = {},
): Promise<RetrievedChunk[]> {
  const db = getDb();

  const qVec = await embedQuery(query);
  const vecRows = db
    .prepare(
      `SELECT chunk_id FROM chunk_vec
       WHERE embedding MATCH ? AND k = ?
       ${fileId ? "AND file_id = ?" : ""}
       ORDER BY distance`,
    )
    .all(...(fileId ? [JSON.stringify(qVec), pool, fileId] : [JSON.stringify(qVec), pool])) as {
    chunk_id: string;
  }[];

  let ftsRows: { chunk_id: string }[] = [];
  const match = toFtsMatch(query);
  if (match) {
    try {
      ftsRows = db
        .prepare(
          `SELECT chunk_id FROM chunks_fts
           WHERE chunks_fts MATCH ? ${fileId ? "AND file_id = ?" : ""}
           ORDER BY rank LIMIT ?`,
        )
        .all(...(fileId ? [match, fileId, pool] : [match, pool])) as { chunk_id: string }[];
    } catch {
      ftsRows = []; // consulta rara para FTS -> seguimos solo con vectores
    }
  }

  // Reciprocal Rank Fusion.
  const scores = new Map<string, number>();
  const add = (rows: { chunk_id: string }[]) =>
    rows.forEach((r, i) => scores.set(r.chunk_id, (scores.get(r.chunk_id) ?? 0) + 1 / (RRF_K + i + 1)));
  add(vecRows);
  add(ftsRows);

  const rankedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id]) => id);
  if (rankedIds.length === 0) return [];

  const placeholders = rankedIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT c.id AS chunk_id, c.file_id, c.content, c.page, c.token_count,
              f.original_name AS file_name, f.category
       FROM chunks c JOIN files f ON f.id = c.file_id
       WHERE c.id IN (${placeholders})`,
    )
    .all(...rankedIds) as Array<{
    chunk_id: string;
    file_id: string;
    content: string;
    page: number | null;
    token_count: number;
    file_name: string;
    category: Category;
  }>;

  const byId = new Map(rows.map((r) => [r.chunk_id, r]));
  return rankedIds
    .map((id) => {
      const r = byId.get(id);
      return r ? ({ ...r, score: scores.get(id) ?? 0 } as RetrievedChunk) : null;
    })
    .filter((x): x is RetrievedChunk => x !== null);
}

/** Convierte texto libre en una consulta MATCH de FTS5 segura: `"tok1" OR "tok2"`. */
function toFtsMatch(query: string): string | null {
  const tokens = query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .slice(0, 12);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "y", "o", "u",
  "que", "qué", "cual", "cuál", "cuando", "cuándo", "cuanto", "cuánto", "como", "cómo",
  "es", "son", "mi", "mis", "tu", "tus", "su", "sus", "me", "te", "se", "lo", "en", "con",
  "por", "para", "the", "a", "an", "of", "to", "is", "are", "my",
]);
