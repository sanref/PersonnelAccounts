"use client";

import { useActionState, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, User, Wallet } from "lucide-react";
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
      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
        <button
          type="button"
          aria-pressed={mode === "admin"}
          disabled={pending}
          onClick={() => setMode("admin")}
          className={`min-h-10 py-2 rounded-lg transition cursor-pointer ${
            mode === "admin"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Administrador
        </button>
        <button
          type="button"
          aria-pressed={mode === "family"}
          disabled={pending}
          onClick={() => setMode("family")}
          className={`min-h-10 py-2 rounded-lg transition cursor-pointer ${
            mode === "family"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
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
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Tu Nombre
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-name"
                autoComplete="username"
                type="text"
                name="username"
                required
                autoFocus
                placeholder="Ej: Mamá, Mer, Cami, Lou..."
                className="w-full min-h-11 pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor="login-password"
            className="block text-sm font-medium text-slate-700 mb-1.5"
          >
            {mode === "admin" ? "Clave de Administrador" : "Contraseña"}
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="login-password"
              autoComplete="current-password"
              type="password"
              name="password"
              required
              autoFocus={mode === "admin"}
              placeholder="Ingresá tu contraseña..."
              className="w-full min-h-11 pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {state?.error && (
          <p
            role="alert"
            className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
          >
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
        >
          {pending
            ? "Ingresando..."
            : mode === "admin"
              ? "Entrar como Admin"
              : "Ver mi resumen"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
        <div className="flex flex-col gap-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                MultiCuentas
              </h1>
              <p className="text-xs text-slate-500">
                Administración personal y familiar
              </p>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Todo en su cuenta.
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Ingresá para administrar tus pagos o consultar tu resumen
              familiar.
            </p>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="h-32 animate-pulse bg-slate-100 rounded-xl" />
          }
        >
          <LoginForm />
        </Suspense>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <p className="text-xs text-slate-500">Tamaño de letra</p>
        <FontSizeControl variant="inline" />
      </div>
    </div>
  );
}
