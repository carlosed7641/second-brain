/* eslint-disable @typescript-eslint/no-require-imports -- hook de electron-builder en CommonJS */
/**
 * Hook `afterPack` de electron-builder: copia .next/standalone a
 * resources/server tal cual. Se hace aquí y no con `extraResources` porque
 * electron-builder descarta `node_modules/` y las carpetas con punto (`.next/`),
 * que el servidor necesita.
 */
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const src = path.join(__dirname, "..", ".next", "standalone");
  if (!fs.existsSync(path.join(src, "server.js"))) {
    throw new Error("Falta .next/standalone; ejecuta `npm run desktop:build` antes.");
  }
  const dest = path.join(context.appOutDir, "resources", "server");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, dereference: true });
  console.log(`  • servidor copiado a ${path.relative(process.cwd(), dest)}`);
};
