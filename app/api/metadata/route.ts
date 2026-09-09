import { NextRequest, NextResponse } from "next/server";
import { queryMetadata } from "@/lib/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/metadata            — todos los metadatos con fecha, ordenados.
 * GET /api/metadata?upcoming=1 — solo fechas futuras (próximos vencimientos).
 * GET /api/metadata?fileId=... — metadatos de un archivo.
 */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const items = queryMetadata({
    upcoming: sp.get("upcoming") === "1",
    fileId: sp.get("fileId") ?? undefined,
    limit: Number(sp.get("limit") ?? 100),
  });
  return NextResponse.json({ items });
}
