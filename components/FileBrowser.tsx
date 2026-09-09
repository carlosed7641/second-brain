"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { CATEGORIES } from "@/lib/categories";
import {
  CategoryIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalIcon,
  PlusIcon,
  RefreshIcon,
  SpinnerIcon,
  TrashIcon,
  XIcon,
} from "./icons";
import {
  STATUS_LABEL,
  daysUntil,
  fetcher,
  fmtDate,
  rawUrl,
  type FileDTO,
  type MetadataDTO,
} from "./lib";

const BUSY: FileDTO["status"][] = ["pending", "extracting", "chunking", "embedding", "metadata"];

export default function FileBrowser({ onClose }: { onClose: () => void }) {
  const { data, mutate } = useSWR<{ files: FileDTO[] }>("/api/files", fetcher, {
    refreshInterval: (d) => (d?.files.some((f) => BUSY.includes(f.status)) ? 1500 : 0),
  });
  const files = data?.files ?? [];
  const [category, setCategory] = useState<string>("Otros");
  const [open, setOpen] = useState<Record<string, boolean>>({ Seguros: true });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, FileDTO[]>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const f of files) (map.get(f.category) ?? map.get("Otros")!).push(f);
    return CATEGORIES.map((c) => [c, map.get(c) ?? []] as const).filter(([, v]) => v.length > 0);
  }, [files]);

  async function upload(list: FileList | File[]) {
    const fd = new FormData();
    fd.append("category", category);
    for (const f of Array.from(list)) fd.append("file", f);
    await fetch("/api/files", { method: "POST", body: fd });
    mutate();
  }

  async function del(id: string) {
    await fetch(`/api/files/${id}`, { method: "DELETE" });
    mutate();
  }
  async function reindex(id: string) {
    await fetch(`/api/files/${id}`, { method: "POST" });
    mutate();
  }
  async function reindexAll() {
    await fetch("/api/files/reindex", { method: "POST" });
    mutate();
  }

  return (
    <section
      className="flex w-96 shrink-0 flex-col border-l border-border bg-surface"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <div className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-border px-4">
        <span className="flex-1 text-[15px] font-bold">Archivos</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-8 rounded-lg border border-border bg-[#FBFDFC] px-2 text-xs outline-none"
          title="Categoría para las subidas"
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex h-8 items-center gap-1.5 rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-white hover:bg-primary-strong"
        >
          <PlusIcon size={14} />
          Subir
        </button>
        <button
          onClick={reindexAll}
          disabled={files.length === 0}
          className="flex size-8 items-center justify-center rounded-[9px] border border-border bg-[#FBFDFC] text-muted hover:text-primary disabled:opacity-40"
          title="Reindexar todos los archivos"
        >
          <RefreshIcon size={14} />
        </button>
        <button
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-[9px] border border-border bg-[#FBFDFC] text-muted hover:text-foreground"
        >
          <XIcon size={15} />
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        <UpcomingDeadlines />

        {files.length === 0 && (
          <p className="px-2 py-8 text-center text-[13px] leading-relaxed text-faint">
            Sin documentos todavía. Arrastra archivos aquí o suéltalos en{" "}
            <span className="font-semibold text-primary">data/inbox/</span>.
          </p>
        )}

        {grouped.map(([cat, list]) => {
          const isOpen = open[cat] ?? false;
          return (
            <div key={cat}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [cat]: !isOpen }))}
                className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-[13.5px] ${
                  isOpen ? "bg-[#F1F6F3] font-semibold" : ""
                }`}
              >
                <span className="text-primary">
                  <CategoryIcon category={cat} />
                </span>
                <span className="flex-1 text-left">{cat}</span>
                <span className="text-xs text-faint">{list.length}</span>
                {isOpen ? (
                  <ChevronDownIcon size={14} className="text-primary" />
                ) : (
                  <ChevronRightIcon size={14} className="text-[#B7C4BC]" />
                )}
              </button>

              {isOpen && (
                <div className="flex flex-col gap-0.5 py-1 pl-7 pr-1">
                  {list.map((f) => (
                    <FileRow key={f.id} f={f} onDelete={() => del(f.id)} onReindex={() => reindex(f.id)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-3.5">
        <div
          className={`rounded-xl border-[1.5px] border-dashed p-4 text-center text-[12.5px] leading-relaxed transition ${
            dragging ? "border-primary bg-mint-tint text-primary-strong" : "border-mint-border text-muted"
          }`}
        >
          Arrastra archivos aquí
          <br />o suéltalos en <span className="font-semibold text-primary">data/inbox/</span>
        </div>
      </div>
    </section>
  );
}

function UpcomingDeadlines() {
  const { data } = useSWR<{ items: MetadataDTO[] }>("/api/metadata?upcoming=1&limit=6", fetcher);
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <div className="mb-2 rounded-xl border border-mint-border bg-[#FBFEFC] p-3">
      <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
        Próximos vencimientos
      </div>
      <div className="flex flex-col gap-1">
        {items.map((m) => {
          const d = daysUntil(m.value_date);
          return (
            <a
              key={m.id}
              href={rawUrl(m.file_id, m.page)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[12.5px] hover:bg-mint-tint"
            >
              <CategoryIcon category={m.category} size={13} />
              <span className="min-w-0 flex-1 truncate">{m.label ?? m.value}</span>
              <span className="shrink-0 text-[11px] text-muted">{fmtDate(m.value_date)}</span>
              {d != null && d <= 30 && (
                <span className="shrink-0 rounded-full bg-mint px-1.5 text-[10px] font-semibold text-primary-strong">
                  {d <= 0 ? "hoy" : `${d} d`}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function FileRow({
  f,
  onDelete,
  onReindex,
}: {
  f: FileDTO;
  onDelete: () => void;
  onReindex: () => void;
}) {
  const busy = BUSY.includes(f.status);
  return (
    <div className="group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-foreground/80 hover:bg-[#F7FAF8]">
      <span className="text-faint">
        <CategoryIcon category={f.category} size={14} />
      </span>
      <a
        href={rawUrl(f.id)}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 items-center gap-1 truncate hover:text-primary-strong"
        title={f.original_name}
      >
        <span className="truncate">{f.original_name}</span>
        <ExternalIcon size={11} className="shrink-0 text-faint opacity-0 group-hover:opacity-100" />
      </a>

      {f.status === "indexed" ? (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-primary" title={f.status_detail ?? ""}>
          <CheckIcon size={11} />
          {f.ocr ? "OCR" : "OK"}
        </span>
      ) : f.status === "error" ? (
        <span className="shrink-0 text-[11px] text-red-600" title={f.error ?? "Error"}>
          Error
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted" title={f.status_detail ?? ""}>
          <SpinnerIcon size={11} />
          {STATUS_LABEL[f.status]}
        </span>
      )}

      {!busy && (
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button onClick={onReindex} className="rounded p-1 text-faint hover:text-primary" title="Reindexar">
            <RefreshIcon size={12} />
          </button>
          <button onClick={onDelete} className="rounded p-1 text-faint hover:text-red-600" title="Borrar">
            <TrashIcon size={12} />
          </button>
        </span>
      )}
    </div>
  );
}
