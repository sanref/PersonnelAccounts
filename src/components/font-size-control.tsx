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
        className="md:hidden fixed bottom-19 right-3 z-30 inline-flex items-center rounded-full border border-line bg-surface/95 p-0.5 text-ink shadow-float backdrop-blur-md"
      >
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!canDecrease}
          title="Achicar letra"
          aria-label="Achicar letra"
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-xs font-medium transition-colors hover:bg-muted active:bg-muted-hover disabled:pointer-events-none cursor-pointer"
        >
          A−
        </button>
        <button
          type="button"
          onClick={resetDefault}
          title={`Tamaño actual: ${LABELS[level]} (tocar para restablecer)`}
          aria-label={`Tamaño actual: ${LABELS[level]}`}
          className="px-1.5 min-h-11 inline-flex items-center justify-center text-[0.6875rem] font-medium text-ink-3 select-none cursor-pointer"
        >
          {mounted ? (level === "muy-grande" ? "A++" : level === "grande" ? "A+" : "A") : "A"}
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!canIncrease}
          title="Agrandar letra"
          aria-label="Agrandar letra"
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors hover:bg-muted active:bg-muted-hover disabled:pointer-events-none cursor-pointer"
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
      className="segmented"
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={!canDecrease}
        title="Achicar letra"
        aria-label="Achicar letra"
        className="segmented-item min-h-9 min-w-9 px-2 text-xs hover:bg-surface disabled:pointer-events-none"
      >
        A−
      </button>
      <button
        type="button"
        onClick={resetDefault}
        title={`Tamaño: ${LABELS[level]} (clic para restablecer)`}
        aria-label={`Tamaño actual: ${LABELS[level]}`}
        className="segmented-item min-h-9 bg-surface px-2 text-[0.6875rem] text-ink shadow-xs select-none"
      >
        A
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={!canIncrease}
        title="Agrandar letra"
        aria-label="Agrandar letra"
        className="segmented-item min-h-9 min-w-9 px-2 text-sm hover:bg-surface disabled:pointer-events-none"
      >
        A+
      </button>
    </div>
  );
}
