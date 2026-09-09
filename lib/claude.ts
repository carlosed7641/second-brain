import Anthropic from "@anthropic-ai/sdk";
import { CHAT_MODEL, FAST_MODEL, anthropicApiKey } from "./config";

/** Cliente Anthropic + helpers de chat (system cacheado, streaming, título). */

const g = globalThis as unknown as { __sbAnthropic?: Anthropic };

export function getAnthropic(): Anthropic {
  if (!g.__sbAnthropic) g.__sbAnthropic = new Anthropic({ apiKey: anthropicApiKey() });
  return g.__sbAnthropic;
}

const CHAT_EFFORT = (process.env.CHAT_EFFORT ?? "low") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export const SYSTEM_PROMPT = `Eres el asistente de "Second Brain", el segundo cerebro personal del usuario.
Respondes SOLO con la información de los FRAGMENTOS que se te pasan como contexto (extractos de los documentos del usuario).

Reglas:
- Si la respuesta no está en los fragmentos, dilo con claridad ("No lo encuentro en tus documentos"). No inventes ni uses conocimiento externo.
- Cita cada afirmación con la fuente entre corchetes, p. ej. [1] o [2], usando el número del fragmento.
- Sé breve y directo. Ve al dato.
- Fechas, importes, números de póliza/contrato y nombres: cópialos EXACTOS del documento.
- Responde en el idioma de la pregunta (por defecto, español).`;

/** Bloques de system con cache_control para reutilizar el prefijo entre turnos. */
export function systemBlocks(): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];
}

export interface StreamAnswerParams {
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
}

/** Abre el stream de la respuesta final del chat (modelo grande). */
export function streamAnswer({ messages, maxTokens = 2048 }: StreamAnswerParams) {
  return getAnthropic().messages.stream({
    model: CHAT_MODEL,
    max_tokens: maxTokens,
    system: systemBlocks(),
    thinking: { type: "adaptive" },
    output_config: { effort: CHAT_EFFORT },
    messages,
  });
}

/** Genera un título corto para la sesión a partir del primer intercambio (modelo barato). */
export async function generateTitle(userMsg: string, answer: string): Promise<string> {
  const res = await getAnthropic().messages.create({
    model: FAST_MODEL,
    max_tokens: 24,
    system:
      "Devuelve SOLO un título de 3 a 6 palabras que resuma la conversación. Sin comillas, sin punto final.",
    messages: [
      { role: "user", content: `Pregunta: ${userMsg}\n\nRespuesta: ${answer}\n\nTítulo:` },
    ],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim()
    .replace(/^["'“”]+|["'“”.]+$/g, "");
  return text.slice(0, 80) || "Nuevo chat";
}
