import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./claude";
import { FAST_MODEL } from "./config";

/**
 * Clasifica la pregunta: `metadata` (dato puntual estructurado — fecha, importe,
 * periodicidad, contraparte) vs `content` (todo lo demás). La ruta `metadata`
 * responde por SQL sin tocar embeddings ni mandar fragmentos.
 */

const ROUTE_KEYS = [
  "vencimiento",
  "fecha_inicio",
  "fecha_firma",
  "importe",
  "periodicidad",
  "contraparte",
  "referencia",
  "titular",
  "tipo",
] as const;

const Schema = z.object({
  route: z.enum(["metadata", "content"]),
  keys: z.array(z.enum(ROUTE_KEYS)).max(5),
});

export type Classification = z.infer<typeof Schema>;

export async function classifyQuestion(question: string): Promise<Classification> {
  try {
    const msg = await getAnthropic().messages.parse({
      model: FAST_MODEL,
      max_tokens: 150,
      system:
        "Clasifica la pregunta del usuario sobre sus documentos personales.\n" +
        '- "metadata": pide un dato puntual y estructurado — una fecha (vencimiento, renovación, ' +
        "inicio, firma), un importe, una periodicidad, la contraparte o una referencia. " +
        'Ej.: "¿cuándo vence mi seguro?", "¿cuánto pago de alquiler?", "¿cada cuánto se renueva Prime?".\n' +
        '- "content": cualquier otra cosa — explicaciones, cláusulas, resúmenes, "muéstrame…", ' +
        "comparaciones, preguntas abiertas.\n" +
        "keys: qué tipos de dato pide (vacío si content).",
      messages: [{ role: "user", content: question.slice(0, 500) }],
      output_config: { format: zodOutputFormat(Schema) },
    });
    return msg.parsed_output ?? { route: "content", keys: [] };
  } catch {
    return { route: "content", keys: [] };
  }
}
