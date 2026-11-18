import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Paquetes (y todas sus dependencias) que se copian enteros al standalone.
 * Cargan código con rutas dinámicas que el trazado de Next no ve: el worker
 * de tesseract.js (bmp-js, zlibjs…), la DLL de sqlite-vec (dependencia
 * opcional por plataforma) y el canvas nativo de pdf-to-img.
 */
const COPY_WHOLE = ["tesseract.js", "sqlite-vec", "pdf-to-img"];

/** Cierre transitivo de dependencias instaladas, como globs de node_modules. */
function dependencyGlobs(roots: string[]): string[] {
  const seen = new Set<string>();
  const visit = (name: string, fromDir: string) => {
    // Resolución estilo Node: node_modules anidados primero, luego hacia arriba.
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
      const pkgDir = path.join(dir, "node_modules", name);
      if (existsSync(path.join(pkgDir, "package.json"))) {
        if (seen.has(pkgDir)) return;
        seen.add(pkgDir);
        const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
        for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
          visit(dep, pkgDir);
        }
        return;
      }
      if (path.dirname(dir) === dir) return; // no instalado (p. ej. opcional de otra plataforma)
    }
  };
  for (const r of roots) visit(r, process.cwd());
  return [...seen].map((d) => `./${path.relative(process.cwd(), d).replaceAll("\\", "/")}/**/*`);
}

const nextConfig: NextConfig = {
  // Servidor autocontenido en .next/standalone, que la app de escritorio
  // (desktop/main.cjs) arranca sin necesitar `npm run dev`.
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [
      // Runtime de las rutas /api: Next 16.3 no lo traza en standalone.
      "./node_modules/next/dist/compiled/next-server/app-route-turbo.runtime.prod.js",
      ...dependencyGlobs(COPY_WHOLE),
    ],
  },
  // Nunca empaquetar los datos del usuario ni los .env con las claves.
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./.env*", "./dist/**/*", "./desktop/**/*"],
  },
  // Native / node-only modules that must not be bundled by Turbopack/webpack.
  serverExternalPackages: [
    "better-sqlite3",
    "sqlite-vec",
    "chokidar",
    "pdfjs-dist",
    // Usa createRequire(...).resolve() para localizar pdfjs; si se empaqueta,
    // resolve() devuelve un id numérico de módulo y falla el OCR de PDFs escaneados.
    "pdf-to-img",
    "tesseract.js",
    "mammoth",
  ],
  // Ingestion routes handle big files.
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
