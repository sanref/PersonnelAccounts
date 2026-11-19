"use client";

import { useState, useEffect, useRef } from "react";
import { formatMoney, formatNumberAR, parseMoneyInput } from "@/lib/format";

/**
 * Toggle Switch accesible estilo iOS / moderno
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
  activeColor = "indigo",
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  activeColor?: "emerald" | "indigo" | "slate";
  ariaLabel?: string;
}) {
  // CUI: el switch encendido usa el acento; "emerald" se mantiene para estados de éxito.
  const bgActive =
    activeColor === "emerald"
      ? "bg-success"
      : activeColor === "slate"
        ? "bg-ink"
        : "bg-accent";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 min-h-11 rounded-control py-1.5 select-none ${
        disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-180 ${
          checked ? bgActive : "bg-line-strong/60"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform duration-180 ease-(--ease-spring) ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </span>
      {label && (
        <span className="text-sm text-ink-2">{label}</span>
      )}
    </button>
  );
}

/**
 * Input de dinero amigable para formularios (muestra prefijo $ / US$ y formatea al salir del foco como 236.254,56)
 */
export function MoneyInput({
  value,
  onChange,
  currency = "ARS",
  placeholder = "0,00",
  required,
  autoFocus,
  className = "",
  id,
  disabled,
}: {
  value: string;
  onChange: (raw: string) => void;
  currency?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const prefix = currency === "USD" ? "US$" : "$";

  const parsed = parseMoneyInput(value);
  const displayValue = focused
    ? value
    : parsed !== null
      ? formatNumberAR(parsed, 2)
      : value;

  return (
    <div className={`relative flex items-center ${className}`}>
      <span className="absolute left-3 text-xs font-medium text-ink-3 pointer-events-none select-none">
        {prefix}
      </span>
      <input
        id={id}
        disabled={disabled}
        type="text"
        inputMode="decimal"
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={displayValue}
        onFocus={() => {
          setFocused(true);
          if (parsed !== null) {
            // Mostrar con coma decimal sin puntos para editar rápido o mantener legible
            onChange(String(parsed).replace(".", ","));
          }
        }}
        onBlur={() => {
          setFocused(false);
          if (parsed !== null) {
            onChange(formatNumberAR(parsed, 2));
          }
        }}
        onChange={(e) => onChange(e.target.value)}
        className="field pl-10 font-medium tabular-nums"
      />
    </div>
  );
}

/**
 * Celda editable en línea para grillas: cuando no está en foco muestra "$ 236.254,56" bien formateado;
 * al hacer clic abre edición rápida y guarda con Enter o al salir.
 */
export function InlineMoneyCell({
  amount,
  currency = "ARS",
  onSave,
  disabled,
  label = "Importe",
}: {
  amount: string | number | null;
  currency?: string;
  onSave: (nextAmount: number | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEdit() {
    committed.current = false;
    const current =
      amount !== null && amount !== undefined && amount !== ""
        ? Number(amount)
        : null;
    setDraft(
      current !== null && Number.isFinite(current)
        ? String(current).replace(".", ",")
        : "",
    );
    setEditing(true);
  }

  function commit() {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    const trimmed = draft.trim();
    const nextNum = trimmed === "" ? null : parseMoneyInput(trimmed);
    const prevNum =
      amount !== null && amount !== undefined && amount !== ""
        ? Number(amount)
        : null;

    if (nextNum === prevNum) return;
    onSave(nextNum);
  }

  if (editing) {
    return (
      <div className="inline-flex items-center justify-end">
        <div className="relative w-36">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-3">
            {currency === "USD" ? "US$" : "$"}
          </span>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            aria-label={label}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                committed.current = true;
                setEditing(false);
              }
            }}
            placeholder="0,00"
            className="w-full min-h-10 pl-8 pr-2.5 py-1 text-right rounded-control border border-accent bg-surface text-sm font-medium tabular-nums text-ink focus:outline-none ring-3 ring-accent/20"
          />
        </div>
      </div>
    );
  }

  const hasAmount = amount !== null && amount !== undefined && amount !== "";

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${label}: ${hasAmount ? formatMoney(amount, currency) : "sin importe"}. Editar`}
      onClick={startEdit}
      title="Clic para editar importe"
      className={`min-h-11 px-2.5 py-1 rounded-control text-right tabular-nums transition cursor-pointer ${
        hasAmount
          ? "font-medium text-ink hover:bg-surface border border-transparent hover:border-line-strong/60"
          : "text-xs font-medium text-accent-ink hover:bg-accent-soft border border-dashed border-accent-line hover:border-accent"
      }`}
    >
      {hasAmount ? formatMoney(amount, currency) : "+ Cargar monto"}
    </button>
  );
}
