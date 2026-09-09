import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Extracción de texto por "página". `page` es 1-indexado; para formatos sin
 * páginas reales (DOCX, texto plano) se usa `null` y para hojas de cálculo el
 * índice de la hoja.
 */

export interface ExtractedPage {
  page: number | null;
  text: string;
}

export interface ExtractResult {
  pages: ExtractedPage[];
  pageCount: number | null;
  /** true si hubo que recurrir a OCR. */
  ocr: boolean;
}

const TEXT_EXTS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".log",
  ".rtf",
]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);

export function isSupported(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return (
    ext === ".pdf" ||
    ext === ".docx" ||
    ext === ".xlsx" ||
    ext === ".xls" ||
    TEXT_EXTS.has(ext) ||
    IMAGE_EXTS.has(ext)
  );
}

export async function extract(absPath: string): Promise<ExtractResult> {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".pdf") return extractPdf(absPath);
  if (ext === ".docx") return extractDocx(absPath);
  if (ext === ".xlsx" || ext === ".xls") return extractSpreadsheet(absPath);
  if (IMAGE_EXTS.has(ext)) return extractImage(absPath);
  if (TEXT_EXTS.has(ext)) return extractText(absPath);
  throw new Error(`Tipo de archivo no soportado: ${ext}`);
}

async function extractText(absPath: string): Promise<ExtractResult> {
  const text = await readFile(absPath, "utf8");
  return { pages: [{ page: 1, text: normalize(text) }], pageCount: 1, ocr: false };
}

async function extractDocx(absPath: string): Promise<ExtractResult> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ path: absPath });
  return { pages: [{ page: null, text: normalize(value) }], pageCount: null, ocr: false };
}

async function extractSpreadsheet(absPath: string): Promise<ExtractResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.readFile(absPath, { cellDates: true });
  const pages: ExtractedPage[] = wb.SheetNames.map((name, i) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    return { page: i + 1, text: normalize(`[Hoja: ${name}]\n${csv}`) };
  }).filter((p) => p.text.length > 0);
  return { pages, pageCount: pages.length, ocr: false };
}

/** Umbral por debajo del cual se considera que una página no tiene capa de texto. */
const MIN_CHARS_PER_PAGE = 12;

async function extractPdf(absPath: string): Promise<ExtractResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(absPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const pages: ExtractedPage[] = [];
  let emptyPages = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let text = "";
    let lastY: number | undefined;
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = item.transform?.[5];
      if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 1) text += "\n";
      text += item.str;
      lastY = y;
    }
    text = normalize(text);
    if (text.length < MIN_CHARS_PER_PAGE) emptyPages++;
    pages.push({ page: n, text });
  }

  // PDF escaneado (sin capa de texto en la mayoría de páginas) -> OCR.
  if (doc.numPages > 0 && emptyPages / doc.numPages > 0.6) {
    return ocrPdf(absPath, doc.numPages);
  }
  return { pages, pageCount: doc.numPages, ocr: false };
}

async function ocrPdf(absPath: string, pageCount: number): Promise<ExtractResult> {
  const { pdf } = await import("pdf-to-img");
  const worker = await createOcrWorker();
  try {
    const pages: ExtractedPage[] = [];
    let n = 0;
    const doc = await pdf(absPath, { scale: 2 });
    for await (const imageBuffer of doc) {
      n++;
      const { data } = await worker.recognize(imageBuffer);
      pages.push({ page: n, text: normalize(data.text) });
    }
    return { pages, pageCount: pages.length || pageCount, ocr: true };
  } finally {
    await worker.terminate();
  }
}

async function extractImage(absPath: string): Promise<ExtractResult> {
  const worker = await createOcrWorker();
  try {
    const { data } = await worker.recognize(absPath);
    return { pages: [{ page: 1, text: normalize(data.text) }], pageCount: 1, ocr: true };
  } finally {
    await worker.terminate();
  }
}

async function createOcrWorker() {
  const { createWorker } = await import("tesseract.js");
  // spa + eng cubre la administración personal en español con términos en inglés.
  return createWorker(["spa", "eng"]);
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ") // NBSP -> espacio normal
    .replace(/[ \t]+\n/g, "\n") // espacios al final de linea
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
