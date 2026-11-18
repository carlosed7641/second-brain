import path from "node:path";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { DATA_DIR, ensureDataDirs } from "./config";

/**
 * Ajustes editables desde la pantalla de configuración (claves de API).
 * Se guardan en data/settings.json, junto a la base de datos, para que la app
 * de escritorio no dependa de un `.env`. Tienen prioridad sobre las variables
 * de entorno; si un ajuste está vacío se usa la variable de entorno.
 */

export interface Settings {
  anthropicApiKey?: string;
  voyageApiKey?: string;
}

export const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

const g = globalThis as unknown as { __sbSettings?: Settings };

export function getSettings(): Settings {
  if (!g.__sbSettings) {
    try {
      g.__sbSettings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as Settings;
    } catch {
      g.__sbSettings = {};
    }
  }
  return g.__sbSettings;
}

export type KeySource = "settings" | "env" | null;

function resolve(saved: string | undefined, env: string | undefined) {
  if (saved) return { value: saved, source: "settings" as KeySource };
  if (env) return { value: env, source: "env" as KeySource };
  return { value: undefined, source: null as KeySource };
}

export function resolveAnthropicKey() {
  return resolve(getSettings().anthropicApiKey, process.env.ANTHROPIC_API_KEY);
}

export function resolveVoyageKey() {
  return resolve(getSettings().voyageApiKey, process.env.VOYAGE_API_KEY);
}

export function anthropicApiKey(): string {
  const { value } = resolveAnthropicKey();
  if (!value) throw new Error("Falta la clave de Anthropic. Añádela en Configuración.");
  return value;
}

export function voyageApiKey(): string {
  const { value } = resolveVoyageKey();
  if (!value) throw new Error("Falta la clave de Voyage. Añádela en Configuración.");
  return value;
}

/** Fusiona y guarda. Un valor `""` borra el ajuste (vuelve a usar el entorno). */
export function saveSettings(patch: Partial<Settings>): Settings {
  ensureDataDirs();
  const next: Settings = { ...getSettings() };
  for (const [k, v] of Object.entries(patch) as [keyof Settings, string | undefined][]) {
    if (v === undefined) continue;
    if (v.trim() === "") delete next[k];
    else next[k] = v.trim();
  }
  // Escritura atómica: primero a un temporal y luego rename.
  const tmp = `${SETTINGS_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, SETTINGS_PATH);
  g.__sbSettings = next;
  return next;
}
