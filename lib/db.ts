import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { DB_PATH, EMBED_DIM, ensureDataDirs } from "./config";

/**
 * Singleton de la base de datos SQLite (better-sqlite3) con la extensión
 * sqlite-vec cargada y las migraciones aplicadas. Se cachea en globalThis para
 * sobrevivir al hot-reload de Next.js en desarrollo.
 */

type DB = Database.Database;

const g = globalThis as unknown as { __sbDb?: DB };

/**
 * Migraciones ordenadas. `PRAGMA user_version` guarda la última aplicada.
 * Para cambiar el esquema: añade una entrada nueva al final, nunca edites una
 * ya publicada.
 */
const MIGRATIONS: string[] = [
  // 1 — esquema inicial
  /* sql */ `
    CREATE TABLE files (
      id            TEXT PRIMARY KEY,
      path          TEXT NOT NULL,
      original_name TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'Otros',
      mime          TEXT NOT NULL,
      ext           TEXT NOT NULL,
      size_bytes    INTEGER NOT NULL,
      hash          TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'pending',
      status_detail TEXT,
      error         TEXT,
      page_count    INTEGER,
      chunk_count   INTEGER NOT NULL DEFAULT 0,
      ocr           INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      indexed_at    TEXT
    );

    CREATE TABLE chunks (
      id          TEXT PRIMARY KEY,
      file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      idx         INTEGER NOT NULL,
      content     TEXT NOT NULL,
      page        INTEGER,
      char_start  INTEGER,
      char_end    INTEGER,
      token_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_chunks_file ON chunks(file_id);

    CREATE VIRTUAL TABLE chunk_vec USING vec0(
      chunk_id TEXT PRIMARY KEY,
      file_id  TEXT,
      embedding float[${EMBED_DIM}]
    );

    CREATE VIRTUAL TABLE chunks_fts USING fts5(
      chunk_id UNINDEXED,
      file_id  UNINDEXED,
      content,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TABLE chat_sessions (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT 'Nuevo chat',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE messages (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      citations  TEXT,
      usage      TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_messages_session ON messages(session_id, created_at);

    CREATE TABLE doc_metadata (
      id         TEXT PRIMARY KEY,
      file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      value_date TEXT,
      value_num  REAL,
      confidence REAL,
      page       INTEGER
    );
    CREATE INDEX idx_meta_file ON doc_metadata(file_id);
    CREATE INDEX idx_meta_key  ON doc_metadata(key);
  `,
];

function applyMigrations(db: DB): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let version = current + 1; version <= MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version - 1];
    const run = db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    });
    run();
  }
}

function createDb(): DB {
  ensureDataDirs();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);
  applyMigrations(db);
  return db;
}

export function getDb(): DB {
  if (!g.__sbDb) g.__sbDb = createDb();
  return g.__sbDb;
}

/** Cierra la conexión (tests / apagado). */
export function closeDb(): void {
  g.__sbDb?.close();
  g.__sbDb = undefined;
}
