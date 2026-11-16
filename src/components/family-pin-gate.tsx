"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { verifyFamilyPinAction } from "@/app/actions";
import { FontSizeControl } from "@/components/font-size-control";

export function FamilyPinGate({
  personName,
  shareToken,
}: {
  personName: string;
  shareToken: string;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await verifyFamilyPinAction(shareToken, pin);
      if (!res.ok) {
        setError(res.error ?? "PIN incorrecto");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 p-6 max-w-sm w-full space-y-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900">Cuenta de {personName}</h1>
              <p className="text-xs text-slate-500">Ingresá tu contraseña para ver el resumen</p>
            </div>
          </div>
          <FontSizeControl variant="inline" />
        </div>

        <input
          type="password"
          required
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Contraseña..."
          className="w-full min-h-11 px-3.5 py-2.5 rounded-xl border border-slate-300 text-center text-base"
        />

        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg text-center">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full min-h-11 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 cursor-pointer"
        >
          {isPending ? "Verificando..." : "Ver resumen"}
        </button>
      </form>
    </div>
  );
}
