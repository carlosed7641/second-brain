import { encode } from "gpt-tokenizer";

/**
 * Conteo aproximado de tokens (cl100k). Sirve para dimensionar chunks y el
 * presupuesto de contexto; la tokenización real de Claude/Voyage difiere algo
 * pero la aproximación es suficiente para decidir límites.
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}
