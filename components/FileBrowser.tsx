"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { CATEGORIES } from "@/lib/categories";
import {
  CategoryIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EditIcon,
  ExternalIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
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
/** MIME a medida para el drag interno (arrastrar una fila a otra carpeta). No
 * choca con el drag de archivos reales del Finder, que llega como tipo "Files". */
const DRAG_MIME = "application/x-second-brain-file-id";

/** Estado optimista: un archivo que se está subiendo, antes de que exista su fila real. */
interface UploadingItem {
  key: string;
  name: string;
  category: string;
}

export default function FileBrowser({ onClose }: { onClose: () => void }) {
  const { data, mutate } = useSWR<{ files: FileDTO[] }>("/api/files", fetcher, {
    refreshInterval: (d) => (d?.files.some((f) => BUSY.includes(f.status)) ? 1500 : 0),
  });
  const files = data?.files ?? [];
  const [uploadCategory, setUploadCategory] = useState<string>("Otros");
  const [open, setOpen] = useState<Record<string, boolean>>({ Seguros: true });
  const [query, setQuery] = useState("");
  const [dropCat, setDropCat] = useState<string | null>(null); // categoría con un archivo encima
  const [draggingUpload, setDraggingUpload] = useState(false); // drag de archivo real (Finder)
  const [uploading, setUploading] = useState<UploadingItem[]>([]); // estado optimista
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q ? files.filter((f) => f.original_name.toLowerCase().includes(q)) : files;

  const grouped = useMemo(() => {
    const map = new Map<string, FileDTO[]>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const f of filtered) (map.get(f.category) ?? map.get("Otros")!).push(f);
    // Buscando: solo las carpetas con resultado. Si no, todas (incluidas vacías,
    // para poder arrastrar un archivo a una carpeta que hoy no tiene nada).
    return CATEGORIES.map((c) => [c, map.get(c) ?? []] as const).filter(
      ([, v]) => v.length > 0 || !q,
    );
  }, [filtered, q]);

  async function upload(list: FileList | File[], category: string = uploadCategory) {
    // Optimista: aparece "Subiendo…" ya, antes de esperar a la red.
    const items: UploadingItem[] = Array.from(list).map((f) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      category,
    }));
    setUploading((u) => [...u, ...items]);
    try {
      const fd = new FormData();
      fd.append("category", category);
      for (const f of Array.from(list)) fd.append("file", f);
      await fetch("/api/files", { method: "POST", body: fd });
    } finally {
      const keys = new Set(items.map((i) => i.key));
      setUploading((u) => u.filter((x) => !keys.has(x.key)));
      mutate(); // la fila real ya existe en la BD (registro síncrono en la API)
    }
  }

  async function patch(id: string, body: { original_name?: string; category?: string }) {
    await fetch(`/api/files/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
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
        if (!e.dataTransfer.types.includes("Files")) return; // solo archivos del Finder
        e.preventDefault();
        setDraggingUpload(true);
      }}
      onDragLeave={() => setDraggingUpload(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDraggingUpload(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <div className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-border px-4">
        <span className="flex-1 text-[15px] font-bold">Archivos</span>
        <select
          value={uploadCategory}
          onChange={(e) => setUploadCategory(e.target.value)}
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

      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-[#FBFDFC] px-2.5 py-2 text-[13px] text-muted focus-within:border-primary">
          <SearchIcon size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-faint"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-faint hover:text-foreground">
              <XIcon size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        <UpcomingDeadlines />

        {files.length === 0 && (
          <p className="px-2 py-8 text-center text-[13px] leading-relaxed text-faint">
            Sin documentos todavía. Arrastra archivos aquí o suéltalos en{" "}
            <span className="font-semibold text-primary">data/inbox/</span>.
          </p>
        )}
        {files.length > 0 && q && filtered.length === 0 && (
          <p className="px-2 py-8 text-center text-[13px] text-faint">
            Ningún archivo coincide con &ldquo;{query}&rdquo;.
          </p>
        )}

        {grouped.map(([cat, list]) => {
          const catUploading = uploading.filter((u) => u.category === cat);
          const isDropTarget = dropCat === cat;
          // Se abre sola mientras buscas, mientras sube algo, o mientras arrastras
          // algo encima (aunque estuviera cerrada) — y sigue abierta al entrar en
          // su contenido, porque los handlers de drag están en TODO el bloque.
          const isOpen = q || catUploading.length > 0 || isDropTarget || (open[cat] ?? false);

          return (
            <div
              key={cat}
              onDragOver={(e) => {
                const types = e.dataTransfer.types;
                const isRelevant = types.includes(DRAG_MIME) || types.includes("Files");
                if (!isRelevant) return;
                e.preventDefault();
                e.stopPropagation(); // no marcar también el dropzone genérico de abajo
                setDropCat(cat);
              }}
              onDragLeave={(e) => {
                // Solo si de verdad salimos del bloque (no al movernos a un hijo,
                // como al pasar de la cabecera a una fila de archivo ya dentro).
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDropCat((c) => (c === cat ? null : c));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation(); // que no lo suba también el <section> con otra categoría
                setDropCat(null);
                const id = e.dataTransfer.getData(DRAG_MIME);
                if (id) patch(id, { category: cat }); // reclasificar un archivo ya indexado
                else if (e.dataTransfer.files.length) upload(e.dataTransfer.files, cat); // subir desde el Finder, ya categorizado
              }}
              className={`rounded-[9px] transition ${isDropTarget ? "bg-mint-tint ring-2 ring-primary" : ""}`}
            >
              <button
                onClick={() => setOpen((o) => ({ ...o, [cat]: !isOpen }))}
                className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-[13.5px] transition ${
                  isDropTarget ? "font-semibold" : isOpen ? "bg-[#F1F6F3] font-semibold" : ""
                }`}
              >
                <span className="text-primary">
                  <CategoryIcon category={cat} />
                </span>
                <span className="flex-1 text-left">{isDropTarget ? "Suelta aquí" : cat}</span>
                {catUploading.length > 0 && (
                  <SpinnerIcon size={12} className="text-primary" />
                )}
                <span className="text-xs text-faint">{list.length}</span>
                {isOpen ? (
                  <ChevronDownIcon size={14} className="text-primary" />
                ) : (
                  <ChevronRightIcon size={14} className="text-[#B7C4BC]" />
                )}
              </button>

              {isOpen && list.length === 0 && catUploading.length === 0 && (
                <p className="py-2 pl-9 pr-2 text-[12px] text-faint">
                  Vacía — arrastra un archivo aquí para moverlo a esta carpeta.
                </p>
              )}

              {isOpen && (list.length > 0 || catUploading.length > 0) && (
                <div className="flex flex-col gap-0.5 py-1 pl-7 pr-1">
                  {catUploading.map((u) => (
                    <div
                      key={u.key}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-muted"
                    >
                      <SpinnerIcon size={13} className="shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate">{u.name}</span>
                      <span className="shrink-0 text-[11px] font-medium text-primary">Subiendo…</span>
                    </div>
                  ))}
                  {list.map((f) => (
                    <FileRow
                      key={f.id}
                      f={f}
                      onDelete={() => del(f.id)}
                      onReindex={() => reindex(f.id)}
                      onRename={(name) => patch(f.id, { original_name: name })}
                    />
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
            draggingUpload
              ? "border-primary bg-mint-tint text-primary-strong"
              : "border-mint-border text-muted"
          }`}
        >
          Arrastra archivos aquí
          <br />o suéltalos en <span className="font-semibold text-primary">data/inbox/</span>
          <div className="mt-1.5 text-[11px] text-faint">
            Se subirán a: <span className="font-semibold text-primary">{uploadCategory}</span>
          </div>
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
  onRename,
}: {
  f: FileDTO;
  onDelete: () => void;
  onReindex: () => void;
  onRename: (name: string) => void;
}) {
  const busy = BUSY.includes(f.status);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(f.original_name);
  const [dragging, setDragging] = useState(false);

  function commit() {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== f.original_name) onRename(name);
    else setDraft(f.original_name);
  }

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, f.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-foreground/80 hover:bg-[#F7FAF8] ${
        dragging ? "opacity-40" : ""
      }`}
      title="Arrastra a otra carpeta para reclasificar"
    >
      <span className="shrink-0 text-faint">
        <CategoryIcon category={f.category} size={14} />
      </span>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(f.original_name);
              setEditing(false);
            }
          }}
          onClick={(e) => e.preventDefault()}
          className="min-w-0 flex-1 rounded border border-primary bg-white px-1.5 py-0.5 text-[12.5px] outline-none"
        />
      ) : (
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
      )}

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

      {!busy && !editing && (
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            onClick={() => setEditing(true)}
            className="rounded p-1 text-faint hover:text-primary"
            title="Renombrar"
          >
            <EditIcon size={12} />
          </button>
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
