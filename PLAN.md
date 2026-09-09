# Second Brain — Plan de implementación

## Contexto

App local-first donde vuelcas toda tu administración de vida (contratos, seguros, docs de
alquiler, notas, PDFs, recibos, IDs, hojas de cálculo, imágenes escaneadas) y luego
preguntas en lenguaje natural. La respuesta cita el documento fuente ("Tu seguro vence el
24 de junio de 2024").

Reto central: responder desde PDFs grandes sin gastar tokens recorriéndolos enteros → RAG
(trocear + embeddings + búsqueda vectorial + recuperar top-k). El chat ocupa todo el sitio,
con varias sesiones de chat y un panel para ver los archivos.

### Decisiones

- **Stack:** Next.js 16 (App Router) full-stack, React 19, TypeScript, Tailwind v4.
- **Almacenamiento:** SQLite (`better-sqlite3`) + extensión `sqlite-vec` para vectores.
  Archivos en disco local (`data/files/`), metadatos/chunks/vectores en SQLite
  (`data/second-brain.db`).
- **Ingesta por dos vías, misma lógica:** (a) **carpeta vigilada** `data/inbox/` — arrastras
  archivos ahí y un watcher (`chokidar`) los detecta, mueve a `data/files/` y hace la
  ingesta automática sin abrir la app; (b) **subida en la app** (drag & drop en el panel de
  archivos). De-duplicación por hash SHA-256.
- **Usuario único**, sin auth, corre local (`npm run dev`).
- **LLM:** Claude API (`@anthropic-ai/sdk`). Chat = `claude-opus-5` (opción de costo:
  `claude-sonnet-5`). Sub-tareas baratas = `claude-haiku-4-5`.
- **Embeddings:** Voyage AI `voyage-3.5-lite`, dim 1024 (`VOYAGE_API_KEY`).
- **Tipos de archivo v1:** PDF, DOCX, TXT/MD/notas, XLSX/CSV, e imágenes escaneadas con OCR
  (`tesseract.js`).
- **Diseño:** canvas de mockups estáticos revisado antes de codificar (`design/`).

---

## Optimización de tokens (el punto clave)

**El trabajo caro se hace una vez en la ingesta, no en cada pregunta.**

1. **Ingesta una sola vez.** Al subir: extraer texto (`pdfjs-dist` por página para PDF,
   `mammoth` para DOCX, `xlsx` para hojas, lectura plana para texto, `tesseract.js` OCR para
   imágenes y PDFs escaneados sin capa de texto), trocear en chunks de ~500–800 tokens con
   ~15% de solape, guardar texto del chunk + metadatos (archivo, página, offset).
2. **Embeddings una sola vez.** Cada chunk se embebe con Voyage y se guarda en `sqlite-vec`.
   Coste único por documento y minúsculo (~$0.02 / 1M tokens).
3. **Por pregunta: recuperar, no escanear.** Se embebe la pregunta, `sqlite-vec` devuelve
   los top-k chunks (k≈8). Solo esos ~4–6k tokens van a Claude, nunca el PDF entero.
4. **Búsqueda híbrida.** Vector + full-text (`FTS5`) fusionados con Reciprocal Rank Fusion,
   para no perder términos exactos (nº de póliza, fechas, nombres propios).
5. **Presupuesto de contexto.** Tope duro de contexto recuperado (~12k tokens,
   `CONTEXT_TOKEN_BUDGET`). Si se pasa: bajar k o resumir-y-luego-inyectar.
6. **Prompt caching.** System prompt + definiciones de herramientas como prefijo estable con
   `cache_control: {type: "ephemeral"}`. Gran ahorro en chat multi-turno.
7. **Compactación de conversación.** Sesiones largas: se mantienen los últimos N turnos
   literales y se resume lo anterior con Haiku.
8. **Respuestas por metadatos (cero recuperación).** En la ingesta se extraen campos
   estructurados (vencimiento, importe, contraparte, tipo) a `doc_metadata`. Preguntas tipo
   "¿cuándo vence mi seguro?" se responden por SQL directo, sin embeddings ni chunks.
9. **Modelo barato para sub-tareas.** `claude-haiku-4-5` para reescritura de la consulta,
   clasificación (¿SQL o RAG?), extracción de metadatos y título del chat. `opus-5` solo
   para la respuesta final.
10. **Streaming.** Route Handler que hace `client.messages.stream(...)` y devuelve un
    `ReadableStream`. El cliente lo lee con `response.body.getReader()` y renderiza token a
    token. Evita timeouts HTTP y da respuesta en tiempo real.

Flujo de una pregunta:

```
pregunta → (Haiku) clasificar: ¿metadatos o contenido?
  ├─ metadatos → SQL sobre doc_metadata → (Opus) redactar respuesta corta  → stream
  └─ contenido → (Haiku) reescribir consulta → embed → sqlite-vec top-k + FTS5 → RRF
                 → ensamblar contexto (tope 12k tok, con citas) → (Opus) responder → stream
```

---

## Esquema de base de datos (`lib/db.ts`)

Migraciones por `PRAGMA user_version`.

- `files` — id, path, original_name, category, mime, ext, size_bytes, hash (UNIQUE),
  status (`pending|extracting|chunking|embedding|metadata|indexed|error`), status_detail,
  error, page_count, chunk_count, ocr, created_at, indexed_at.
- `chunks` — id, file_id, idx, content, page, char_start, char_end, token_count.
- `chunk_vec` — tabla virtual `vec0` (chunk_id, file_id, embedding `float[1024]`).
- `chunks_fts` — tabla virtual `fts5` (chunk_id, file_id, content; `unicode61 remove_diacritics 2`).
- `chat_sessions` — id, title, created_at, updated_at.
- `messages` — id, session_id, role, content, citations (JSON), usage (JSON), created_at.
- `doc_metadata` — id, file_id, key, value, value_date, value_num, confidence, page.

---

## Fases

### Fase 0 — Canvas de diseño ✅
Mockups estáticos (`design/`): `Main` (chat a pantalla completa + sidebar de sesiones +
citas), `Files` (panel de archivos por carpeta), `Ingesting` (progreso de ingesta),
`Empty` (primer arranque). Estética verde menta / off-white, Hanken Grotesk.

### Fase 1 — Andamiaje ✅
Next.js 16 + Tailwind v4 + TS. `better-sqlite3` + `sqlite-vec`, `lib/db.ts` con migraciones
al arranque vía `instrumentation.ts`. `lib/config.ts` (paths, modelos, presupuestos,
getters de API keys), `lib/categories.ts`, `lib/types.ts`. Theme Tailwind con la paleta.
`.env.example` / `.env.local`. `data/` fuera de git.

### Fase 2 — Pipeline de ingesta ✅
- `lib/watcher.ts` — `chokidar` sobre `data/inbox/`: archivo estable → hash → mover a
  `data/files/` → `lib/ingest.ts`. Arrancado desde `instrumentation.ts`.
- `POST /api/files` — recibe archivo(s), guarda en `data/files/`, encola ingesta.
- `lib/extract.ts` — dispatcher por mime: `pdfjs-dist` (texto por página), `mammoth`,
  `xlsx`, lectura plana, `tesseract.js` (OCR cuando el PDF no trae texto o es imagen,
  vía `pdf-to-img` para renderizar páginas). OCR/DOCX/XLSX: typecheck + build, sin
  verificación en runtime.
- `lib/chunk.ts` — troceado ~650 tokens con solape ~100, sin cruzar páginas.
- `lib/embed.ts` — cliente Voyage, batching, backoff largo ante 429 (`EMBED_FAKE=1` para
  dev offline).
- `lib/ingest.ts` — cola en serie, dedupe por hash SHA-256, orquesta extract → chunk →
  embed → insert (`chunks`, `chunk_vec`, `chunks_fts`) → metadatos. `reindexFile`.
- `lib/files.ts` — helpers DB. `GET/DELETE /api/files`, `POST /api/files/[id]` (reindex).

### Fase 3 — Recuperación + backend de chat ✅
- `lib/retrieve.ts` — `hybridSearch`: embed consulta → `sqlite-vec` KNN + `FTS5` (MATCH
  saneado + stopwords) → fusión RRF (k=60) → hidratado con archivo/categoría.
- `lib/context.ts` — `assembleContext` (tope `CONTEXT_TOKEN_BUDGET`, citas paralelas),
  `assembleMetadataContext`, `buildUserTurn`.
- `lib/claude.ts` — cliente, `SYSTEM_PROMPT` detallado con `cache_control`, `streamAnswer`
  (opus-5, adaptive thinking, `CHAT_EFFORT`), `generateTitle`, `summarizeConversation`.
- `lib/chat.ts` — sesiones/mensajes, `getPromptContext` (historial + resumen).
- `POST /api/chat` — clasifica (SQL vs RAG), recupera, `messages.stream`, devuelve NDJSON
  (`citations` → `delta` → `done`/`error`). Persiste mensaje + `usage`; auto-título.
- `GET/POST /api/sessions`, `GET/PATCH/DELETE /api/sessions/[id]`.

### Fase 4 — UI de chat ✅
- `app/page.tsx` — shell a pantalla completa (`h-dvh`); sesión activa en `localStorage`;
  ⌘K = nuevo chat.
- `components/ChatPane.tsx` — historial (SWR) + render incremental del stream
  (`body.getReader()` + `TextDecoder`, NDJSON); chips de cita clicables; `[n]` inline;
  textarea autoexpand; auto-scroll; aborta el stream al cambiar de sesión; contador de
  tokens/coste bajo cada respuesta.
- `components/SessionSidebar.tsx` — crear / renombrar (doble-clic) / borrar; resaltado.
- **Título automático:** Haiku resume el primer intercambio → `chat_sessions.title`.
- `components/FileBrowser.tsx` — drawer con SWR + `refreshInterval` durante la ingesta;
  categorías plegables; subida por botón y drag&drop; estado / reindexar / borrar;
  "reindexar todo"; card de próximos vencimientos.
- **Visor de PDF:** en vez de `react-pdf` embebido, clic en una cita abre
  `/api/files/[id]/raw#page=N` en pestaña nativa del navegador (más simple, offline).

### Fase 5 — Capa de metadatos ✅
- `lib/metadata.ts` — `extractAndStoreMetadata` (Haiku + Zod `output_config.format`) en la
  ingesta; `queryMetadata`.
- `lib/classify.ts` — `classifyQuestion` decide `metadata` vs `content`.
- `POST /api/chat` — ruta `metadata`: responde por SQL sobre `doc_metadata`, **sin Voyage
  ni fragmentos** (`route` en el evento `done`).
- `GET /api/metadata` (`?upcoming=1`, `?fileId=`) + card "Próximos vencimientos".
- Migración 2: columna `label`.

### Fase 6 — Pulido ✅
- **Prompt caching real** (verificado): `SYSTEM_PROMPT` de ~1,8k tokens con `cache_control`
  + breakpoint en el último turno del historial → `cache_read_input_tokens` ~1,9k en
  turnos 2+, `input_tokens` frescos ~82.
- **Compactación:** `getPromptContext` resume con Haiku a partir de 14 mensajes,
  guardado en `chat_sessions.summary`/`summary_upto` (migración 3). Sin prueba en runtime
  a escala.
- **Contador de tokens/coste** por respuesta + badge "respuesta directa" en la ruta SQL.
- **Atajo ⌘K / Ctrl+K** (nuevo chat) y Enter / Shift+Enter en el input.
- **Reindexar todo** — `POST /api/files/reindex` + botón en el drawer.

---

## Estado

Fases 0–6 completas. `tsc` + `npm run build` limpios. Verificado end-to-end con claves
reales: ingesta (watcher + API) → recuperación híbrida → respuesta en streaming citada;
ruta de metadatos por SQL; prompt caching activo en multi-turno.

Pendiente de verificar en runtime: OCR de imágenes/PDF escaneado, DOCX, XLSX, y la
compactación con conversaciones de 15+ mensajes.

---

## Archivos clave

```
app/layout.tsx  app/page.tsx  app/globals.css
app/api/chat/route.ts                 # streaming NDJSON (ReadableStream)
app/api/files/route.ts                # subir + listar
app/api/files/[id]/route.ts           # borrar + reindexar
app/api/files/[id]/raw/route.ts       # servir el archivo original (citas / preview)
app/api/files/reindex/route.ts        # reindexar todo
app/api/sessions/route.ts  app/api/sessions/[id]/route.ts
app/api/metadata/route.ts             # vencimientos / ruta SQL
instrumentation.ts                    # migraciones + watcher al arrancar
lib/db.ts lib/config.ts lib/categories.ts lib/types.ts
lib/watcher.ts lib/extract.ts lib/chunk.ts lib/tokens.ts lib/embed.ts
lib/ingest.ts lib/files.ts
lib/retrieve.ts lib/context.ts lib/claude.ts lib/chat.ts lib/classify.ts lib/metadata.ts
components/ChatPane.tsx components/SessionSidebar.tsx components/FileBrowser.tsx
components/icons.tsx components/lib.ts
```

Dependencias: `@anthropic-ai/sdk`, `better-sqlite3`, `sqlite-vec`, `chokidar`, `pdfjs-dist`,
`pdf-to-img`, `mammoth`, `xlsx` (build de SheetJS CDN), `tesseract.js`, `gpt-tokenizer`,
`zod`, `swr`.  (El visor de PDF embebido `react-pdf` se descartó en favor de la pestaña
nativa del navegador.)

---

## Verificación (end-to-end)

1. `npm run dev`. Subir un PDF grande (>50 páginas) por la app **y** arrastrando otro a
   `data/inbox/`. Confirmar en logs para ambos: watcher detecta / API recibe, nº de chunks y
   de embeddings creados; `files.status = indexed`.
2. Preguntar algo cuya respuesta está en la página 40. Confirmar: la respuesta cita "p.40", y
   en logs solo se enviaron k chunks (`usage.input_tokens` en miles, no cientos de miles).
3. Confirmar render incremental del stream en la UI (aparece token a token).
4. Crear una segunda sesión de chat; confirmar que el historial está aislado.
5. Medir latencia de `sqlite-vec` KNN (< 50 ms con unos miles de chunks).
6. Subir una imagen escaneada de un recibo; confirmar que el OCR extrajo texto y es consultable.
7. Metadatos: subir póliza de seguro, preguntar "¿cuándo vence mi seguro?"; confirmar que se
   responde por la ruta SQL (log `path=metadata`) sin recuperar chunks.
8. Turno 2 en la misma sesión: confirmar `usage.cache_read_input_tokens > 0`.
