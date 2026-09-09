import { getDb } from "./db";
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
