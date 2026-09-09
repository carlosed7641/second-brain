import { randomUUID } from "node:crypto";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./claude";
import { getDb } from "./db";
import { FAST_MODEL } from "./config";
import type { FileRow, MetadataHit } from "./types";

/**
 * Extracción de metadatos administrativos (vencimientos, importes, contraparte…)
 * con el modelo barato y salida estructurada. Se ejecuta en la ingesta; alimenta
 * la vista de "próximos vencimientos" y la ruta SQL del chat.
 */

const META_KEYS = [
  "tipo",
  "contraparte",
  "vencimiento",
  "fecha_inicio",
  "fecha_firma",
  "importe",
  "periodicidad",
  "referencia",
  "titular",
] as const;

const Item = z.object({
  key: z.enum(META_KEYS),
  label: z.string().describe("Etiqueta corta y humana del concepto, p. ej. 'Seguro del auto'"),
  value: z.string().describe("El valor tal y como aparece en el documento"),
  value_date: z.string().nullable().describe("Fecha en formato YYYY-MM-DD, o null"),
  value_num: z.number().nullable().describe("Importe numérico si aplica, o null"),
  page: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
});
const Schema = z.object({ items: z.array(Item).max(20) });

export async function extractAndStoreMetadata(file: FileRow): Promise<void> {
  const db = getDb();
  const chunks = db
    .prepare("SELECT content, page FROM chunks WHERE file_id = ? ORDER BY idx LIMIT 60")
    .all(file.id) as { content: string; page: number | null }[];
  if (chunks.length === 0) return;

  let text = "";
  for (const c of chunks) {
    if (text.length > 24_000) break;
    text += `\n[p.${c.page ?? "?"}]\n${c.content}\n`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const msg = await getAnthropic().messages.parse({
    model: FAST_MODEL,
    max_tokens: 1024,
    system:
      `Extrae metadatos administrativos del documento "${file.original_name}". Hoy es ${today}.\n` +
      "Solo hechos presentes en el texto, nada inferido de más. Fechas SIEMPRE en formato YYYY-MM-DD " +
      "(si solo hay mes y año, usa el día 01). Importes: value_num con el número y value con el texto original. " +
      "label = etiqueta corta y humana (p. ej. 'Seguro del auto', 'Contrato de alquiler', 'Membresía AA'). " +
      "Si no hay metadatos claros, devuelve items: [].",
    messages: [{ role: "user", content: text.slice(0, 26_000) }],
    output_config: { format: zodOutputFormat(Schema) },
  });

  const items = msg.parsed_output?.items ?? [];
  const ins = db.prepare(
    `INSERT INTO doc_metadata (id, file_id, key, label, value, value_date, value_num, confidence, page)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM doc_metadata WHERE file_id = ?").run(file.id);
    for (const it of items) {
      if (it.confidence < 0.35) continue;
      ins.run(
        randomUUID(),
        file.id,
        it.key,
        it.label.slice(0, 120),
        it.value.slice(0, 400),
        normalizeDate(it.value_date),
        it.value_num,
        it.confidence,
        it.page,
      );
    }
  });
  tx();
}

export interface QueryMetadataOptions {
  keys?: string[];
  upcoming?: boolean;
  fileId?: string;
  limit?: number;
}

/** Consulta directa a doc_metadata (ruta SQL del chat y vista de vencimientos). */
export function queryMetadata({
  keys,
  upcoming,
  fileId,
  limit = 50,
}: QueryMetadataOptions = {}): MetadataHit[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (keys && keys.length) {
    where.push(`m.key IN (${keys.map(() => "?").join(",")})`);
    params.push(...keys);
  }
  if (fileId) {
    where.push("m.file_id = ?");
    params.push(fileId);
  }
  if (upcoming) where.push("m.value_date IS NOT NULL AND m.value_date >= date('now')");

  const sql = `
    SELECT m.*, f.original_name AS file_name, f.category
    FROM doc_metadata m JOIN files f ON f.id = m.file_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY (m.value_date IS NULL), m.value_date ASC, m.confidence DESC
    LIMIT ?`;
  params.push(limit);
  return getDb().prepare(sql).all(...params) as MetadataHit[];
}

function normalizeDate(input: string | null): string | null {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}
