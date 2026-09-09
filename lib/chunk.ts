import { encode, decode } from "gpt-tokenizer";
import type { ExtractedPage } from "./extract";

export interface Chunk {
  idx: number;
  content: string;
  page: number | null;
  char_start: number;
  char_end: number;
  token_count: number;
}

export interface ChunkOptions {
  targetTokens?: number;
  overlapTokens?: number;
  minTokens?: number;
}

const DEFAULTS = { targetTokens: 650, overlapTokens: 100, minTokens: 24 };

/**
 * Trocea el texto extraído en fragmentos de ~`targetTokens` con solape.
 * Los chunks NO cruzan páginas, para que la cita de página sea exacta.
 */
export function chunkPages(pages: ExtractedPage[], opts: ChunkOptions = {}): Chunk[] {
  const { targetTokens, overlapTokens, minTokens } = { ...DEFAULTS, ...opts };
  const chunks: Chunk[] = [];
  let idx = 0;

  for (const { page, text } of pages) {
    if (!text.trim()) continue;
    for (const seg of splitPage(text, targetTokens, overlapTokens)) {
      if (seg.tokens < minTokens && chunks.length > 0 && chunks[chunks.length - 1].page === page) {
        // Cola muy pequeña: pégala al chunk anterior de la misma página.
        const prev = chunks[chunks.length - 1];
        prev.content = `${prev.content}\n${seg.content}`;
        prev.char_end = seg.char_end;
        prev.token_count = encode(prev.content).length;
        continue;
      }
      chunks.push({
        idx: idx++,
        content: seg.content,
        page,
        char_start: seg.char_start,
        char_end: seg.char_end,
        token_count: seg.tokens,
      });
    }
  }
  return chunks;
}

interface Seg {
  content: string;
  char_start: number;
  char_end: number;
  tokens: number;
}

/** Divide el texto de una página en segmentos por párrafo, con solape por tokens. */
function splitPage(text: string, target: number, overlap: number): Seg[] {
  const paras = splitParagraphs(text);
  const segs: Seg[] = [];

  let bucket: { p: string; start: number; end: number }[] = [];
  let bucketTokens = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    const content = bucket.map((b) => b.p).join("\n\n");
    segs.push({
      content,
      char_start: bucket[0].start,
      char_end: bucket[bucket.length - 1].end,
      tokens: encode(content).length,
    });
    // Solape: arrastra los últimos párrafos hasta ~`overlap` tokens.
    const carried: typeof bucket = [];
    let carriedTokens = 0;
    for (let i = bucket.length - 1; i >= 0 && carriedTokens < overlap; i--) {
      carried.unshift(bucket[i]);
      carriedTokens += encode(bucket[i].p).length;
    }
    bucket = carried;
    bucketTokens = carriedTokens;
  };

  for (const para of paras) {
    const pTokens = encode(para.p).length;

    if (pTokens > target) {
      // Párrafo gigante: vacía el bucket y parte el párrafo por tokens.
      flush();
      bucket = [];
      bucketTokens = 0;
      for (const piece of hardSplit(para.p, para.start, target, overlap)) segs.push(piece);
      continue;
    }

    if (bucketTokens + pTokens > target && bucket.length > 0) flush();
    bucket.push(para);
    bucketTokens += pTokens;
  }
  flush();
  return segs;
}

function splitParagraphs(text: string): { p: string; start: number; end: number }[] {
  const out: { p: string; start: number; end: number }[] = [];
  const re = /[^\n]+(?:\n(?!\n)[^\n]+)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const p = m[0].trim();
    if (p) out.push({ p, start: m.index, end: m.index + m[0].length });
  }
  return out.length ? out : [{ p: text.trim(), start: 0, end: text.length }];
}

/** Parte un texto largo en trozos de `target` tokens con `overlap` de solape. */
function hardSplit(text: string, baseOffset: number, target: number, overlap: number): Seg[] {
  const ids = encode(text);
  const out: Seg[] = [];
  const step = Math.max(1, target - overlap);
  for (let i = 0; i < ids.length; i += step) {
    const slice = ids.slice(i, i + target);
    const content = decode(slice).trim();
    if (!content) continue;
    // Offsets aproximados (proporción de tokens); suficiente para depurar.
    const char_start = baseOffset + Math.floor((i / ids.length) * text.length);
    const char_end = baseOffset + Math.floor(((i + slice.length) / ids.length) * text.length);
    out.push({ content, char_start, char_end, tokens: slice.length });
    if (i + target >= ids.length) break;
  }
  return out;
}
