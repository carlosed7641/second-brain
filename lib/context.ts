import { CONTEXT_TOKEN_BUDGET } from "./config";
import type { Citation, RetrievedChunk } from "./types";

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
