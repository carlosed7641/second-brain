/**
 * Prepara .next/standalone para empaquetarlo en la app de escritorio:
 *   1. `next build` (output: "standalone")
 *   2. copia public/ y .next/static/ dentro (el standalone no los incluye)
 *   3. borra cualquier .env o data/ que se haya colado (claves y datos del usuario)
 *   4. comprueba que los binarios nativos están presentes
 *   5. arranca una copia fuera del repo y llama a las rutas /api
 *
 * Después, `electron-builder` copia .next/standalone a resources/server.
 */
import { execSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");

const step = (msg) => console.log(`\n[desktop] ${msg}`);

step("next build");
rmSync(standalone, { recursive: true, force: true });
execSync("npx next build", { cwd: root, stdio: "inherit" });

step("copiando public/ y .next/static/");
cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});

step("quitando .env y data/ del paquete");
for (const name of readdirSync(standalone)) {
  if (name.startsWith(".env") || name === "data" || name === "dist") {
    rmSync(path.join(standalone, name), { recursive: true, force: true });
    console.log(`  - ${name}`);
  }
}

step("comprobando binarios nativos");
const required = [
  "server.js",
  "node_modules/better-sqlite3/prebuilds/win32-x64.node",
  "node_modules/sqlite-vec-windows-x64/vec0.dll",
  "node_modules/tesseract.js/src/worker-script/node/index.js",
];
const missing = required.filter((p) => !existsSync(path.join(standalone, p)));
if (missing.length) {
  console.error("Faltan archivos en .next/standalone:\n  " + missing.join("\n  "));
  process.exit(1);
}
console.log("  ok");

// Prueba de humo FUERA del repo: dentro de él, Node encontraría en el
// node_modules raíz lo que falte en el standalone y ocultaría el problema.
step("prueba de humo del servidor (copia en una carpeta temporal)");
const tmp = mkdtempSync(path.join(os.tmpdir(), "sb-smoke-"));
const copy = path.join(tmp, "server");
cpSync(standalone, copy, { recursive: true });
const port = 39000 + Math.floor(Math.random() * 1000);
const env = { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", DATA_DIR: path.join(tmp, "data") };
delete env.ANTHROPIC_API_KEY;
delete env.VOYAGE_API_KEY;
const child = spawn(process.execPath, ["server.js"], { cwd: copy, env, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (d) => (output += d));
child.stderr.on("data", (d) => (output += d));

const base = `http://127.0.0.1:${port}`;
let failed = null;
try {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await fetch(base);
      break;
    } catch {
      if (Date.now() > deadline) throw new Error("el servidor no arrancó");
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  for (const route of ["/", "/api/settings", "/api/files", "/api/sessions", "/api/metadata"]) {
    const res = await fetch(base + route);
    console.log(`  ${res.status} ${route}`);
    if (!res.ok) failed = `${route} respondió ${res.status}`;
  }
  if (/Cannot find module|Failed to load/.test(output)) failed = "faltan módulos en el standalone";
} catch (e) {
  failed = e.message;
} finally {
  child.kill();
  await new Promise((r) => child.once("exit", r));
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
}
if (failed) {
  console.error(`\nLa prueba de humo falló: ${failed}\n\n${output}`);
  process.exit(1);
}
console.log("  ok");
