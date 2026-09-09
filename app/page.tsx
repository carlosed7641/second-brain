export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-10">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-tint text-primary">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.5V15a3 3 0 0 0 4 2.8A3 3 0 0 0 12 19V5a2 2 0 0 0-2-2Z" />
            <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.5V15a3 3 0 0 1-4 2.8A3 3 0 0 1 12 19" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-primary-ink">Second Brain</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Fase 1 lista: scaffold de Next.js, base de datos SQLite + sqlite-vec y
          configuración. La ingesta de archivos y el chat llegan en las siguientes fases.
        </p>
      </div>
    </main>
  );
}
