"use client";

import useSWR from "swr";
import { fetcher } from "./lib";

/**
 * "data/inbox/" clicable: abre la carpeta inbox en el explorador de archivos.
 * El tooltip muestra la ruta real (en la app de escritorio está en %APPDATA%).
 */
export default function InboxLink() {
  const { data } = useSWR<{ path: string }>("/api/inbox", fetcher);

  async function open(e: React.MouseEvent) {
    // Puede estar dentro de zonas clicables (p. ej. la de subir archivos).
    e.preventDefault();
    e.stopPropagation();
    await fetch("/api/inbox", { method: "POST" });
  }

  return (
    <button
      type="button"
      onClick={open}
      title={data ? `Abrir ${data.path}` : "Abrir la carpeta inbox"}
      className="inline font-semibold text-primary underline-offset-2 hover:underline"
    >
      data/inbox/
    </button>
  );
}
