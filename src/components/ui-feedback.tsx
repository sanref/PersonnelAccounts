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
      <span className="flex size-12 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-accent">
        <Inbox className="size-5" aria-hidden="true" />
      </span>
      <div className="max-w-sm space-y-1">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        <p className="text-sm text-ink-2">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Aviso inline (CUI alert): éxito o error, con reintento y cierre opcionales. */
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
      className={`alert cui-pop ${error ? "alert-danger" : "alert-success"}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-ink">{message}</p>
        {onRetry && (
          <button
            type="button"
            disabled={busy}
            onClick={onRetry}
            className="btn-secondary min-h-9 px-3"
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
          title="Cerrar aviso"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
