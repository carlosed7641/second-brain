import type { Category } from "./categories";

export type FileStatus =
  | "pending"
  | "extracting"
  | "chunking"
  | "embedding"
  | "metadata"
  | "indexed"
  | "error";

export interface FileRow {
  id: string;
  path: string;
  original_name: string;
  category: Category;
  mime: string;
  ext: string;
  size_bytes: number;
  hash: string;
  status: FileStatus;
  status_detail: string | null;
  error: string | null;
  page_count: number | null;
  chunk_count: number;
  ocr: 0 | 1;
  created_at: string;
  indexed_at: string | null;
}

export interface ChunkRow {
  id: string;
  file_id: string;
  idx: number;
  content: string;
  page: number | null;
  char_start: number | null;
  char_end: number | null;
  token_count: number;
}

export interface ChatSessionRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export type MessageRole = "user" | "assistant";

export interface Citation {
  n: number;
  file_id: string;
  file_name: string;
  category: Category;
  page: number | null;
  snippet: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  citations: string | null; // JSON de Citation[]
  usage: string | null; // JSON de TokenUsage
  created_at: string;
}

export type MetadataKey =
  | "tipo"
  | "contraparte"
  | "vencimiento"
  | "fecha_inicio"
  | "fecha_firma"
  | "importe"
  | "periodicidad"
  | "referencia"
  | "titular";

export interface DocMetadataRow {
  id: string;
  file_id: string;
  key: MetadataKey | string;
  value: string;
  value_date: string | null; // ISO 8601
  value_num: number | null;
  confidence: number | null;
  page: number | null;
}

/** Fragmento recuperado, listo para ensamblar contexto. */
export interface RetrievedChunk {
  chunk_id: string;
  file_id: string;
  file_name: string;
  category: Category;
  page: number | null;
  content: string;
  token_count: number;
  score: number;
}
