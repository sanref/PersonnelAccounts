export default function AdminLoading() {
  return (
    <div role="status" aria-label="Cargando contenido" className="space-y-8">
      <span className="sr-only">Cargando contenido…</span>
      <div aria-hidden="true" className="space-y-3">
        <div className="h-3 w-40 rounded bg-slate-200" />
        <div className="h-8 w-60 rounded-lg bg-slate-200" />
        <div className="h-4 w-3/4 max-w-sm rounded bg-slate-100" />
      </div>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="panel space-y-4 p-6">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-8 w-3/4 rounded-lg bg-slate-200" />
            <div className="h-3 w-32 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="panel divide-y divide-slate-100">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex justify-between gap-6 p-6">
            <div className="h-4 w-2/5 rounded bg-slate-100" />
            <div className="h-4 w-24 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
