# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # dev server — also runs DB migrations and starts the data/inbox/ watcher (instrumentation.ts)
npm run build    # production build
npm run start    # serve production build
npm run lint     # eslint
```

There is no test suite/runner in this repo.

Required env vars in `.env.local` (no `.env.example` checked in): `ANTHROPIC_API_KEY`,
`VOYAGE_API_KEY`. Optional overrides (defaults in `lib/config.ts`): `DATA_DIR`, `DB_PATH`,
`CHAT_MODEL` (default `claude-opus-5`), `FAST_MODEL` (default `claude-haiku-4-5`),
`EMBED_MODEL`, `EMBED_DIM`, `CONTEXT_TOKEN_BUDGET`, `RETRIEVE_TOP_K`. `EMBED_FAKE=1`
skips real Voyage calls for offline dev (`lib/embed.ts`).

## Architecture

Second Brain is a local-first, single-user (no auth) full-stack Next.js app: drop in
documents (PDF, DOCX, TXT/MD, XLSX/CSV, scanned images), then ask questions in natural
language and get streamed answers that cite the source file/page. The central design
constraint throughout the codebase is token cost: expensive work (text extraction,
chunking, embeddings) happens once at ingest time, never per-query; see `PLAN.md` for the
full rationale behind every optimization below.

**Storage.** Everything lives in `data/` (gitignored except `.gitkeep`): original files in
`data/files/`, and a single SQLite file `data/second-brain.db` (via `better-sqlite3`) with
the `sqlite-vec` extension for vector search and `FTS5` for full-text search. Migrations
are driven by `PRAGMA user_version` in `lib/db.ts`. `instrumentation.ts` runs once on
server start (Node runtime only) to apply migrations and start the inbox watcher — this is
the only place that initialization happens, not in route handlers.

**Ingestion has two entry points that converge on the same pipeline:**
1. Drop a file into `data/inbox/` → `lib/watcher.ts` (`chokidar`) waits for it to stabilize,
   hashes it (SHA-256, for dedupe), moves it to `data/files/`.
2. `POST /api/files` → saves directly to `data/files/`.

Both call `lib/ingest.ts`, which runs a serial queue through: `lib/extract.ts` (dispatches
by mime — `pdfjs-dist` per-page text, `mammoth` for DOCX, `xlsx` for spreadsheets,
`tesseract.js` + `pdf-to-img` OCR for scanned PDFs/images) → `lib/chunk.ts` (~650 tokens
per chunk, ~100 token overlap, never crosses a page boundary) → `lib/embed.ts` (Voyage API,
batched, backs off on 429) → inserts into `chunks` / `chunk_vec` / `chunks_fts` →
`lib/metadata.ts` extracts structured fields (Haiku + Zod structured output) into
`doc_metadata`. A file's `status` moves through
`pending → extracting → chunking → embedding → metadata → indexed` (or `error`), polled by
the UI via SWR.

**Chat / query pipeline (`POST /api/chat`).** The question is first classified
(`lib/classify.ts`, cheap model) as `metadata` or `content`:
- **metadata route** — answers structured questions ("when does my insurance expire?")
  with a direct SQL query over `doc_metadata` (`lib/metadata.ts`), then the chat model
  drafts a short reply. No embeddings or retrieval involved — this is the cheapest path
  and should be preferred whenever a question maps to a stored metadata field.
- **content route** — rewrites the query (cheap model) → embeds it → `lib/retrieve.ts`
  runs hybrid search (`sqlite-vec` KNN + `FTS5 MATCH`, fused with Reciprocal Rank Fusion,
  k=60) → `lib/context.ts` assembles a cited context capped at `CONTEXT_TOKEN_BUDGET`
  tokens → `lib/claude.ts` streams the final answer with the chat model, using a cached
  `SYSTEM_PROMPT` (`cache_control: ephemeral`) to keep multi-turn chat cheap.

Either route streams to the client as NDJSON events (`citations` → `delta` → `done`/
`error`); the response and token usage are persisted, and the session is auto-titled from
the first exchange using the cheap model. Once a session passes ~14 messages,
`lib/chat.ts`'s `getPromptContext` summarizes older turns with the cheap model instead of
resending them verbatim (`chat_sessions.summary`/`summary_upto`).

When adding new question types or LLM calls, keep the cheap/expensive model split intact:
`FAST_MODEL` (haiku) for classification, rewriting, titling, summarization and structured
extraction; `CHAT_MODEL` (opus) only for the final user-facing answer.

**Data model** (`lib/db.ts`): `files`, `chunks`, `chunk_vec` (vec0 virtual table),
`chunks_fts` (fts5 virtual table), `chat_sessions`, `messages`, `doc_metadata`.

**UI.** `app/page.tsx` is a single full-height (`h-dvh`) shell; the active session id is
kept in `localStorage`; `⌘K`/`Ctrl+K` starts a new chat. `components/ChatPane.tsx` reads
the NDJSON stream via `response.body.getReader()` and renders it incrementally; citation
markers become clickable chips that open `/api/files/[id]/raw#page=N` in a new browser tab
(no embedded PDF viewer by design — simpler, works offline). `components/FileBrowser.tsx`
is a drawer, SWR-polled during active ingestion, with collapsible categories
(`lib/categories.ts`), upload/drag-drop, per-file status/reindex/delete, a "reindex all"
action, and an upcoming-deadlines card backed by `GET /api/metadata?upcoming=1`.

**Other things to know:**
- `next.config.ts` lists native/Node-only packages (`better-sqlite3`, `sqlite-vec`,
  `chokidar`, `pdfjs-dist`, `tesseract.js`, `mammoth`) under `serverExternalPackages` so
  they aren't bundled by Turbopack/webpack, and raises the server action body size limit
  to 50mb for large file uploads.
- `@/*` resolves to the repo root (`tsconfig.json`).
- `design/` holds static HTML mockups (`design/canvas.json` + `*.dc.html`) that were
  reviewed before any of this was implemented — treat them as the visual reference for UI
  work, not as code to run.
