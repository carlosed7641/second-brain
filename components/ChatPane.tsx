"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { BrainIcon, ExternalIcon, SendIcon, SpinnerIcon, UploadIcon } from "./icons";
import { CategoryIcon } from "./icons";
import { fetcher, rawUrl, type ChatMessageDTO, type SessionDTO } from "./lib";
import type { Citation } from "@/lib/types";

interface Props {
  sessionId: string | null;
  onExchange: () => void; // refrescar la lista de sesiones (título nuevo)
  onOpenFiles: () => void;
}

interface Pending {
  question: string;
  answer: string;
  citations: Citation[];
  error: string | null;
  streaming: boolean;
}

export default function ChatPane({ sessionId, onExchange, onOpenFiles }: Props) {
  const { data, mutate } = useSWR<{ session: SessionDTO; messages: ChatMessageDTO[] }>(
    sessionId ? `/api/sessions/${sessionId}` : null,
    fetcher,
  );
  const messages = data?.messages ?? [];
  const [pending, setPending] = useState<Pending | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  useEffect(() => {
    setPending(null);
    setInput("");
    abortRef.current?.abort();
  }, [sessionId]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || !sessionId || pending?.streaming) return;
    setInput("");
    setPending({ question, answer: "", citations: [], error: null, streaming: true });

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, message: question }),
        signal: ac.signal,
      });
      if (!res.body) throw new Error("Sin respuesta del servidor");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          const ev = JSON.parse(raw) as
            | { type: "citations"; citations: Citation[] }
            | { type: "delta"; text: string }
            | { type: "done" }
            | { type: "error"; message: string };
          if (ev.type === "citations") {
            setPending((p) => (p ? { ...p, citations: ev.citations } : p));
          } else if (ev.type === "delta") {
            setPending((p) => (p ? { ...p, answer: p.answer + ev.text } : p));
          } else if (ev.type === "error") {
            setPending((p) => (p ? { ...p, error: ev.message, streaming: false } : p));
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setPending((p) => (p ? { ...p, error: (e as Error).message, streaming: false } : p));
      }
    } finally {
      setPending((p) => (p ? { ...p, streaming: false } : p));
      await mutate();
      onExchange();
      setTimeout(() => setPending(null), 50);
    }
  }, [input, sessionId, pending, mutate, onExchange]);

  if (!sessionId) {
    return (
      <Welcome onOpenFiles={onOpenFiles} />
    );
  }

  const showEmpty = messages.length === 0 && !pending;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-surface px-7">
        <span className="truncate text-[15px] font-semibold">
          {data?.session.title ?? "Chat"}
        </span>
      </header>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-5 overflow-y-auto bg-background p-7">
        {showEmpty && (
          <div className="m-auto max-w-sm text-center text-sm text-muted">
            Pregunta lo que sea sobre tus documentos. Las respuestas citan la fuente.
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <UserBubble key={m.id} text={m.content} />
          ) : (
            <AssistantBubble key={m.id} text={m.content} citations={m.citations ?? []} />
          ),
        )}

        {pending && (
          <>
            <UserBubble text={pending.question} />
            <AssistantBubble
              text={pending.answer}
              citations={pending.citations}
              streaming={pending.streaming}
              error={pending.error}
            />
          </>
        )}
      </div>

      <div className="flex items-end gap-3 border-t border-border bg-surface p-[18px_28px]">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Pregunta lo que sea sobre tus documentos…"
          className="max-h-40 flex-1 resize-none rounded-xl border border-[#D8E2DC] bg-[#FBFDFC] px-3.5 py-3 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={send}
          disabled={!input.trim() || pending?.streaming}
          className="flex size-[46px] shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary-strong disabled:bg-mint disabled:text-[#7FAF95]"
        >
          {pending?.streaming ? <SpinnerIcon size={19} /> : <SendIcon size={19} />}
        </button>
      </div>
    </main>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[520px] self-end whitespace-pre-wrap rounded-[14px_14px_4px_14px] bg-mint px-4 py-3 text-sm leading-relaxed text-primary-ink">
      {text}
    </div>
  );
}

function AssistantBubble({
  text,
  citations,
  streaming,
  error,
}: {
  text: string;
  citations: Citation[];
  streaming?: boolean;
  error?: string | null;
}) {
  return (
    <div className="flex max-w-[640px] gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-mint-tint text-primary">
        <BrainIcon size={18} />
      </span>
      <div className="flex flex-col gap-3 rounded-[4px_14px_14px_14px] border border-border bg-surface px-4 py-3.5 text-sm leading-[1.55] shadow-[0_1px_2px_rgba(20,40,30,0.04)]">
        {text ? (
          <p className="whitespace-pre-wrap">{renderInlineCitations(text)}</p>
        ) : streaming ? (
          <span className="flex items-center gap-2 text-muted">
            <SpinnerIcon size={14} /> Buscando en tus documentos…
          </span>
        ) : null}

        {error && (
          <p className="rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">{error}</p>
        )}

        {citations.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {citations.map((c) => (
              <a
                key={c.n}
                href={rawUrl(c.file_id, c.page)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-[#E0EAE4] bg-[#F1F6F3] px-2.5 py-1.5 text-xs text-[#4A5A51] transition hover:border-mint-border hover:bg-mint-tint"
                title={c.snippet}
              >
                <span className="text-primary">
                  <CategoryIcon category={c.category} size={13} />
                </span>
                <span className="font-medium">[{c.n}]</span>
                {c.file_name}
                {c.page != null && ` · p.${c.page}`}
                <ExternalIcon size={12} className="text-faint" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Resalta los [n] del texto como pastillas. */
function renderInlineCitations(text: string) {
  return text.split(/(\[\d+\])/g).map((part, i) =>
    /^\[\d+\]$/.test(part) ? (
      <sup key={i} className="mx-0.5 rounded bg-mint px-1 text-[10px] font-semibold text-primary-strong">
        {part.slice(1, -1)}
      </sup>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Welcome({ onOpenFiles }: { onOpenFiles: () => void }) {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[60px] shrink-0 items-center border-b border-border bg-surface px-7 text-[15px] font-semibold">
        Second Brain
      </header>
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="flex max-w-md flex-col items-center gap-5 text-center">
          <span className="flex size-[76px] items-center justify-center rounded-[22px] bg-mint-tint text-primary">
            <BrainIcon size={40} />
          </span>
          <h1 className="text-[22px] font-bold text-primary-ink">Empieza una conversación</h1>
          <p className="text-sm leading-relaxed text-muted">
            Crea un chat nuevo y pregunta sobre tus contratos, seguros o recibos. Si aún no
            has subido nada, arrástralo a <span className="font-semibold text-primary">data/inbox/</span> o
            usa el panel de archivos.
          </p>
          <button
            onClick={onOpenFiles}
            className="flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-strong"
          >
            <UploadIcon size={16} />
            Ver / subir archivos
          </button>
        </div>
      </div>
    </main>
  );
}
