# Second Brain

App local-first para volcar toda tu administración de vida (contratos, seguros, documentos
de alquiler, notas, PDFs, recibos, IDs, hojas de cálculo, imágenes escaneadas) y luego
preguntarle en lenguaje natural. Las respuestas citan el documento fuente
("Tu seguro vence el 24 de junio de 2024, según *poliza_hogar.pdf*, p. 3").

El reto central es responder desde PDFs grandes sin gastar tokens recorriéndolos enteros:
la app usa RAG (trocear + embeddings + búsqueda vectorial + recuperar top-k) y una ruta
directa por SQL para preguntas de metadatos (vencimientos, importes...), que no gasta nada
de recuperación. Todo corre en local, para un único usuario, sin autenticación.

## Características

- **Chat a pantalla completa** con varias sesiones (crear, renombrar, borrar), título
  automático generado por IA y contador de tokens/coste por respuesta.
- **Ingesta por dos vías**, con la misma lógica de fondo:
  - **Carpeta vigilada** `data/inbox/`: arrastra un archivo ahí y un watcher
    (`chokidar`) lo detecta, lo mueve a `data/files/` y lo indexa automáticamente, sin
    abrir la app.
  - **Subida desde la app**: botón o drag & drop en el panel de archivos.
  - De-duplicación por hash SHA-256 en ambos casos.
- **Tipos de archivo soportados**: PDF (con y sin capa de texto), DOCX, TXT/MD, XLSX/CSV
  e imágenes escaneadas (OCR con `tesseract.js`).
- **Búsqueda híbrida**: embeddings vectoriales (`sqlite-vec`) + full-text search (`FTS5`),
  fusionados con Reciprocal Rank Fusion, para no perder términos exactos (números de
  póliza, fechas, nombres propios).
- **Respuestas por metadatos**: en la ingesta se extraen campos estructurados (fecha de
  vencimiento, importe, contraparte, tipo). Preguntas tipo "¿cuándo vence mi seguro?" se
  responden con una consulta SQL directa, sin tocar embeddings ni RAG.
- **Streaming de respuestas** token a token, con citas clicables que abren el documento
  original en la página exacta.
- **Panel de archivos** por categorías plegables, con estado de ingesta en vivo, reindexar
  individual o global, y una card de "próximos vencimientos".
- **Prompt caching** y **compactación de conversación** para mantener el coste bajo en
  chats largos.

## Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4.
- **Base de datos**: SQLite vía `better-sqlite3` + extensión `sqlite-vec` (vectores) y
  `FTS5` (texto completo). Todo en un único archivo `data/second-brain.db`.
- **Archivos**: se guardan tal cual en `data/files/`; los metadatos, chunks y vectores
  viven en SQLite.
- **LLM**: [Claude API](https://www.anthropic.com) (`@anthropic-ai/sdk`).
  - Respuesta de chat: `claude-opus-5` (configurable a `claude-sonnet-5` para reducir
    coste).
  - Sub-tareas baratas (clasificación, reescritura de consulta, título de chat, resumen,
    extracción de metadatos): `claude-haiku-4-5`.
- **Embeddings**: Voyage AI `voyage-3.5-lite` (1024 dimensiones).
- **Extracción de contenido**: `pdfjs-dist` (texto por página de PDF), `mammoth` (DOCX),
  `xlsx` (hojas de cálculo, build de SheetJS), `tesseract.js` + `pdf-to-img` (OCR de
  imágenes y PDFs escaneados).
- **Utilidades**: `chokidar` (watcher de carpeta), `gpt-tokenizer` (conteo de tokens),
  `zod` (validación/esquemas de salida estructurada), `swr` (data fetching en cliente).

## Cómo funciona una pregunta

```
pregunta → (Haiku) clasificar: ¿metadatos o contenido?
  ├─ metadatos → SQL sobre doc_metadata → (Opus) redactar respuesta corta  → stream
  └─ contenido → (Haiku) reescribir consulta → embed → sqlite-vec top-k + FTS5 → RRF
                 → ensamblar contexto (tope ~12k tokens, con citas) → (Opus) responder → stream
```

El trabajo caro (extracción de texto, troceado, embeddings, extracción de metadatos) se
hace **una sola vez, en la ingesta** — nunca al preguntar.

## Requisitos previos

- Node.js 20+
- Una API key de [Anthropic](https://console.anthropic.com/) (`ANTHROPIC_API_KEY`)
- Una API key de [Voyage AI](https://www.voyageai.com/) (`VOYAGE_API_KEY`)

## Puesta en marcha

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear un archivo `.env.local` en la raíz con, como mínimo:

   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   VOYAGE_API_KEY=pa-...
   ```

   Variables opcionales (ver `lib/config.ts` para los valores por defecto):

   | Variable              | Por defecto        | Descripción                                    |
   | ---------------------- | ------------------- | ----------------------------------------------- |
   | `DATA_DIR`             | `./data`            | Carpeta raíz de archivos y base de datos.        |
   | `DB_PATH`              | `<DATA_DIR>/second-brain.db` | Ruta del archivo SQLite.           |
   | `CHAT_MODEL`           | `claude-opus-5`     | Modelo usado para la respuesta final del chat.   |
   | `FAST_MODEL`           | `claude-haiku-4-5`  | Modelo usado para sub-tareas baratas.            |
   | `EMBED_MODEL`          | `voyage-3.5-lite`   | Modelo de embeddings.                            |
   | `EMBED_DIM`            | `1024`              | Dimensión de los vectores de embedding.          |
   | `CONTEXT_TOKEN_BUDGET` | `12000`             | Tope de tokens de contexto recuperado por pregunta. |
   | `RETRIEVE_TOP_K`       | `8`                 | Nº de fragmentos a recuperar por consulta.       |

3. Levantar el servidor de desarrollo:

   ```bash
   npm run dev
   ```

4. Abrir [http://localhost:3000](http://localhost:3000).

Al arrancar (`instrumentation.ts`), la app aplica las migraciones de base de datos
(`PRAGMA user_version`) y lanza el watcher sobre `data/inbox/`.

## Uso

- **Añadir documentos**: arrastra archivos a `data/inbox/`, o súbelos desde el panel de
  archivos (icono de carpeta) con el botón de subida o drag & drop. La app los categoriza,
  extrae el texto, los trocea, genera embeddings y extrae metadatos automáticamente. El
  estado de ingesta (`pending → extracting → chunking → embedding → metadata → indexed`)
  se ve en vivo en el panel.
- **Preguntar**: escribe en el chat. `⌘K`/`Ctrl+K` abre una sesión nueva. Las respuestas
  citan la fuente entre corchetes (`[1]`, `[2]`...); al hacer clic se abre el documento
  original en la página correspondiente en una pestaña nueva del navegador.
- **Gestionar archivos**: desde el panel puedes ver el estado, reindexar un archivo
  (o todos a la vez, tras cambios en la lógica de ingesta) o borrarlo.
- **Sesiones de chat**: la barra lateral permite crear, renombrar (doble clic) y borrar
  sesiones; cada una mantiene su propio historial aislado.

## Scripts

| Comando          | Descripción                              |
| ----------------- | ----------------------------------------- |
| `npm run dev`      | Servidor de desarrollo (Next.js).         |
| `npm run build`    | Build de producción.                      |
| `npm run start`    | Sirve el build de producción.             |
| `npm run lint`     | ESLint.                                   |

## Estructura del proyecto

```
app/
  layout.tsx, page.tsx, globals.css   # Shell de la app (chat a pantalla completa)
  api/
    chat/route.ts                     # Streaming NDJSON de respuestas (clasifica, recupera, responde)
    files/route.ts                    # Subir y listar archivos
    files/[id]/route.ts               # Borrar / reindexar un archivo
    files/[id]/raw/route.ts           # Servir el archivo original (citas / preview)
    files/reindex/route.ts            # Reindexar todo
    sessions/route.ts                 # Listar / crear sesiones de chat
    sessions/[id]/route.ts            # Ver / renombrar / borrar una sesión
    metadata/route.ts                 # Vencimientos próximos / consultas por metadatos

components/
  ChatPane.tsx                        # Historial + render incremental del stream + citas
  SessionSidebar.tsx                  # Lista de sesiones de chat
  FileBrowser.tsx                     # Panel de archivos por categoría, subida, estado
  icons.tsx, lib.ts

lib/
  db.ts                               # Conexión SQLite + migraciones
  config.ts                           # Paths, modelos, presupuestos, API keys
  categories.ts                       # Categorías de archivo
  types.ts                            # Tipos compartidos
  watcher.ts                          # chokidar sobre data/inbox/
  extract.ts                          # Dispatcher de extracción por tipo de archivo
  chunk.ts                            # Troceado de texto en chunks
  tokens.ts                           # Conteo de tokens
  embed.ts                            # Cliente de embeddings (Voyage)
  ingest.ts                           # Orquesta extract → chunk → embed → insert → metadatos
  files.ts                            # Helpers de acceso a archivos en DB
  retrieve.ts                         # Búsqueda híbrida (vector + FTS5 + RRF)
  context.ts                          # Ensamblado de contexto con presupuesto de tokens
  claude.ts                           # Cliente Claude, system prompt, streaming, títulos, resúmenes
  chat.ts                             # Sesiones y mensajes
  classify.ts                         # Clasificación metadatos vs. contenido
  metadata.ts                         # Extracción y consulta de metadatos estructurados

design/                               # Mockups estáticos del diseño (canvas previo a codificar)
data/                                 # Fuera de git: inbox/, files/, second-brain.db
instrumentation.ts                    # Migraciones + arranque del watcher al iniciar el servidor
```

## Modelo de datos (SQLite, `lib/db.ts`)

- **`files`** — id, path, nombre original, categoría, mime, extensión, tamaño, hash
  (único), estado de ingesta, detalle/error, nº de páginas y chunks, si tuvo OCR, fechas.
- **`chunks`** — id, file_id, índice, contenido, página, offsets de carácter, nº de
  tokens.
- **`chunk_vec`** — tabla virtual `vec0` con el embedding de cada chunk (`float[1024]`).
- **`chunks_fts`** — tabla virtual `fts5` para búsqueda de texto completo.
- **`chat_sessions`** — id, título, fechas de creación/actualización, resumen de
  compactación.
- **`messages`** — id, session_id, rol, contenido, citas (JSON), uso de tokens (JSON).
- **`doc_metadata`** — id, file_id, clave, valor (texto/fecha/número), confianza, página.

## Categorías de archivo

`Contratos`, `Contratos de alquiler`, `Seguros`, `Finanzas`, `Salud`, `Notas`, `Recibos`,
`Documentos e IDs`, `PDFs`, `Otros` (ver `lib/categories.ts`).

## Notas de diseño y optimización de tokens

El coste y la latencia se controlan con varias estrategias (detalladas en `PLAN.md`):

1. Extracción, troceado y embeddings se hacen **una sola vez** en la ingesta.
2. Por cada pregunta solo se recuperan los `k` chunks más relevantes (búsqueda híbrida
   vector + FTS5 con RRF), nunca el documento completo.
3. Tope duro de contexto recuperado (`CONTEXT_TOKEN_BUDGET`).
4. **Prompt caching** (`cache_control: ephemeral`) sobre el system prompt y el historial,
   para abaratar el chat multi-turno.
5. **Compactación**: a partir de cierto nº de mensajes, el historial antiguo se resume con
   Haiku en vez de reenviarse literal.
6. Preguntas de metadatos (vencimientos, importes) se responden con una consulta SQL
   directa, sin gastar en embeddings ni recuperación.
7. Modelo barato (`claude-haiku-4-5`) para clasificación, reescritura de consulta, título
   de chat y resúmenes; el modelo caro (`claude-opus-5`) solo redacta la respuesta final.
8. Streaming vía `ReadableStream` para evitar timeouts y mostrar la respuesta en tiempo
   real.

Para el contexto completo del proyecto, decisiones de arquitectura y estado de cada fase,
ver [`PLAN.md`](./PLAN.md).

## Estado del proyecto

Fases 0–6 completas (canvas de diseño, andamiaje, pipeline de ingesta, recuperación +
chat, UI, capa de metadatos, pulido). `tsc` y `npm run build` limpios. Verificado
end-to-end con claves reales: ingesta (watcher + API) → recuperación híbrida → respuesta
en streaming citada; ruta de metadatos por SQL; prompt caching activo en multi-turno.

Pendiente de verificar en runtime a mayor escala: OCR de imágenes/PDF escaneado, DOCX,
XLSX, y la compactación con conversaciones de 15+ mensajes.

## Aviso importante sobre este repositorio

Este proyecto usa una versión de Next.js con cambios importantes respecto a la que
conocen la mayoría de modelos de IA. Antes de escribir código, hay que revisar la
documentación en `node_modules/next/dist/docs/` y respetar los avisos de
funcionalidades obsoletas (ver `AGENTS.md`).
