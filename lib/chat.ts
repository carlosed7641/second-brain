import { getDb } from "./db";
import { summarizeConversation } from "./claude";
import type { ChatSessionRow, Citation, MessageRole, MessageRow, TokenUsage } from "./types";

/** Helpers de acceso a datos para sesiones de chat y mensajes. */

export function createSession(title = "Nuevo chat"): ChatSessionRow {
  const id = crypto.randomUUID();
  getDb().prepare("INSERT INTO chat_sessions (id, title) VALUES (?, ?)").run(id, title);
  return getSession(id)!;
}

export function getSession(id: string): ChatSessionRow | undefined {
  return getDb().prepare("SELECT * FROM chat_sessions WHERE id = ?").get(id) as
    | ChatSessionRow
    | undefined;
}

export function listSessions(): ChatSessionRow[] {
  return getDb()
    .prepare("SELECT * FROM chat_sessions ORDER BY datetime(updated_at) DESC")
    .all() as ChatSessionRow[];
}

export function renameSession(id: string, title: string): void {
  getDb()
    .prepare("UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title.trim().slice(0, 120) || "Nuevo chat", id);
}

export function touchSession(id: string): void {
  getDb().prepare("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(id);
}

export function deleteSession(id: string): boolean {
  const info = getDb().prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
  return info.changes > 0;
}

export interface NewMessage {
  session_id: string;
  role: MessageRole;
  content: string;
  citations?: Citation[] | null;
  usage?: TokenUsage | null;
}

export function addMessage(m: NewMessage): MessageRow {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO messages (id, session_id, role, content, citations, usage)
       VALUES (@id, @session_id, @role, @content, @citations, @usage)`,
    )
    .run({
      id,
      session_id: m.session_id,
      role: m.role,
      content: m.content,
      citations: m.citations ? JSON.stringify(m.citations) : null,
      usage: m.usage ? JSON.stringify(m.usage) : null,
    });
  touchSession(m.session_id);
  return getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow;
}

/** Historial de la sesión en orden cronológico (los últimos `limit`). */
export function getHistory(sessionId: string, limit = 12): MessageRow[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM messages WHERE session_id = ?
       ORDER BY datetime(created_at) DESC, rowid DESC LIMIT ?`,
    )
    .all(sessionId, limit) as MessageRow[];
  return rows.reverse();
}

export function messageCount(sessionId: string): number {
  return (
    getDb().prepare("SELECT COUNT(*) n FROM messages WHERE session_id = ?").get(sessionId) as {
      n: number;
    }
  ).n;
}

/* ---------- Compactación de historial ---------- */

const COMPACT_AFTER = 14; // nº de mensajes a partir del cual se compacta
const KEEP_RECENT = 8; // mensajes literales que se conservan siempre

interface PromptContext {
  summary: string | null; // resumen de los turnos antiguos
  recent: MessageRow[]; // turnos recientes en claro
}

/**
 * Devuelve el contexto para el prompt: los últimos turnos en claro y, si la
 * conversación es larga, un resumen de lo anterior (generado con el modelo barato
 * y guardado en la sesión para no recalcularlo cada vez).
 */
export async function getPromptContext(sessionId: string): Promise<PromptContext> {
  const db = getDb();
  const all = db
    .prepare(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY datetime(created_at) ASC, rowid ASC LIMIT 400",
    )
    .all(sessionId) as MessageRow[];

  if (all.length <= COMPACT_AFTER) return { summary: null, recent: all };

  const cutoff = all.length - KEEP_RECENT;
  const recent = all.slice(cutoff);
  const session = getSession(sessionId);
  let summary = session?.summary ?? null;
  const upto = session?.summary_upto ?? 0;

  if (upto < cutoff) {
    const transcript = all
      .slice(upto, cutoff)
      .map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`)
      .join("\n\n");
    try {
      summary = await summarizeConversation(transcript, summary ?? undefined);
      db.prepare(
        "UPDATE chat_sessions SET summary = ?, summary_upto = ? WHERE id = ?",
      ).run(summary, cutoff, sessionId);
    } catch (e) {
      console.warn("[chat] compactación falló:", e);
    }
  }
  return { summary, recent };
}
