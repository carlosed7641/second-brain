import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { EMBED_MODEL } from "@/lib/config";
import {
  resolveAnthropicKey,
  resolveVoyageKey,
  saveSettings,
  type KeySource,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface KeyStatus {
  configured: boolean;
  source: KeySource;
  /** Últimos 4 caracteres, para reconocer la clave sin exponerla. */
  hint: string | null;
}

function status({ value, source }: { value?: string; source: KeySource }): KeyStatus {
  return { configured: !!value, source, hint: value ? `…${value.slice(-4)}` : null };
}

function currentStatus() {
  return {
    anthropic: status(resolveAnthropicKey()),
    voyage: status(resolveVoyageKey()),
  };
}

/** GET /api/settings — qué claves hay configuradas (nunca devuelve la clave). */
export function GET() {
  return NextResponse.json(currentStatus());
}

const Body = z.object({
  anthropicApiKey: z.string().max(500).optional(),
  voyageApiKey: z.string().max(500).optional(),
});

/**
 * PUT /api/settings — guarda las claves. Cada clave no vacía se valida contra
 * su API antes de guardarse; una cadena vacía borra la guardada.
 */
export async function PUT(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  const { anthropicApiKey, voyageApiKey } = parsed.data;

  const errors: Record<string, string> = {};
  const [a, v] = await Promise.all([
    anthropicApiKey?.trim() ? checkAnthropic(anthropicApiKey.trim()) : null,
    voyageApiKey?.trim() ? checkVoyage(voyageApiKey.trim()) : null,
  ]);
  if (a) errors.anthropicApiKey = a;
  if (v) errors.voyageApiKey = v;
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  saveSettings({ anthropicApiKey, voyageApiKey });
  return NextResponse.json(currentStatus());
}

/** Devuelve un mensaje de error, o null si la clave es válida. */
async function checkAnthropic(key: string): Promise<string | null> {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
    return null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return "Clave de Anthropic no válida.";
    if (e instanceof Anthropic.PermissionDeniedError) return "La clave no tiene permisos suficientes.";
    if (e instanceof Anthropic.RateLimitError) return null; // autenticó; solo está limitada
    return `No se pudo comprobar la clave: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function checkVoyage(key: string): Promise<string | null> {
  try {
    // Voyage no tiene un endpoint de "quién soy"; una incrustación mínima cuesta ~1 token.
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: ["ping"] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok || res.status === 429) return null;
    if (res.status === 401 || res.status === 403) return "Clave de Voyage no válida.";
    return `Voyage respondió ${res.status}: ${(await res.text()).slice(0, 200)}`;
  } catch (e) {
    return `No se pudo comprobar la clave: ${e instanceof Error ? e.message : String(e)}`;
  }
}
