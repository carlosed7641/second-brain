import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getFile } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/files/:id/raw — sirve el archivo original (inline, para previsualizar). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const file = getFile(id);
  if (!file) return new Response("No encontrado", { status: 404 });

  try {
    const { size } = await stat(file.path);
    const body = Readable.toWeb(createReadStream(file.path)) as ReadableStream;
    return new Response(body, {
      headers: {
        "content-type": file.mime || "application/octet-stream",
        "content-length": String(size),
        "content-disposition": `inline; filename="${encodeURIComponent(file.original_name)}"`,
        "cache-control": "private, max-age=60",
      },
    });
  } catch {
    return new Response("El archivo ya no está en disco", { status: 410 });
  }
}
