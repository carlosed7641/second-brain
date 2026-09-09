import type { FileRow } from "./types";

/**
 * Extracción de metadatos estructurados (vencimientos, importes, contraparte…)
 * con `claude-haiku-4-5`. Implementación completa en la Fase 5; por ahora es un
 * no-op para que el pipeline de ingesta tenga el paso cableado.
 */
export async function extractAndStoreMetadata(_file: FileRow): Promise<void> {
  // Fase 5.
}
