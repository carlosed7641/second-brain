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
- **Pantalla de configuración** para introducir las claves de API desde la app (se
  validan antes de guardarse).
- **App de escritorio para Windows**: instalador `.exe` que abre la app sin `npm run dev`
  (ver [App de escritorio](#app-de-escritorio-windows)).

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
- **Escritorio**: Electron + `electron-builder` (instalador NSIS), sobre el build
  `standalone` de Next.js.

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

- Node.js 22+ (lo exige `better-sqlite3` 13)
- Una API key de [Anthropic](https://console.anthropic.com/) (`ANTHROPIC_API_KEY`)
- Una API key de [Voyage AI](https://www.voyageai.com/) (`VOYAGE_API_KEY`)

## Puesta en marcha

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Configurar las claves de API, de una de estas dos formas:

   - Copiar `.env.template` a `.env.local` y rellenar, como mínimo:

     ```bash
     ANTHROPIC_API_KEY=sk-ant-...
     VOYAGE_API_KEY=pa-...
     ```

   - O dejarlas vacías y guardarlas desde la app: si faltan, al abrirla aparece la
     pantalla de **Configuración**. Se guardan en `data/settings.json` y tienen prioridad
     sobre las del `.env`.

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
- **Configuración**: el icono junto al logo abre la pantalla de claves de API.
- **Abrir la carpeta inbox**: el texto `data/inbox/` de la app es un enlace que abre esa
  carpeta en el Explorador de archivos.

## Scripts

| Comando          | Descripción                              |
| ----------------- | ----------------------------------------- |
| `npm run dev`      | Servidor de desarrollo (Next.js).         |
| `npm run build`    | Build de producción.                      |
| `npm run start`    | Sirve el build de producción.             |
| `npm run lint`     | ESLint.                                   |
| `npm run desktop:dist`  | Genera el instalador `.exe` de la app de escritorio. |
| `npm run desktop:build` | Prepara y prueba el servidor para la app de escritorio. |
| `npm run desktop`       | Abre la app de escritorio sin instalarla.  |
| `npm run desktop:icon`  | Regenera el icono de la app de escritorio. |

## App de escritorio (Windows)

Second Brain se puede empaquetar como un instalador `.exe` para Windows. La app instalada abre directamente, sin `npm run dev` ni tener el repo, y guarda todos los datos en el equipo.

### Requisitos

- Windows 10/11 de 64 bits.
- [Node.js](https://nodejs.org) 22 o superior (con npm).
- Git.
- Conexión a internet la primera vez: se descargan Electron y las herramientas del instalador (NSIS).
- Claves de API de [Anthropic](https://console.anthropic.com/settings/keys) y [Voyage AI](https://dashboard.voyageai.com/organization/api-keys). No hacen falta para generar el `.exe`, solo para usar la app.

No se necesita Visual Studio ni compilar nada en C++: los módulos nativos (`better-sqlite3`, `sqlite-vec`, `@napi-rs/canvas`) traen binarios precompilados.

### Pasos

1. **Clona el repo e instala las dependencias**

   ```bash
   git clone <url-del-repo>
   cd second-brain
   npm install
   ```

   No hace falta crear un `.env` para generar el `.exe`: la app instalada pide las claves al abrirse.

2. **Cierra la app si ya la tienes instalada y abierta.** Si está abierta, el empaquetado no puede reemplazar los archivos de `dist/`.

3. **Genera el instalador**

   ```bash
   npm run desktop:dist
   ```

   Tarda unos minutos y hace dos cosas:

   - `npm run desktop:build`: compila Next (`next build`), quita el `.env` y la carpeta `data/` del paquete, comprueba que estén los binarios nativos y arranca una copia del servidor para probar las rutas `/api`. Debe terminar con:

     ```
     [desktop] prueba de humo del servidor (copia en una carpeta temporal)
       200 /
       200 /api/settings
       200 /api/files
       200 /api/sessions
       200 /api/metadata
       ok
     ```

     Si algo falla aquí, el proceso se detiene y no se genera el instalador.

   - `electron-builder --win`: empaqueta la app y crea el instalador.

4. **Comprueba el resultado.** El instalador queda en `dist/Second Brain Setup <versión>.exe`. Su fecha de modificación debe ser la de ahora; si es antigua, el paso 3 falló (revisa la salida de la terminal).

5. **Instálalo.** Haz doble clic en el `.exe`. Como el instalador no está firmado, Windows muestra *"Windows protegió tu PC"*: pulsa **Más información → Ejecutar de todas formas**. Se instala solo para tu usuario (no pide permisos de administrador), crea accesos directos en el escritorio y en el menú inicio, y abre la app al terminar.

6. **Configura las claves.** La primera vez que abres la app aparece la pantalla de configuración: pega tus claves de Anthropic y Voyage y pulsa **Guardar**. Se validan contra cada API antes de guardarse, así que deben ser claves vigentes. Puedes cambiarlas después desde el icono junto al logo.

### Actualizar la app

Tras cambiar el código (o hacer `git pull`), repite los pasos 2 a 5. El instalador nuevo se instala encima del anterior y **tus datos se conservan**.

Para que la versión aparezca distinta en Windows, sube `"version"` en `desktop/package.json` antes de generar el instalador.

### Dónde se guarda cada cosa

| Qué | Ruta |
|---|---|
| Programa | `%LOCALAPPDATA%\Programs\second-brain-desktop\` |
| Datos (base de datos, documentos, `inbox`, `settings.json` con las claves) | `%APPDATA%\Second Brain\data\` |
| Registro del servidor | `%APPDATA%\Second Brain\logs\server.log` |

Los datos de la app instalada son independientes de los de `npm run dev` (que usa `data/` del repo). Desinstalar la app no borra `%APPDATA%\Second Brain`.

### Otros comandos

| Comando | Para qué |
|---|---|
| `npm run desktop:build` | Solo prepara el servidor (`.next/standalone`), sin crear el instalador. |
| `npm run desktop` | Abre la app con Electron sin instalarla (requiere `desktop:build` antes). |
| `npx electron-builder --win` | Solo empaqueta, reutilizando el último `desktop:build`. |
| `npm run desktop:icon` | Regenera `desktop/icon.ico` y `icon.png` desde `scripts/make-icon.mjs`. |

### Si algo falla

- **La app no abre o muestra un error al arrancar:** revisa `%APPDATA%\Second Brain\logs\server.log`.
- **La app instalada no tiene los últimos cambios:** el instalador no se regeneró. Revisa la fecha de `dist/Second Brain Setup <versión>.exe` (paso 4).
- **Un archivo queda en "Error":** el panel de archivos muestra el motivo; tras corregir la causa (por ejemplo, la clave), pulsa **Reindexar** en ese archivo.
- **`EBUSY` o "resource busy" al empaquetar:** la app o una ventana del Explorador está usando `dist/`. Ciérralas y repite el paso 3.

### Cómo funciona

`next build` genera un servidor autocontenido (`output: "standalone"` en `next.config.ts`). Al abrir la app, `desktop/main.cjs` muestra una pantalla de carga, arranca ese servidor con el propio ejecutable de Electron en modo Node, en un puerto libre de `127.0.0.1`, y carga la app en la ventana cuando responde. `scripts/build-desktop.mjs` prepara y prueba el servidor antes de empaquetar, y `scripts/after-pack.cjs` lo copia dentro del instalador.

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
    settings/route.ts                 # Leer / validar y guardar las claves de API
    inbox/route.ts                    # Ruta de data/inbox/ y abrirla en el explorador

components/
  ChatPane.tsx                        # Historial + render incremental del stream + citas
  SessionSidebar.tsx                  # Lista de sesiones de chat
  FileBrowser.tsx                     # Panel de archivos por categoría, subida, estado
  SettingsModal.tsx                   # Pantalla de configuración (claves de API)
  InboxLink.tsx                       # Enlace "data/inbox/" que abre la carpeta
  icons.tsx, lib.ts

lib/
  db.ts                               # Conexión SQLite + migraciones
  config.ts                           # Paths, modelos, presupuestos
  settings.ts                         # Claves de API (data/settings.json, con el .env de respaldo)
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

desktop/                              # App de escritorio: main.cjs (Electron), package.json, icono
scripts/                              # build-desktop.mjs, after-pack.cjs, make-icon.mjs
design/                               # Mockups estáticos del diseño (canvas previo a codificar)
data/                                 # Fuera de git: inbox/, files/, second-brain.db, settings.json
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

Verificada la extracción de todos los formatos (TXT, MD, CSV, JSON, DOCX, XLSX, PDF con
texto, PDF escaneado con OCR e imágenes con OCR) en el build de la app de escritorio, con
embeddings simulados (`EMBED_FAKE=1`). Pendiente de verificar a mayor escala: la
compactación con conversaciones de 15+ mensajes.

## Aviso importante sobre este repositorio

Este proyecto usa una versión de Next.js con cambios importantes respecto a la que
conocen la mayoría de modelos de IA. Antes de escribir código, hay que revisar la
documentación en `node_modules/next/dist/docs/` y respetar los avisos de
funcionalidades obsoletas (ver `AGENTS.md`).
