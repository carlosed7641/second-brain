import { NextRequest, NextResponse } from "next/server";
import { getFile, deleteFileCompletely } from "@/lib/files";
import { enqueueIngest, reindexFile } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/files/:id — borra archivo + chunks + vectores + disco. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ok = await deleteFileCompletely(id);
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** POST /api/files/:id/reindex  (o  POST /api/files/:id?action=reindex) */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!getFile(id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  enqueueIngest(() => reindexFile(id)).catch((e) =>
    console.error(`[api/files] reindex ${id}:`, e),
  );
  return NextResponse.json({ ok: true, status: "pending" }, { status: 202 });
}
