"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { verifyFamilyPinAction } from "@/app/actions";
import { FontSizeControl } from "@/components/font-size-control";
import { Avatar } from "@/components/cui";

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
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form
        onSubmit={handleSubmit}
        className="panel cui-pop w-full max-w-sm space-y-5 p-6"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={personName} size="lg" />
            <div className="min-w-0">
              <h1 className="font-display text-lg font-medium text-ink">
                Cuenta de {personName}
              </h1>
              <p className="flex items-center gap-1.5 text-xs text-ink-3">
                <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                Ingresá tu contraseña para ver el resumen
              </p>
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
          aria-label="Contraseña"
          className="field text-center text-base"
        />

        {error && (
          <p role="alert" className="alert alert-danger justify-center py-2.5 text-xs">
            {error}
          </p>
        )}

        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {isPending ? "Verificando..." : "Ver resumen"}
        </button>
      </form>
    </div>
  );
}
