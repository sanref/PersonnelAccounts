export default function AdminLoading() {
  return (
    <div
      role="status"
      aria-label="Cargando contenido"
      className="animate-pulse space-y-8"
    >
      <span className="sr-only">Cargando contenido…</span>

      <div
        aria-hidden="true"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <div className="space-y-2">
          <div className="h-8 w-56 rounded-control bg-muted" />
          <div className="h-4 w-44 rounded-lg bg-muted/70" />
        </div>
        <div className="h-11 w-44 rounded-control bg-accent-soft" />
      </div>

      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="panel space-y-4 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="size-4 rounded-full bg-muted" />
              <div className="h-3.5 w-28 rounded-lg bg-muted" />
            </div>
            <div className="h-8 w-3/4 rounded-control bg-muted" />
            <div className="h-1.5 w-full rounded-full bg-subtle" />
          </div>
        ))}
      </div>

      <div aria-hidden="true" className="space-y-4">
        <div className="h-5 w-48 rounded-lg bg-muted" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="panel overflow-hidden">
              <div className="flex items-center gap-3 p-4 sm:p-5">
                <div className="size-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 rounded-lg bg-muted" />
                  <div className="h-3 w-1/3 rounded-lg bg-muted/70" />
                </div>
              </div>
              <div className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="h-3 w-24 rounded-lg bg-muted/70" />
                <div className="h-8 w-2/3 rounded-control bg-muted" />
              </div>
              <div className="h-10 border-t border-line bg-subtle" />
            </div>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="panel overflow-hidden">
        <div className="h-16 border-b border-line bg-subtle" />
        <div className="divide-y divide-line">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="size-8 shrink-0 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/5 rounded-lg bg-muted" />
                <div className="h-3 w-1/4 rounded-lg bg-muted/70" />
              </div>
              <div className="h-4 w-24 rounded-lg bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
