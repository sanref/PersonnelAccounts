"use client";

import { useActionState, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Lock, User, Wallet } from "lucide-react";
import { loginAdminAction } from "@/app/actions";
import { FontSizeControl } from "@/components/font-size-control";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [mode, setMode] = useState<"admin" | "family">("admin");
  const [state, formAction, pending] = useActionState(loginAdminAction, null);

  return (
    <div className="space-y-5">
      {/* Selector Admin vs Familiar */}
      <div className="segmented grid w-full grid-cols-2">
        <button
          type="button"
          aria-pressed={mode === "admin"}
          disabled={pending}
          onClick={() => setMode("admin")}
          className="segmented-item"
        >
          Administrador
        </button>
        <button
          type="button"
          aria-pressed={mode === "family"}
          disabled={pending}
          onClick={() => setMode("family")}
          className="segmented-item"
        >
          Acceso Familiar
        </button>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value={mode} />

        {mode === "family" && (
          <div>
            <label
              htmlFor="login-name"
              className="field-label"
            >
              Tu nombre
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <input
                id="login-name"
                autoComplete="username"
                type="text"
                name="username"
                required
                autoFocus
                placeholder="Ej: Mamá, Mer, Cami, Lou..."
                className="field pl-10"
              />
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor="login-password"
            className="field-label"
          >
            {mode === "admin" ? "Clave de administrador" : "Contraseña"}
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              id="login-password"
              autoComplete="current-password"
              type="password"
              name="password"
              required
              autoFocus={mode === "admin"}
              placeholder="Ingresá tu contraseña..."
              className="field pl-10"
            />
          </div>
        </div>

        {state?.error && (
          <div role="alert" className="alert alert-danger cui-pop">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="text-ink">{state.error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full"
        >
          {pending
            ? "Ingresando..."
            : mode === "admin"
              ? "Entrar como administrador"
              : "Ver mi resumen"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 bg-canvas p-4">
      <div className="panel w-full max-w-md p-6 sm:p-8">
        <div className="flex flex-col gap-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-white shadow-rim">
              <Wallet className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-lg font-medium tracking-tight text-ink">
                MultiCuentas
              </h1>
              <p className="text-xs text-ink-3">
                Administración personal y familiar
              </p>
            </div>
          </div>
          <div>
            <h2 className="page-title">Todo en su cuenta.</h2>
            <p className="mt-2 text-sm text-ink-2">
              Ingresá para administrar tus pagos o consultar tu resumen
              familiar.
            </p>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="h-32 animate-pulse rounded-panel bg-muted" />
          }
        >
          <LoginForm />
        </Suspense>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <p className="text-xs text-ink-3">Tamaño de letra</p>
        <FontSizeControl variant="inline" />
      </div>
    </div>
  );
}
