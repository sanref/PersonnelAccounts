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
  activeColor = "emerald",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  activeColor?: "emerald" | "indigo" | "slate";
}) {
  const bgActive =
    activeColor === "indigo"
      ? "bg-indigo-600"
      : activeColor === "slate"
      ? "bg-slate-900"
      : "bg-emerald-600";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 select-none ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked ? bgActive : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform duration-200 ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </span>
      {label && (
        <span className="text-xs font-medium text-slate-700">{label}</span>
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
}: {
  value: string;
  onChange: (raw: string) => void;
  currency?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
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
      <span className="absolute left-3 text-xs font-semibold text-slate-400 pointer-events-none select-none">
        {prefix}
      </span>
      <input
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
        className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
}: {
  amount: string | number | null;
  currency?: string;
  onSave: (nextAmount: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEdit() {
    const current = amount !== null && amount !== undefined && amount !== "" ? Number(amount) : null;
    setDraft(current !== null && Number.isFinite(current) ? String(current).replace(".", ",") : "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const nextNum = trimmed === "" ? null : parseMoneyInput(trimmed);
    const prevNum =
      amount !== null && amount !== undefined && amount !== "" ? Number(amount) : null;

    if (nextNum === prevNum) return;
    onSave(nextNum);
  }

  if (editing) {
    return (
      <div className="inline-flex items-center justify-end">
        <div className="relative w-36">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
            {currency === "USD" ? "US$" : "$"}
          </span>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            placeholder="0,00"
            className="w-full pl-8 pr-2.5 py-1 text-right rounded-lg border border-slate-900 bg-white text-sm font-semibold tabular-nums text-slate-900 focus:outline-none ring-2 ring-slate-900/10"
          />
        </div>
      </div>
    );
  }

  const hasAmount = amount !== null && amount !== undefined && amount !== "";

  return (
    <button
      type="button"
      onClick={startEdit}
      title="Clic para editar importe"
      className={`px-2.5 py-1 rounded-lg text-right tabular-nums transition cursor-pointer ${
        hasAmount
          ? "font-semibold text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200"
          : "text-xs text-slate-400 hover:text-slate-700 border border-dashed border-slate-300 hover:border-slate-400"
      }`}
    >
      {hasAmount ? formatMoney(amount, currency) : "+ Cargar monto"}
    </button>
  );
}
