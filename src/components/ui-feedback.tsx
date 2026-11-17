import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Inbox, X } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
        <Inbox className="size-5" aria-hidden="true" />
      </span>
      <div className="max-w-sm space-y-1">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function FeedbackBanner({
  message,
  error = false,
  onDismiss,
  onRetry,
  busy,
}: {
  message: string;
  error?: boolean;
  onDismiss?: () => void;
  onRetry?: () => void;
  busy?: boolean;
}) {
  const Icon = error ? AlertCircle : CheckCircle2;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
        error
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <p>{message}</p>
        {onRetry && (
          <button
            type="button"
            disabled={busy}
            onClick={onRetry}
            className="min-h-11 rounded-lg px-2 font-medium underline underline-offset-4"
          >
            Reintentar
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="icon-button -my-2 -mr-2"
          aria-label="Cerrar aviso"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
