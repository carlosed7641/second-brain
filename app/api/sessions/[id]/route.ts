import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getHistory, getSession, renameSession } from "@/lib/chat";
import type { Citation, MessageRow, TokenUsage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/sessions/:id — sesión + su historial completo (para pintar el chat). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const messages = getHistory(id, 500).map((m: MessageRow) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    citations: (m.citations ? JSON.parse(m.citations) : null) as Citation[] | null,
    usage: (m.usage ? JSON.parse(m.usage) : null) as TokenUsage | null,
    created_at: m.created_at,
  }));
  return NextResponse.json({ session, messages });
}

/** PATCH /api/sessions/:id — { title } renombra la sesión. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!getSession(id)) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const title = (await req.json().catch(() => ({})))?.title;
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Falta title" }, { status: 400 });
  }
  renameSession(id, title);
  return NextResponse.json({ session: getSession(id) });
}

/** DELETE /api/sessions/:id */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return deleteSession(id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "No encontrada" }, { status: 404 });
}
