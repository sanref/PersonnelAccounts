"use client";

import { useEffect, useState } from "react";

export type FontSizeLevel = "normal" | "grande" | "muy-grande";

const STORAGE_KEY = "mc_font_size";
const SYNC_EVENT = "mc-font-size-change";

const LEVELS: FontSizeLevel[] = ["normal", "grande", "muy-grande"];

const LABELS: Record<FontSizeLevel, string> = {
  normal: "Normal",
  grande: "Grande",
  "muy-grande": "Muy grande",
};

function getDefaultLevel(): FontSizeLevel {
  if (typeof window === "undefined") return "normal";
  return window.matchMedia("(max-width: 639px)").matches ? "grande" : "normal";
}

function readCurrentLevel(): FontSizeLevel {
  if (typeof window === "undefined") return "normal";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "normal" || saved === "grande" || saved === "muy-grande") {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  const attr = document.documentElement.getAttribute("data-font");
  if (attr === "normal" || attr === "grande" || attr === "muy-grande") {
    return attr;
  }
  return getDefaultLevel();
}

function applyLevel(next: FontSizeLevel) {
  document.documentElement.setAttribute("data-font", next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export function FontSizeControl({
  variant = "inline",
}: {
  variant?: "inline" | "floating";
}) {
  const [level, setLevel] = useState<FontSizeLevel>("normal");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLevel(readCurrentLevel());
    setMounted(true);

    const sync = () => setLevel(readCurrentLevel());
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const idx = LEVELS.indexOf(level);
  const canDecrease = mounted && idx > 0;
  const canIncrease = mounted && idx < LEVELS.length - 1;

  function step(delta: -1 | 1) {
    const nextIdx = Math.min(LEVELS.length - 1, Math.max(0, idx + delta));
    const next = LEVELS[nextIdx];
    setLevel(next);
    applyLevel(next);
  }

  function resetDefault() {
    const def = getDefaultLevel();
    setLevel(def);
    applyLevel(def);
  }

  if (variant === "floating") {
    return (
      <div
        role="group"
        aria-label="Tamaño de letra"
        className="md:hidden fixed bottom-19 right-3 z-30 inline-flex items-center bg-white/95 backdrop-blur border border-slate-300 shadow-md rounded-full p-0.5 text-slate-800"
      >
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!canDecrease}
          title="Achicar letra"
          aria-label="Achicar letra"
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-xs font-bold hover:bg-slate-100 active:bg-slate-200 disabled:opacity-35 disabled:pointer-events-none transition cursor-pointer"
        >
          A−
        </button>
        <button
          type="button"
          onClick={resetDefault}
          title={`Tamaño actual: ${LABELS[level]} (tocar para restablecer)`}
          aria-label={`Tamaño actual: ${LABELS[level]}`}
          className="px-1.5 min-h-11 inline-flex items-center justify-center text-[0.6875rem] font-semibold text-slate-500 select-none cursor-pointer"
        >
          {mounted ? (level === "muy-grande" ? "A++" : level === "grande" ? "A+" : "A") : "A"}
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!canIncrease}
          title="Agrandar letra"
          aria-label="Agrandar letra"
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-sm font-bold hover:bg-slate-100 active:bg-slate-200 disabled:opacity-35 disabled:pointer-events-none transition cursor-pointer"
        >
          A+
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Tamaño de letra"
      title={`Tamaño de letra: ${LABELS[level]}`}
      className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-slate-700"
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={!canDecrease}
        title="Achicar letra"
        aria-label="Achicar letra"
        className="min-h-9 min-w-8 px-2 inline-flex items-center justify-center rounded-md text-xs font-bold hover:bg-white hover:text-slate-900 disabled:opacity-35 disabled:pointer-events-none transition cursor-pointer"
      >
        A−
      </button>
      <button
        type="button"
        onClick={resetDefault}
        title={`Tamaño: ${LABELS[level]} (clic para restablecer)`}
        aria-label={`Tamaño actual: ${LABELS[level]}`}
        className="min-h-9 px-1.5 inline-flex items-center justify-center text-[0.6875rem] font-semibold text-slate-500 hover:text-slate-900 select-none cursor-pointer"
      >
        A
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={!canIncrease}
        title="Agrandar letra"
        aria-label="Agrandar letra"
        className="min-h-9 min-w-8 px-2 inline-flex items-center justify-center rounded-md text-sm font-bold hover:bg-white hover:text-slate-900 disabled:opacity-35 disabled:pointer-events-none transition cursor-pointer"
      >
        A+
      </button>
    </div>
  );
}
