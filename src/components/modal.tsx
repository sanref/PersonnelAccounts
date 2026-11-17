"use client";

import { useEffect, useRef, type ReactNode } from "react";

// El diálogo nativo retiene el foco, admite Escape y devuelve el foco al disparador.
export function Modal({
  children,
  labelledBy,
  onClose,
  busy = false,
}: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/35"
    >
      {children}
    </dialog>
  );
}
