import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { FILES_DIR, ensureDataDirs } from "@/lib/config";
import { isSupported } from "@/lib/extract";
import { enqueueIngest, ingestFile } from "@/lib/ingest";
import { listFiles } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/files — lista de archivos con su estado de indexado. */
export function GET() {
  return NextResponse.json({ files: listFiles() });
}

/** POST /api/files — subida multipart. Campo `file` (uno o varios) + `category`. */
export async function POST(req: NextRequest) {
  ensureDataDirs();
  const form = await req.formData();
  const category = (form.get("category") as string | null) ?? undefined;
  const uploads = form.getAll("file").filter((v): v is File => v instanceof File);

  if (uploads.length === 0) {
    return NextResponse.json({ error: "Falta el campo 'file'" }, { status: 400 });
  }

  const accepted: { name: string; queued: boolean; reason?: string }[] = [];

  for (const file of uploads) {
    if (!isSupported(file.name)) {
      accepted.push({ name: file.name, queued: false, reason: "tipo no soportado" });
      continue;
    }
    const ext = path.extname(file.name);
    const dest = path.join(FILES_DIR, `${crypto.randomUUID()}${ext}`);
    await writeFile(dest, Buffer.from(await file.arrayBuffer()));

    enqueueIngest(() =>
      ingestFile({ absPath: dest, originalName: file.name, category }),
    ).catch((e) => console.error(`[api/files] ingesta ${file.name}:`, e));

    accepted.push({ name: file.name, queued: true });
  }

  return NextResponse.json({ accepted }, { status: 202 });
}
