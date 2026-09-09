"use client";

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import SessionSidebar from "@/components/SessionSidebar";
import ChatPane from "@/components/ChatPane";
import FileBrowser from "@/components/FileBrowser";
import { fetcher, type FileDTO } from "@/components/lib";

const LS_KEY = "sb.activeSession";

export default function Home() {
  const { mutate } = useSWRConfig();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const { data: filesData } = useSWR<{ files: FileDTO[] }>("/api/files", fetcher);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setActiveId(saved);
  }, []);

  useEffect(() => {
    if (activeId) localStorage.setItem(LS_KEY, activeId);
    else localStorage.removeItem(LS_KEY);
  }, [activeId]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <SessionSidebar
        activeId={activeId}
        onSelect={setActiveId}
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
