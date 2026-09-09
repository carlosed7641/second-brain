import { createHash } from "node:crypto";
import { EMBED_DIM, EMBED_MODEL, voyageApiKey } from "./config";

/**
 * Embeddings con Voyage AI. `input_type` mejora la recuperación distinguiendo
 * documento vs. consulta. En dev sin `VOYAGE_API_KEY` se puede exportar
 * `EMBED_FAKE=1` para generar vectores deterministas y probar el pipeline
 * offline (NO usar en producción: la recuperación no será semántica).
 */

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const BATCH_SIZE = 96;
const MAX_RETRIES = 4;

type InputType = "document" | "query";

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return embedBatched(texts, "document");
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedBatched([text], "query");
  return vec;
}

async function embedBatched(texts: string[], inputType: InputType): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (process.env.EMBED_FAKE === "1") return texts.map(fakeVector);

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    out.push(...(await embedOnce(batch, inputType)));
  }
  return out;
}

async function embedOnce(batch: string[], inputType: InputType): Promise<number[][]> {
  const key = voyageApiKey();
  let attempt = 0;
  for (;;) {
    attempt++;
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: batch,
        input_type: inputType,
        output_dimension: EMBED_DIM,
        truncation: true,
      }),
    });

    if (res.ok) {
      const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }

    const body = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt > MAX_RETRIES) {
      throw new Error(`Voyage ${res.status}: ${body.slice(0, 300)}`);
    }
    const wait = Math.min(30_000, 500 * 2 ** (attempt - 1)) + Math.random() * 400;
    await new Promise((r) => setTimeout(r, wait));
  }
}

/** Vector pseudoaleatorio pero determinista a partir del texto (solo dev). */
function fakeVector(text: string): number[] {
  const seedBuf = createHash("sha256").update(text).digest();
  let s = seedBuf.readUInt32BE(0) || 1;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
  const v = Array.from({ length: EMBED_DIM }, rand);
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}
