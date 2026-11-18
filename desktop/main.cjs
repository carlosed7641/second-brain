/* eslint-disable @typescript-eslint/no-require-imports -- proceso principal de Electron en CommonJS */
/**
 * Proceso principal de la app de escritorio.
 *
 * 1. Arranca el servidor standalone de Next (`.next/standalone/server.js`) en
 *    un proceso utilitario de Electron, en un puerto libre de 127.0.0.1.
 * 2. Muestra una pantalla de carga y, cuando el servidor responde, carga la app.
 *
 * Los datos (base de datos, archivos, settings.json con las claves) viven en
 * %APPDATA%\Second Brain\data, fuera de la carpeta de instalación.
 */
const { app, BrowserWindow, Menu, dialog, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const http = require("node:http");

const STARTUP_TIMEOUT_MS = 60_000;

let server = null;
let mainWindow = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(main);
}

function serverDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(__dirname, "..", ".next", "standalone");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => req.destroy());
  });
}

async function waitForServer(url, exited) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited()) throw new Error("El servidor se cerró al arrancar.");
    if (await ping(url)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("El servidor tardó demasiado en arrancar.");
}

function startServer(port, dataDir, logFile) {
  const dir = serverDir();
  const entry = path.join(dir, "server.js");
  if (!fs.existsSync(entry)) {
    throw new Error(`No se encuentra ${entry}. Ejecuta "npm run desktop:build" primero.`);
  }

  const log = fs.createWriteStream(logFile, { flags: "a" });
  log.write(`\n--- ${new Date().toISOString()} arranque en puerto ${port} ---\n`);

  const child = utilityProcess.fork(entry, [], {
    cwd: dir,
    stdio: "pipe",
    serviceName: "Second Brain server",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATA_DIR: dataDir,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  return child;
}

function splashHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{height:100%;margin:0;background:#f6f8f6;color:#1a2b22;
      font:14px system-ui,-apple-system,"Segoe UI",sans-serif}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
    .logo{width:52px;height:52px;border-radius:14px;background:#eaf4ee;color:#237a52;
      display:flex;align-items:center;justify-content:center}
    .t{font-size:17px;font-weight:700}.s{color:#8a978f;font-size:13px}
    .bar{width:140px;height:3px;border-radius:3px;background:#dceee3;overflow:hidden}
    .bar i{display:block;width:40%;height:100%;background:#237a52;border-radius:3px;
      animation:m 1.1s ease-in-out infinite}
    @keyframes m{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
  </style></head><body>
    <div class="logo"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.5V15a3 3 0 0 0 4 2.8A3 3 0 0 0 12 19V5a2 2 0 0 0-2-2Z"/>
      <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.5V15a3 3 0 0 1-4 2.8A3 3 0 0 1 12 19"/></svg></div>
    <div class="t">Second Brain</div><div class="bar"><i></i></div><div class="s">Abriendo…</div>
  </body></html>`;
}

function createWindow(origin) {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Second Brain",
    backgroundColor: "#f6f8f6",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  // Enlaces a la propia app (p. ej. abrir un PDF) → ventana nueva de la app.
  // Cualquier otro enlace → navegador del sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origin)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: "#f6f8f6" },
      };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith(origin) || url.startsWith("data:")) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  return win;
}

async function main() {
  Menu.setApplicationMenu(null);

  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "data");
  const logDir = path.join(userData, "logs");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "server.log");

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;

  mainWindow = createWindow(origin);
  mainWindow.on("closed", () => (mainWindow = null));
  // Atajo para depurar: Ctrl+Shift+I abre las DevTools.
  mainWindow.webContents.on("before-input-event", (_e, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === "i") {
      mainWindow.webContents.toggleDevTools();
    }
  });
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);

  let exited = false;
  try {
    server = startServer(port, dataDir, logFile);
    server.on("exit", (code) => {
      exited = true;
      server = null;
      if (!quitting) {
        dialog.showErrorBox(
          "Second Brain",
          `El servidor interno se detuvo (código ${code}).\n\nRegistro: ${logFile}`,
        );
        app.quit();
      }
    });
    await waitForServer(origin, () => exited);
  } catch (err) {
    if (!exited) {
      dialog.showErrorBox(
        "Second Brain",
        `No se pudo iniciar la aplicación.\n\n${err.message}\n\nRegistro: ${logFile}`,
      );
    }
    quitting = true;
    server?.kill();
    app.quit();
    return;
  }

  mainWindow?.loadURL(origin);
}

app.on("window-all-closed", () => app.quit());

app.on("before-quit", () => {
  quitting = true;
  server?.kill();
});
