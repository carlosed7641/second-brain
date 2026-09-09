import { NextResponse } from "next/server";
import { listFiles } from "@/lib/files";
import { enqueueIngest, reindexFile } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUSY = new Set(["pending", "extracting", "chunking", "embedding", "metadata"]);

/** POST /api/files/reindex — reencola la reindexación de todos los archivos. */
export function POST() {
  const targets = listFiles().filter((f) => !BUSY.has(f.status));
  for (const f of targets) {
    enqueueIngest(() => reindexFile(f.id)).catch((e) =>
      console.error(`[api/files] reindex-all ${f.id}:`, e),
    );
  }
  return NextResponse.json({ queued: targets.length }, { status: 202 });
}
