/**
 * Genera el icono de la app de escritorio a partir del BrainIcon de
 * components/icons.tsx: cerebro blanco sobre un cuadrado redondeado verde.
 *
 *   node scripts/make-icon.mjs   →  desktop/icon.ico (16–256 px) + desktop/icon.png
 *
 * Cada tamaño se dibuja por separado (no se reescala) y los pequeños usan un
 * trazo más grueso para que el cerebro se siga leyendo a 16 px.
 */
import { createCanvas, Path2D } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import path from "node:path";

const out = path.resolve(import.meta.dirname, "..", "desktop");

// Mismos trazos que BrainIcon (rejilla 24×24).
const BRAIN = [
  "M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.5V15a3 3 0 0 0 4 2.8A3 3 0 0 0 12 19V5a2 2 0 0 0-2-2Z",
  "M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.5V15a3 3 0 0 1-4 2.8A3 3 0 0 1 12 19",
];
const PRIMARY = "#237a52";
const PRIMARY_STRONG = "#155c3b";

function render(size) {
  const c = createCanvas(size, size);
  const g = c.getContext("2d");

  // Fondo: cuadrado redondeado con un degradado suave de la paleta de la app.
  const r = size * 0.22;
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, PRIMARY);
  grad.addColorStop(1, PRIMARY_STRONG);
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(0, 0, size, size, r);
  g.fill();

  // Cerebro centrado; ocupa ~68% del lado (el path va de x 5–19, y 3–19).
  const box = size * 0.68;
  const scale = box / 16;
  g.translate(size / 2 - 12 * scale, size / 2 - 11 * scale);
  g.scale(scale, scale);
  g.strokeStyle = "#ffffff";
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = size <= 24 ? 2.6 : size <= 48 ? 2.1 : 1.7;
  for (const d of BRAIN) g.stroke(new Path2D(d));

  return c.toBuffer("image/png");
}

/** ICO con imágenes PNG embebidas (válido desde Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // tipo: icono
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); // 0 = 256
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); // paleta
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); // planos
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const images = sizes.map((size) => ({ size, png: render(size) }));
writeFileSync(path.join(out, "icon.ico"), ico(images));
writeFileSync(path.join(out, "icon.png"), render(512));
console.log(`icono generado en ${path.relative(process.cwd(), out)}/icon.ico e icon.png`);
