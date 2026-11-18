import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import { INBOX_DIR, ensureDataDirs } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/inbox — ruta absoluta de la carpeta inbox (para mostrarla). */
export function GET() {
  return NextResponse.json({ path: INBOX_DIR });
}

/**
 * POST /api/inbox — abre la carpeta inbox en el explorador de archivos del
 * sistema. Funciona porque el servidor corre en el mismo equipo que el usuario
 * (npm run dev o la app de escritorio). No recibe parámetros: solo abre esa ruta.
 */
export function POST(req: NextRequest) {
  // Solo desde la propia app: una web de otro origen no puede disparar esto.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  ensureDataDirs();
  const opener =
    process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  try {
    const child = spawn(opener, [INBOX_DIR], { detached: true, stdio: "ignore", windowsHide: false });
    child.on("error", (e) => console.error("[inbox] no se pudo abrir la carpeta:", e.message));
    child.unref();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
  return NextResponse.json({ path: INBOX_DIR });
}
