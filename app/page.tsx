"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import SessionSidebar from "@/components/SessionSidebar";
import ChatPane from "@/components/ChatPane";
import FileBrowser from "@/components/FileBrowser";
import { fetcher, type FileDTO } from "@/components/lib";

const LS_KEY = "sb.activeSession";
const FILES_OPEN_KEY = "sb.filesOpen";

/**
 * `useLayoutEffect` en el navegador (aplica el estado ANTES de pintar, sin
 * salto visual) y `useEffect` en el servidor (donde `useLayoutEffect` no hace
 * nada y solo saca un aviso en consola). Patrón estándar para leer
 * localStorage al montar sin parpadeo.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function Home() {
  const { mutate } = useSWRConfig();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const { data: filesData } = useSWR<{ files: FileDTO[] }>("/api/files", fetcher);

  useIsomorphicLayoutEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setActiveId(saved);
    if (localStorage.getItem(FILES_OPEN_KEY) === "1") setFilesOpen(true);
  }, []);

  useEffect(() => {
    if (activeId) localStorage.setItem(LS_KEY, activeId);
    else localStorage.removeItem(LS_KEY);
  }, [activeId]);

  useEffect(() => {
    if (filesOpen) localStorage.setItem(FILES_OPEN_KEY, "1");
    else localStorage.removeItem(FILES_OPEN_KEY);
  }, [filesOpen]);

  const newChat = useCallback(async () => {
    const res = await fetch("/api/sessions", { method: "POST" });
    const { session } = await res.json();
    await mutate("/api/sessions");
    setActiveId(session.id);
  }, [mutate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <SessionSidebar
        activeId={activeId}
        onSelect={setActiveId}
        onNew={newChat}
        onDeleted={(id) => setActiveId((cur) => (cur === id ? null : cur))}
        fileCount={filesData?.files.length ?? 0}
        filesOpen={filesOpen}
        onToggleFiles={() => setFilesOpen((v) => !v)}
      />

      <ChatPane
        sessionId={activeId}
        onExchange={() => mutate("/api/sessions")}
        onOpenFiles={() => setFilesOpen(true)}
      />

      {filesOpen && <FileBrowser onClose={() => setFilesOpen(false)} />}
    </div>
  );
}
