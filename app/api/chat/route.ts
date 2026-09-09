import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { addMessage, getPromptContext, getSession, messageCount, renameSession } from "@/lib/chat";
import { hybridSearch } from "@/lib/retrieve";
import { assembleContext, assembleMetadataContext, buildUserTurn } from "@/lib/context";
import { classifyQuestion } from "@/lib/classify";
import { queryMetadata } from "@/lib/metadata";
import { generateTitle, streamAnswer } from "@/lib/claude";
import type { Citation, TokenUsage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat  { sessionId, message, fileId? }
 * Devuelve NDJSON en streaming:
 *   {"type":"citations","citations":[...]}
 *   {"type":"delta","text":"..."}   (repetido)
 *   {"type":"done","usage":{...}}
 *   {"type":"error","message":"..."}
 */
export async function POST(req: NextRequest) {
  let body: { sessionId?: string; message?: string; fileId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  const message = body.message?.trim();
  if (!sessionId || !message) {
    return Response.json({ error: "Faltan sessionId o message" }, { status: 400 });
  }
  if (!getSession(sessionId)) {
    return Response.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  const isFirstTurn = messageCount(sessionId) === 0;
  const { summary, recent } = await getPromptContext(sessionId);
  addMessage({ session_id: sessionId, role: "user", content: message });

  // Ruta: metadatos (SQL directo, sin embeddings) vs contenido (RAG híbrido).
  let route: "metadata" | "content" = "content";
  let citations: Citation[] = [];
  let contextText = "";

  try {
    const cls = await classifyQuestion(message);
    if (cls.route === "metadata") {
      const hits = queryMetadata({
        keys: cls.keys.length ? cls.keys : undefined,
        fileId: body.fileId,
        limit: 12,
      });
      if (hits.length > 0) {
        route = "metadata";
        const a = assembleMetadataContext(hits);
        citations = a.citations;
        contextText = a.contextText;
      }
    }
  } catch (e) {
    console.warn("[api/chat] clasificación:", e);
  }

  if (route === "content") {
    try {
      const chunks = await hybridSearch(message, { fileId: body.fileId });
      const assembled = assembleContext(chunks);
      citations = assembled.citations;
      contextText = assembled.contextText;
    } catch (e) {
      console.error("[api/chat] retrieval:", e);
    }
  }
  console.log(`[api/chat] route=${route} fuentes=${citations.length}`);

  // Historia reciente en claro; breakpoint de caché en el último turno para que el
  // prefijo (system + historia) se sirva de la caché en los siguientes turnos.
  const history: Anthropic.MessageParam[] = recent.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  if (history.length > 0) {
    const last = history[history.length - 1];
    history[history.length - 1] = {
      role: last.role,
      content: [
        { type: "text", text: last.content as string, cache_control: { type: "ephemeral" } },
      ],
    };
  }

  const messages: Anthropic.MessageParam[] = [
    ...(summary
      ? [{ role: "user" as const, content: `[Contexto de la conversación previa]\n${summary}` }]
      : []),
    ...history,
    { role: "user", content: buildUserTurn(message, contextText) },
  ];

  const encoder = new TextEncoder();
  const line = (obj: unknown) => encoder.encode(JSON.stringify(obj) + "\n");

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(line({ type: "citations", citations }));
      let full = "";
      try {
        const anthropicStream = streamAnswer({ messages });
        for await (const ev of anthropicStream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            full += ev.delta.text;
            controller.enqueue(line({ type: "delta", text: ev.delta.text }));
          }
        }
        const finalMsg = await anthropicStream.finalMessage();
        const usage = mapUsage(finalMsg.usage);

        addMessage({
          session_id: sessionId,
          role: "assistant",
          content: full,
          citations,
          usage,
        });
        controller.enqueue(line({ type: "done", usage, route }));

        if (isFirstTurn) {
          generateTitle(message, full)
            .then((t) => renameSession(sessionId, t))
            .catch((e) => console.warn("[api/chat] título:", e));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[api/chat] stream:", msg);
        if (full) {
          addMessage({ session_id: sessionId, role: "assistant", content: full, citations });
        }
        controller.enqueue(line({ type: "error", message: msg }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

function mapUsage(u: Anthropic.Usage): TokenUsage {
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens ?? undefined,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? undefined,
  };
}
