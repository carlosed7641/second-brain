"use client";

import { useState } from "react";
import useSWR from "swr";
import { BrainIcon, FolderIcon, PlusIcon, TrashIcon } from "./icons";
import { fetcher, type SessionDTO } from "./lib";

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
  fileCount: number;
  onToggleFiles: () => void;
  filesOpen: boolean;
}

export default function SessionSidebar({
  activeId,
  onSelect,
  onDeleted,
  fileCount,
  onToggleFiles,
  filesOpen,
}: Props) {
  const { data, mutate } = useSWR<{ sessions: SessionDTO[] }>("/api/sessions", fetcher);
  const sessions = data?.sessions ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function newChat() {
    const res = await fetch("/api/sessions", { method: "POST" });
    const { session } = await res.json();
    await mutate();
    onSelect(session.id);
  }

  async function remove(id: string) {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    await mutate();
    onDeleted(id);
  }

  async function rename(id: string) {
    const title = draft.trim();
    setEditing(null);
    if (!title) return;
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await mutate();
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-border bg-surface p-5">
      <div className="flex items-center gap-2.5 text-[15px] font-bold">
        <span className="flex size-8 items-center justify-center rounded-[9px] bg-mint-tint text-primary">
          <BrainIcon size={19} />
        </span>
        Second Brain
      </div>

      <button
        onClick={newChat}
        className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-semibold text-white transition hover:bg-primary-strong"
      >
        <PlusIcon size={16} />
        Nuevo chat
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          Chats
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="px-2.5 py-2 text-[12.5px] leading-relaxed text-faint">
              Aún no tienes conversaciones.
            </p>
          )}
          {sessions.map((s) => {
            const active = s.id === activeId;
            return (
              <div
                key={s.id}
                className={`group flex items-center gap-1 rounded-lg text-[13.5px] ${
                  active ? "bg-mint font-semibold text-primary-strong" : "text-foreground/80"
                }`}
              >
                {editing === s.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => rename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(s.id);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="w-full rounded-lg bg-white px-2.5 py-2 text-[13.5px] outline-none ring-1 ring-primary"
                  />
                ) : (
                  <>
                    <button
                      onClick={() => onSelect(s.id)}
                      onDoubleClick={() => {
                        setEditing(s.id);
                        setDraft(s.title);
                      }}
                      className="flex-1 truncate px-2.5 py-2 text-left"
                      title={s.title}
                    >
                      {s.title}
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      className="mr-1 hidden shrink-0 rounded p-1 text-faint hover:text-primary-strong group-hover:block"
                      title="Borrar chat"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={onToggleFiles}
        className={`flex items-center gap-2.5 rounded-[10px] border p-3 text-left text-[13px] transition ${
          filesOpen
            ? "border-mint-border bg-mint-tint font-semibold text-primary-strong"
            : "border-border bg-[#FBFDFC] hover:bg-mint-tint"
        }`}
      >
        <FolderIcon size={18} className="text-primary" />
        <span className="flex-1 font-medium">Archivos</span>
        <span className="text-xs text-faint">{fileCount} docs</span>
      </button>
    </aside>
  );
}
