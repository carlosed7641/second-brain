import { NextRequest, NextResponse } from "next/server";
import { getFile, deleteFileCompletely, updateFile } from "@/lib/files";
import { enqueueIngest, prepareReindex, processFile } from "@/lib/ingest";
import { isCategory } from "@/lib/categories";

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

/** PATCH /api/files/:id  { original_name?, category? } — renombrar y/o reclasificar. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!getFile(id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const original_name = typeof body.original_name === "string" ? body.original_name : undefined;
  const category = typeof body.category === "string" ? body.category : undefined;

  if (original_name === undefined && category === undefined) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  if (original_name !== undefined && !original_name.trim()) {
    return NextResponse.json({ error: "El nombre no puede estar vacío" }, { status: 400 });
  }
  if (category !== undefined && !isCategory(category)) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }

  return NextResponse.json({ file: updateFile(id, { original_name, category }) });
}

/** POST /api/files/:id — reindexar. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!getFile(id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  // Síncrono: limpia chunks y pone 'pending' ya, antes de responder, para que
  // el cliente lo vea de inmediato. Solo el pipeline pesado va a la cola.
  prepareReindex(id);
  enqueueIngest(() => processFile(id)).catch((e) =>
    console.error(`[api/files] reindex ${id}:`, e),
  );
  return NextResponse.json({ ok: true, status: "pending" }, { status: 202 });
}
