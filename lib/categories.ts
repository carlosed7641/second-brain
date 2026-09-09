/** Carpetas/categorías del segundo cerebro (basadas en las imágenes de referencia). */
export const CATEGORIES = [
  "Contratos",
  "Contratos de alquiler",
  "Seguros",
  "Finanzas",
  "Salud",
  "Notas",
  "Recibos",
  "Documentos e IDs",
  "PDFs",
  "Otros",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DEFAULT_CATEGORY: Category = "Otros";

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}
