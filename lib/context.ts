import { CONTEXT_TOKEN_BUDGET } from "./config";
import type { Citation, MetadataHit, RetrievedChunk } from "./types";

/**
 * Ensambla el bloque de contexto que se le pasa a Claude, respetando el
 * presupuesto de tokens, y produce las citas paralelas (misma numeración).
 */

export interface AssembledContext {
  contextText: string;
  citations: Citation[];
  chunksUsed: number;
  tokensUsed: number;
}

export function assembleContext(
  chunks: RetrievedChunk[],
  budget = CONTEXT_TOKEN_BUDGET,
): AssembledContext {
  const picked: RetrievedChunk[] = [];
  let tokensUsed = 0;
  for (const c of chunks) {
    const cost = c.token_count || Math.ceil(c.content.length / 4);
    if (picked.length > 0 && tokensUsed + cost > budget) break;
    picked.push(c);
    tokensUsed += cost;
  }

  const citations: Citation[] = picked.map((c, i) => ({
    n: i + 1,
    file_id: c.file_id,
    file_name: c.file_name,
    category: c.category,
    page: c.page,
    snippet: firstLine(c.content, 160),
  }));

  const contextText = picked
    .map((c, i) => {
      const loc = c.page != null ? ` · p.${c.page}` : "";
      return `[${i + 1}] ${c.file_name}${loc}\n${c.content}`;
    })
    .join("\n\n---\n\n");

  return { contextText, citations, chunksUsed: picked.length, tokensUsed };
}

/** Contexto a partir de metadatos ya estructurados (ruta SQL, sin recuperación). */
export function assembleMetadataContext(hits: MetadataHit[]): AssembledContext {
  const citations: Citation[] = hits.map((h, i) => ({
    n: i + 1,
    file_id: h.file_id,
    file_name: h.file_name,
    category: h.category,
    page: h.page,
    snippet: `${h.label ?? h.key}: ${h.value}`,
  }));
  const contextText = hits
    .map((h, i) => {
      const loc = h.page != null ? ` · p.${h.page}` : "";
      const iso = h.value_date ? ` (${h.value_date})` : "";
      return `[${i + 1}] ${h.file_name}${loc} — ${h.label ?? h.key}: ${h.value}${iso}`;
    })
    .join("\n");
  return { contextText, citations, chunksUsed: hits.length, tokensUsed: 0 };
}

/** Envuelve la pregunta del usuario con el contexto recuperado. */
export function buildUserTurn(question: string, contextText: string): string {
  if (!contextText) {
    return `No hay fragmentos relevantes en los documentos.\n\nPregunta: ${question}`;
  }
  return `FRAGMENTOS DE MIS DOCUMENTOS:\n\n${contextText}\n\n---\n\nPregunta: ${question}`;
}

function firstLine(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
