import type { Citation, TokenUsage } from "@/lib/types";

export const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

export interface SessionDTO {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageDTO {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  usage: TokenUsage | null;
  created_at: string;
}

export interface FileDTO {
  id: string;
  original_name: string;
  category: string;
  status:
    | "pending"
    | "extracting"
    | "chunking"
    | "embedding"
    | "metadata"
    | "indexed"
    | "error";
  status_detail: string | null;
  error: string | null;
  page_count: number | null;
  chunk_count: number;
  ocr: 0 | 1;
  size_bytes: number;
  ext: string;
  created_at: string;
  indexed_at: string | null;
}

export const STATUS_LABEL: Record<FileDTO["status"], string> = {
  pending: "En cola",
  extracting: "Extrayendo texto",
  chunking: "Troceando",
  embedding: "Generando embeddings",
  metadata: "Extrayendo metadatos",
  indexed: "Indexado",
  error: "Error",
};

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function rawUrl(fileId: string, page?: number | null): string {
  return `/api/files/${fileId}/raw${page ? `#page=${page}` : ""}`;
}
