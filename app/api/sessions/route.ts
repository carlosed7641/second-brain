import { NextRequest, NextResponse } from "next/server";
import { createSession, listSessions } from "@/lib/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sessions — lista de sesiones (más reciente primero). */
export function GET() {
  return NextResponse.json({ sessions: listSessions() });
}

/** POST /api/sessions — crea una sesión nueva. Body opcional { title }. */
export async function POST(req: NextRequest) {
  let title: string | undefined;
  try {
    title = (await req.json())?.title;
  } catch {
    /* body vacío -> título por defecto */
  }
  return NextResponse.json({ session: createSession(title || undefined) }, { status: 201 });
}
