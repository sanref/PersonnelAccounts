"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ArrowLeftRight,
  ArrowUpDown,
  Share2,
  Trash2,
  Pencil,
  Copy,
  Check,
  FilterX,
  RefreshCw,
  X,
} from "lucide-react";
import type { AccountSummary, LedgerRow } from "@/lib/queries";
import {
  createTransactionAction,
  updateTransactionAction,
  deleteTransactionAction,
  updateShareSettingsAction,
  createAccountAction,
} from "@/app/actions";
import {
  formatDateAR,
  formatMoney,
  formatNumberAR,
  formatPeriodLabel,
  parseMoneyInput,
  todayISO,
} from "@/lib/format";
import { MoneyInput, ToggleSwitch } from "@/components/ui-controls";
import { Modal } from "@/components/modal";

interface MonthlySummaryGroup {
  period: string;
  total: number;
  settledTotal: number;
  unsettledTotal: number;
  items: Array<{
    id: number;
    concept: string;
    kind: string;
    amount: string | null;
    status: string;
    settledTransactionId: number | null;
  }>;
}

export interface PersonDetailProps {
  person: {
    id: number;
    name: string;
    slug: string;
    defaultCurrency: string;
    isOwn: boolean;
    hasManagedAccount: boolean;
    shareToken: string | null;
    sharePin: string | null;
    shareEnabled: boolean;
    notes: string | null;
  };
  totalBalance: number;
  accounts: AccountSummary[];
  combinedLedger: LedgerRow[];
  ledgerByAccount: Record<number, LedgerRow[]>;
  monthlySummaries: MonthlySummaryGroup[];
}

type LedgerSortField = "date" | "concept" | "amount";

export function PersonLedgerClient({ detail }: { detail: PersonDetailProps }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { person, accounts } = detail;
  const [selectedAccountId, setSelectedAccountId] = useState<number | "ALL">(
    "ALL",
  );
  const [activeTab, setActiveTab] = useState<"movimientos" | "resumenes">(
    "movimientos",
  );

  // Filtros por columna en la Grilla de Movimientos
  const [colPeriod, setColPeriod] = useState(""); // ej: "2026-10" o "2026"
  const [colConcept, setColConcept] = useState("");
  const [colAccountFilter, setColAccountFilter] = useState<number | "ALL">(
    "ALL",
  );
  const [colTypeFilter, setColTypeFilter] = useState<
    "ALL" | "IN_ONLY" | "OUT_ONLY" | "YIELD" | "TRANSFER"
  >("ALL");
  const [sortField, setSortField] = useState<LedgerSortField>("date");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  // Modal Nuevo / Editar Movimiento
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<LedgerRow | null>(null);
  const [txType, setTxType] = useState<"IN" | "OUT" | "YIELD" | "TRANSFER">(
    "OUT",
  );
  const [txAccountId, setTxAccountId] = useState<number>(accounts[0]?.id ?? 0);
  const [txToAccountId, setTxToAccountId] = useState<number>(
    accounts[1]?.id ?? accounts[0]?.id ?? 0,
  );
  const [txDate, setTxDate] = useState<string>(todayISO());
  const [txAmount, setTxAmount] = useState<string>("");
  const [txConcept, setTxConcept] = useState<string>("");
  const [txNotes, setTxNotes] = useState<string>("");
  const [txRefAmount, setTxRefAmount] = useState<string>("");
  const [txRefCurrency, setTxRefCurrency] = useState<string>(
    person.defaultCurrency === "USD" ? "ARS" : "USD",
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Modal Compartir Familiar
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEnabled, setShareEnabled] = useState(person.shareEnabled);
  const [sharePin, setSharePin] = useState(person.sharePin ?? "");
  const [copied, setCopied] = useState(false);

  // Modal Nueva Subcuenta
  const [newAccOpen, setNewAccOpen] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccBalance, setNewAccBalance] = useState("0,00");

  const activeRows =
    selectedAccountId === "ALL"
      ? detail.combinedLedger
      : (detail.ledgerByAccount[selectedAccountId] ?? []);

  // Opciones de año-mes presentes para filtrar rápido por columna Fecha
  const availableYearMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of activeRows) {
      if (!r.dateUnknown && r.date) {
        set.add(r.date.slice(0, 7));
      }
    }
    return Array.from(set).sort().reverse();
  }, [activeRows]);

  function toggleSort(field: LedgerSortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const hasColumnFilters =
    colPeriod !== "" ||
    colConcept.trim() !== "" ||
    colAccountFilter !== "ALL" ||
    colTypeFilter !== "ALL";

  function clearFilters() {
    setColPeriod("");
    setColConcept("");
    setColAccountFilter("ALL");
    setColTypeFilter("ALL");
  }

  const filteredRows = useMemo(() => {
    const q = colConcept.trim().toLowerCase();
    const list = activeRows.filter((r) => {
      if (colPeriod) {
        if (colPeriod === "SIN_FECHA") {
          if (!r.dateUnknown) return false;
        } else if (r.dateUnknown || !r.date.startsWith(colPeriod)) {
          return false;
        }
      }
      if (colAccountFilter !== "ALL" && r.accountId !== colAccountFilter)
        return false;
      if (q) {
        const hay = `${r.concept} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (colTypeFilter === "IN_ONLY" && r.signedAmount <= 0) return false;
      if (colTypeFilter === "OUT_ONLY" && r.signedAmount >= 0) return false;
      if (colTypeFilter === "YIELD" && r.type !== "YIELD") return false;
      if (
        colTypeFilter === "TRANSFER" &&
        r.type !== "TRANSFER_IN" &&
        r.type !== "TRANSFER_OUT"
      ) {
        return false;
      }
      return true;
    });

    if (sortField === "date" && sortDir === "desc") {
      return list; // orden original más reciente arriba
    }
    if (sortField === "date" && sortDir === "asc") {
      return [...list].reverse();
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "concept") {
        cmp = a.concept.localeCompare(b.concept, "es");
      } else if (sortField === "amount") {
        cmp = a.amount - b.amount;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [
    activeRows,
    colPeriod,
    colAccountFilter,
    colConcept,
    colTypeFilter,
    sortField,
    sortDir,
  ]);

  const filteredTotals = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const r of filteredRows) {
      if (r.signedAmount > 0) totalIn += r.amount;
      else totalOut += r.amount;
    }
    return { totalIn, totalOut };
  }, [filteredRows]);

  function openNewTx(defaultType: "IN" | "OUT" | "TRANSFER") {
    setEditingTx(null);
    setTxType(defaultType);
    setTxAccountId(
      selectedAccountId !== "ALL" ? selectedAccountId : (accounts[0]?.id ?? 0),
    );
    const otherAcc = accounts.find(
      (a) =>
        a.id !==
        (selectedAccountId !== "ALL" ? selectedAccountId : accounts[0]?.id),
    );
    setTxToAccountId(otherAcc?.id ?? accounts[0]?.id ?? 0);
    setTxDate(todayISO());
    setTxAmount("");
    setTxConcept("");
    setTxNotes("");
    setTxRefAmount("");
    setTxRefCurrency(person.defaultCurrency === "USD" ? "ARS" : "USD");
    setFormError(null);
    setTxModalOpen(true);
  }

  function openEditTx(row: LedgerRow) {
    if (row.type === "TRANSFER_IN" || row.type === "TRANSFER_OUT") return;
    setEditingTx(row);
    setTxType(row.type as "IN" | "OUT" | "YIELD");
    setTxAccountId(row.accountId);
    setTxDate(row.date);
    setTxAmount(formatNumberAR(row.amount, 2));
    setTxConcept(row.concept);
    setTxNotes(row.notes ?? "");
    setTxRefAmount(row.refAmount ? formatNumberAR(row.refAmount, 2) : "");
    setTxRefCurrency(
      row.refCurrency ?? (person.defaultCurrency === "USD" ? "ARS" : "USD"),
    );
    setFormError(null);
    setTxModalOpen(true);
  }

  function handleSaveTx(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsedAmt = parseMoneyInput(txAmount);
    if (parsedAmt === null || parsedAmt <= 0) {
      setFormError("Ingresá un monto válido mayor a 0");
      return;
    }
    const parsedRef = txRefAmount.trim() ? parseMoneyInput(txRefAmount) : null;

    startTransition(async () => {
      try {
        if (editingTx) {
          await updateTransactionAction({
            id: editingTx.id,
            accountId: txAccountId,
            date: txDate,
            type: txType as "IN" | "OUT" | "YIELD",
            amount: parsedAmt,
            concept: txConcept,
            notes: txNotes,
            refAmount: parsedRef,
            refCurrency: txRefCurrency,
          });
        } else {
          await createTransactionAction({
            accountId: txAccountId,
            toAccountId: txType === "TRANSFER" ? txToAccountId : undefined,
            date: txDate,
            type: txType,
            amount: parsedAmt,
            concept: txConcept,
            notes: txNotes,
            refAmount: parsedRef,
            refCurrency: txRefCurrency,
          });
        }
        setTxModalOpen(false);
        router.refresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  function handleDeleteTx(row: LedgerRow) {
    const msg = row.transferGroupId
      ? "¿Eliminar esta transferencia (ambas cuentas)?"
      : `¿Eliminar "${row.concept}" por ${formatMoney(row.amount, row.currency)}?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      await deleteTransactionAction(row.id);
      router.refresh();
    });
  }

  function handleSaveShare(regenerate = false) {
    startTransition(async () => {
      await updateShareSettingsAction({
        personId: person.id,
        shareEnabled,
        sharePin,
        regenerateToken: regenerate,
      });
      router.refresh();
    });
  }

  function handleCreateSubaccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccName.trim()) return;
    startTransition(async () => {
      await createAccountAction({
        personId: person.id,
        name: newAccName,
        currency: person.defaultCurrency as "ARS" | "USD",
        initialBalance: parseMoneyInput(newAccBalance) ?? 0,
      });
      setNewAccName("");
      setNewAccBalance("0,00");
      setNewAccOpen(false);
      router.refresh();
    });
  }

  const shareUrl =
    typeof window !== "undefined" && person.shareToken
      ? `${window.location.origin}/v/${person.shareToken}`
      : person.shareToken
        ? `/v/${person.shareToken}`
        : "";

  const isNegative = detail.totalBalance < -0.004;

  return (
    <div className="space-y-6">
      {/* Cabecera de Persona + Saldo Principal */}
      <div className="panel p-4 sm:p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="page-title">{person.name}</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {person.defaultCurrency}
            </span>
          </div>
          <p className="mt-4 text-xs text-slate-500">Saldo disponible</p>
          <p
            className={`break-words text-3xl font-semibold tracking-tight mt-1 tabular-nums ${
              isNegative ? "text-rose-600" : "text-slate-900"
            }`}
          >
            {formatMoney(detail.totalBalance, person.defaultCurrency)}
          </p>
          {isNegative && (
            <p className="text-xs font-medium text-rose-600 mt-1">
              Saldo negativo: {person.name} te debe este importe
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openNewTx("IN")}
            disabled={accounts.length === 0 || isPending}
            className="btn-secondary"
          >
            <Plus className="w-4 h-4" />
            Ingreso
          </button>
          <button
            type="button"
            onClick={() => openNewTx("OUT")}
            disabled={accounts.length === 0 || isPending}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            Gasto / Pago
          </button>
          {accounts.length > 1 && (
            <button
              type="button"
              onClick={() => openNewTx("TRANSFER")}
              className="btn-secondary"
            >
              <ArrowLeftRight className="w-4 h-4" />
              Transferir
            </button>
          )}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="btn-ghost"
          >
            <Share2 className="w-4 h-4" />
            Compartir
          </button>
        </div>
      </div>

      {/* Selector de Subcuentas */}
      <div className="flex flex-wrap items-center gap-2 tabular-nums">
        {accounts.length > 1 && (
          <button
            type="button"
            onClick={() => setSelectedAccountId("ALL")}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium border transition cursor-pointer ${
              selectedAccountId === "ALL"
                ? "bg-slate-100 text-slate-900 border-slate-300"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
            }`}
          >
            Todas ({formatMoney(detail.totalBalance, person.defaultCurrency)})
          </button>
        )}
        {accounts.map((acc) => {
          const active =
            selectedAccountId === acc.id ||
            (accounts.length === 1 && selectedAccountId === "ALL");
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() =>
                setSelectedAccountId(accounts.length === 1 ? "ALL" : acc.id)
              }
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium border transition cursor-pointer ${
                active
                  ? "bg-slate-100 text-slate-900 border-slate-300"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
              }`}
            >
              {acc.name}:{" "}
              <span className="font-bold">
                {formatMoney(acc.balance, acc.currency)}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setNewAccOpen(true)}
          className="px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-white border border-dashed border-slate-300 transition cursor-pointer"
        >
          + Subcuenta
        </button>
      </div>

      {/* Pestañas si también tiene Resúmenes Mensuales */}
      {detail.monthlySummaries.length > 0 && (
        <div className="flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("movimientos")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition cursor-pointer ${
              activeTab === "movimientos"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Movimientos ({activeRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("resumenes")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition cursor-pointer ${
              activeTab === "resumenes"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Resúmenes de Servicios ({detail.monthlySummaries.length})
          </button>
        </div>
      )}

      {activeTab === "movimientos" ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Barra resumen dinámica de las filas filtradas */}
          <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-3 tabular-nums">
              <span>
                Mostrando <strong>{filteredRows.length}</strong> de{" "}
                {activeRows.length}
              </span>
              <span className="hidden sm:inline">·</span>
              <span>
                Entradas:{" "}
                <strong className="text-emerald-700">
                  {formatMoney(filteredTotals.totalIn, person.defaultCurrency)}
                </strong>
              </span>
              <span className="hidden sm:inline">·</span>
              <span>
                Salidas:{" "}
                <strong className="text-rose-600">
                  {formatMoney(filteredTotals.totalOut, person.defaultCurrency)}
                </strong>
              </span>
            </div>

            {hasColumnFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
              >
                <FilterX className="w-3.5 h-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="md:hidden">
            <div className="space-y-3 border-b border-slate-100 p-4">
              <label className="field-label">
                Buscar movimiento
                <input
                  type="search"
                  value={colConcept}
                  onChange={(e) => setColConcept(e.target.value)}
                  placeholder="Buscar concepto o nota…"
                  className="field mt-1"
                />
              </label>
              <details>
                <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-xs font-medium text-slate-600">
                  Filtrar movimientos
                </summary>
                <div className="grid gap-3 pt-2">
                  <label className="field-label">
                    Período
                    <select
                      value={colPeriod}
                      onChange={(e) => setColPeriod(e.target.value)}
                      className="field mt-1"
                    >
                      <option value="">Todos los períodos</option>
                      {availableYearMonths.map((month) => (
                        <option key={month} value={month}>
                          {formatPeriodLabel(month)}
                        </option>
                      ))}
                      <option value="SIN_FECHA">Sin fecha</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Tipo
                    <select
                      value={colTypeFilter}
                      onChange={(e) =>
                        setColTypeFilter(e.target.value as typeof colTypeFilter)
                      }
                      className="field mt-1"
                    >
                      <option value="ALL">Todos</option>
                      <option value="IN_ONLY">Entradas</option>
                      <option value="OUT_ONLY">Salidas</option>
                      <option value="YIELD">Rendimientos</option>
                      <option value="TRANSFER">Transferencias</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Cuenta
                    <select
                      value={colAccountFilter}
                      onChange={(e) =>
                        setColAccountFilter(
                          e.target.value === "ALL"
                            ? "ALL"
                            : Number(e.target.value),
                        )
                      }
                      className="field mt-1"
                    >
                      <option value="ALL">Todas las cuentas</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <article key={row.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">
                        {row.concept}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.accountName}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="text-sm font-semibold">
                        {row.signedAmount > 0 ? "+" : "−"}
                        {formatMoney(row.amount, row.currency)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateAR(row.date, row.dateUnknown)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 tabular-nums">
                      Saldo: {formatMoney(row.runningBalance, row.currency)}
                    </span>
                    <div className="flex">
                      {!row.transferGroupId && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => openEditTx(row)}
                          className="icon-button"
                          aria-label={`Editar ${row.concept}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDeleteTx(row)}
                        className="icon-button hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`Eliminar ${row.concept}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  {row.notes && (
                    <p className="break-words text-xs text-slate-500">
                      {row.notes}
                    </p>
                  )}
                </article>
              ))}
            </div>
            {filteredRows.length === 0 && (
              <div className="space-y-3 p-8 text-center">
                <p className="text-sm text-slate-500">
                  {hasColumnFilters
                    ? "No hay movimientos con estos filtros."
                    : "Todavía no hay movimientos en esta cuenta."}
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!hasColumnFilters && accounts.length === 0}
                  onClick={
                    hasColumnFilters ? clearFilters : () => openNewTx("IN")
                  }
                >
                  {hasColumnFilters ? "Limpiar filtros" : "Registrar ingreso"}
                </button>
              </div>
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Movimientos de {person.name}
              </caption>
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr className="uppercase">
                  <th className="text-left px-4 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("date")}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      Fecha
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("concept")}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      Concepto
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  {accounts.length > 1 && selectedAccountId === "ALL" && (
                    <th className="text-left px-3 py-2.5 font-semibold">
                      Cuenta
                    </th>
                  )}
                  <th className="text-right px-4 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("amount")}
                      className="inline-flex items-center gap-1 ml-auto hover:text-slate-900 cursor-pointer"
                    >
                      Entrada
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("amount")}
                      className="inline-flex items-center gap-1 ml-auto hover:text-slate-900 cursor-pointer"
                    >
                      Salida
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    Saldo
                  </th>
                  <th className="w-20 px-3 py-2.5"></th>
                </tr>

                {/* Fila de filtros por columna */}
                <tr className="border-t border-slate-200/80 bg-slate-100/70">
                  <th className="px-3 py-2">
                    <select
                      value={colPeriod}
                      onChange={(e) => setColPeriod(e.target.value)}
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-normal text-slate-700"
                    >
                      <option value="">Todo período</option>
                      {availableYearMonths.map((ym) => (
                        <option key={ym} value={ym}>
                          {formatPeriodLabel(ym)}
                        </option>
                      ))}
                      {activeRows.some((r) => r.dateUnknown) && (
                        <option value="SIN_FECHA">Sin fecha</option>
                      )}
                    </select>
                  </th>
                  <th className="px-3 py-2">
                    <input
                      type="text"
                      value={colConcept}
                      onChange={(e) => setColConcept(e.target.value)}
                      placeholder="Filtrar concepto o nota..."
                      className="w-full min-w-36 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-normal text-slate-800 focus:outline-none focus:border-slate-400"
                    />
                  </th>
                  {accounts.length > 1 && selectedAccountId === "ALL" && (
                    <th className="px-2 py-2">
                      <select
                        value={
                          colAccountFilter === "ALL"
                            ? "ALL"
                            : String(colAccountFilter)
                        }
                        onChange={(e) =>
                          setColAccountFilter(
                            e.target.value === "ALL"
                              ? "ALL"
                              : Number(e.target.value),
                          )
                        }
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-normal text-slate-700"
                      >
                        <option value="ALL">Todas</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </th>
                  )}
                  <th colSpan={2} className="px-2 py-2">
                    <select
                      value={colTypeFilter}
                      onChange={(e) =>
                        setColTypeFilter(
                          e.target.value as
                            | "ALL"
                            | "IN_ONLY"
                            | "OUT_ONLY"
                            | "YIELD"
                            | "TRANSFER",
                        )
                      }
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-normal text-slate-700"
                    >
                      <option value="ALL">Todos los tipos</option>
                      <option value="IN_ONLY">Solo Entradas (+)</option>
                      <option value="OUT_ONLY">Solo Salidas (-)</option>
                      <option value="YIELD">Rendimientos</option>
                      {accounts.length > 1 && (
                        <option value="TRANSFER">Transferencias</option>
                      )}
                    </select>
                  </th>
                  <th className="px-3 py-2"></th>
                  <th></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 tabular-nums">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        accounts.length > 1 && selectedAccountId === "ALL"
                          ? 7
                          : 6
                      }
                      className="py-10 text-center text-slate-400"
                    >
                      Sin movimientos para los filtros seleccionados
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const isPositive = row.signedAmount > 0;
                    const negRun = row.runningBalance < -0.004;
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50/80 transition"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-xs sm:text-sm">
                          {formatDateAR(row.date, row.dateUnknown)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {row.concept}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-0.5">
                            {row.refAmount && row.refCurrency && (
                              <span className="text-[0.6875rem] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                Ref:{" "}
                                {formatMoney(row.refAmount, row.refCurrency)}
                              </span>
                            )}
                            {row.type === "YIELD" && (
                              <span className="text-[0.6875rem] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                Rendimiento
                              </span>
                            )}
                            {row.notes && (
                              <span className="text-xs text-slate-400 truncate max-w-xs">
                                {row.notes}
                              </span>
                            )}
                          </div>
                        </td>
                        {accounts.length > 1 && selectedAccountId === "ALL" && (
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                              {row.accountName}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-emerald-600">
                          {isPositive
                            ? formatMoney(row.amount, row.currency)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-rose-600">
                          {!isPositive
                            ? formatMoney(row.amount, row.currency)
                            : "—"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right whitespace-nowrap font-semibold ${
                            negRun ? "text-rose-600" : "text-slate-800"
                          }`}
                        >
                          {formatMoney(row.runningBalance, row.currency)}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {!row.transferGroupId && (
                              <button
                                type="button"
                                onClick={() => openEditTx(row)}
                                title="Editar"
                                aria-label={`Editar ${row.concept}`}
                                disabled={isPending}
                                className="icon-button"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteTx(row)}
                              disabled={isPending}
                              title="Eliminar"
                              aria-label={`Eliminar ${row.concept}`}
                              className="icon-button hover:text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 tabular-nums">
          {detail.monthlySummaries.map((grp) => (
            <div
              key={grp.period}
              className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div>
                  <h3 className="font-bold text-slate-900">
                    {formatPeriodLabel(grp.period)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {grp.unsettledTotal > 0
                      ? `Pendiente de descontar: ${formatMoney(grp.unsettledTotal, "ARS")}`
                      : "Descontado en cuenta"}
                  </p>
                </div>
                <span className="text-lg font-bold text-slate-900">
                  {formatMoney(grp.total, "ARS")}
                </span>
              </div>
              <div className="space-y-1.5 text-sm">
                {grp.items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between text-slate-700"
                  >
                    <span className="truncate">
                      {it.concept}
                      {it.kind === "EXTRA" && (
                        <span className="ml-1.5 text-[0.625rem] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                          Extra
                        </span>
                      )}
                    </span>
                    <span className="font-medium">
                      {formatMoney(it.amount, "ARS")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Movimiento */}
      {txModalOpen && (
        <Modal
          labelledBy="transaction-title"
          onClose={() => setTxModalOpen(false)}
          busy={isPending}
        >
          <fieldset
            disabled={isPending}
            className="min-w-0 p-4 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3
                id="transaction-title"
                className="text-base font-semibold text-slate-900"
              >
                {editingTx
                  ? "Editar movimiento"
                  : `Nuevo movimiento · ${person.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setTxModalOpen(false)}
                aria-label="Cerrar formulario de movimiento"
                className="icon-button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTx} className="space-y-3.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                {(
                  [
                    ["IN", "Ingreso"],
                    ["OUT", "Gasto / Salida"],
                    ["YIELD", "Rendimiento"],
                    ...(accounts.length > 1 && !editingTx
                      ? ([["TRANSFER", "Transferir"]] as const)
                      : []),
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTxType(val)}
                    className={`py-2 rounded-lg transition cursor-pointer ${
                      txType === val
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {accounts.length > 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {txType === "TRANSFER" ? "Desde cuenta" : "Cuenta"}
                    </label>
                    <select
                      value={txAccountId}
                      onChange={(e) => setTxAccountId(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                    </select>
                  </div>
                  {txType === "TRANSFER" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Hacia cuenta
                      </label>
                      <select
                        value={txToAccountId}
                        onChange={(e) =>
                          setTxToAccountId(Number(e.target.value))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.currency})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Monto ({person.defaultCurrency})
                  </label>
                  <MoneyInput
                    value={txAmount}
                    onChange={setTxAmount}
                    currency={person.defaultCurrency}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Concepto
                </label>
                <input
                  type="text"
                  value={txConcept}
                  onChange={(e) => setTxConcept(e.target.value)}
                  placeholder="Ej: Transferencia, Seguro Zurich, Regalo..."
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              {txType !== "TRANSFER" && (
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                  <div className="col-span-2">
                    <label className="block text-[0.6875rem] font-medium text-slate-500 mb-1">
                      Monto original otra moneda (opcional)
                    </label>
                    <MoneyInput
                      value={txRefAmount}
                      onChange={setTxRefAmount}
                      currency={txRefCurrency}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.6875rem] font-medium text-slate-500 mb-1">
                      Moneda ref.
                    </label>
                    <select
                      value={txRefCurrency}
                      onChange={(e) => setTxRefCurrency(e.target.value)}
                      className="w-full px-2 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                    >
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nota adicional (opcional)
                </label>
                <input
                  type="text"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="Detalle opcional..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              {formError && (
                <p
                  role="alert"
                  className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg"
                >
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTxModalOpen(false)}
                  className="min-h-11 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="min-h-11 px-4 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </fieldset>
        </Modal>
      )}

      {/* Modal Acceso Familiar (Link + PIN) */}
      {shareOpen && (
        <Modal
          labelledBy="share-title"
          onClose={() => setShareOpen(false)}
          busy={isPending}
        >
          <fieldset
            disabled={isPending}
            className="min-w-0 p-4 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3
                id="share-title"
                className="text-base font-semibold text-slate-900"
              >
                Acceso Familiar · {person.name}
              </h3>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                aria-label="Cerrar acceso familiar"
                className="icon-button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Con este enlace privado, {person.name} puede consultar su saldo,
              subcuentas, movimientos y boletas en{" "}
              <strong>modo solo lectura</strong> sin ver cuentas de nadie más.
            </p>

            <ToggleSwitch
              checked={shareEnabled}
              onChange={setShareEnabled}
              label="Habilitar enlace compartido"
            />

            {shareEnabled && shareUrl && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  Link para compartir por WhatsApp
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium cursor-pointer"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Contraseña de acceso (opcional; sirve para entrar por /login o
                con el link)
              </label>
              <input
                type="text"
                value={sharePin}
                onChange={(e) => setSharePin(e.target.value)}
                placeholder="Ej: mama2026 o 1234"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => handleSaveShare(true)}
                disabled={isPending}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerar link
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    handleSaveShare(false);
                    setShareOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          </fieldset>
        </Modal>
      )}

      {/* Modal Nueva Subcuenta */}
      {newAccOpen && (
        <Modal
          labelledBy="account-title"
          onClose={() => setNewAccOpen(false)}
          busy={isPending}
        >
          <form onSubmit={handleCreateSubaccount} className="p-4 sm:p-6">
            <fieldset disabled={isPending} className="min-w-0 space-y-4">
              <div className="flex items-center justify-between">
                <h3
                  id="account-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Nueva subcuenta · {person.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setNewAccOpen(false)}
                  aria-label="Cerrar nueva subcuenta"
                  className="icon-button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nombre (ej: Mercado Pago, Banco Galicia, Invertido)
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Saldo inicial ({person.defaultCurrency})
                </label>
                <MoneyInput
                  value={newAccBalance}
                  onChange={setNewAccBalance}
                  currency={person.defaultCurrency}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewAccOpen(false)}
                  className="min-h-11 px-3.5 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="min-h-11 px-4 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
                >
                  Crear
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </div>
  );
}
