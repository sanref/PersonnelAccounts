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
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Layers,
  Receipt,
  Wallet,
  HandCoins,
  TrendingUp,
  CalendarDays,
  Clock3,
} from "lucide-react";
import type {
  AccountSummary,
  DebtBalance,
  LedgerRow,
  PersonCardSummary,
} from "@/lib/queries";
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
import { DebtsPanel } from "@/components/debts-panel";
import {
  Avatar,
  Segmented,
  SettledTag,
  SharedTag,
  Tag,
} from "@/components/cui";

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

/** Tipo de movimiento como etiqueta de color (CUI status tag). */
function TxTypeTag({ row }: { row: LedgerRow }) {
  if (row.affectsDebt) {
    return (
      <Tag tone="iris" icon={HandCoins}>
        Préstamo
      </Tag>
    );
  }
  switch (row.type) {
    case "IN":
      return (
        <Tag tone="success" icon={ArrowDownLeft}>
          Ingreso
        </Tag>
      );
    case "OUT":
      return (
        <Tag tone="danger" icon={ArrowUpRight}>
          Egreso
        </Tag>
      );
    case "YIELD":
      return (
        <Tag tone="success" icon={TrendingUp}>
          Rendimiento
        </Tag>
      );
    case "TRANSFER_IN":
    case "TRANSFER_OUT":
      return (
        <Tag tone="accent" icon={ArrowLeftRight}>
          Transferencia
        </Tag>
      );
    default:
      return null;
  }
}

export function PersonLedgerClient({
  detail,
  allPeople = [],
  debtBalances = [],
}: {
  detail: PersonDetailProps;
  /** Todas las personas con cuentas: destinos de transferencias entre personas. */
  allPeople?: PersonCardSummary[];
  debtBalances?: DebtBalance[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { person, accounts } = detail;
  // Cuentas activas de otras personas para transferir (préstamos / devoluciones)
  const otherPeopleGroups = allPeople
    .filter((p) => p.id !== person.id)
    .map((p) => ({ person: p, accounts: p.accounts.filter((a) => a.isActive) }))
    .filter((g) => g.accounts.length > 0);
  const canTransfer =
    accounts.length > 1 || (accounts.length > 0 && otherPeopleGroups.length > 0);
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
  const [txAffectsDebt, setTxAffectsDebt] = useState(false);
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
    setTxToAccountId(
      otherAcc?.id ?? otherPeopleGroups[0]?.accounts[0]?.id ?? accounts[0]?.id ?? 0,
    );
    setTxAffectsDebt(false);
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

  const transferTargetPerson =
    txType === "TRANSFER"
      ? otherPeopleGroups.find((g) => g.accounts.some((a) => a.id === txToAccountId))
          ?.person
      : undefined;
  const transferToOtherPerson = Boolean(transferTargetPerson);

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
            affectsDebt: transferToOtherPerson ? txAffectsDebt : undefined,
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
    const msg = row.affectsDebt || (row.transferGroupId && row.type === "OUT")
      ? "¿Eliminar este movimiento junto con el préstamo/pago asociado? Se borra en todas las cuentas involucradas y se ajusta la deuda."
      : row.transferGroupId
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
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={person.name} seed={person.id} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title">{person.name}</h1>
              <Tag tone="neutral">{person.defaultCurrency}</Tag>
              {person.shareEnabled && <SharedTag />}
            </div>
            <p className="mt-3 text-sm text-ink-3">Saldo disponible</p>
            <p
              className={`num break-words text-3xl font-medium mt-0.5 sm:text-4xl ${
                isNegative ? "text-danger-ink" : "text-ink"
              }`}
            >
              {formatMoney(detail.totalBalance, person.defaultCurrency)}
            </p>
            {isNegative && (
              <Tag tone="danger" className="mt-2">
                Saldo negativo: {person.name} te debe este importe
              </Tag>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openNewTx("IN")}
            disabled={accounts.length === 0 || isPending}
            className="btn-secondary"
          >
            <Plus className="size-4" />
            Ingreso
          </button>
          <button
            type="button"
            onClick={() => openNewTx("OUT")}
            disabled={accounts.length === 0 || isPending}
            className="btn-primary"
          >
            <Plus className="size-4" />
            Gasto / Pago
          </button>
          {canTransfer && (
            <button
              type="button"
              onClick={() => openNewTx("TRANSFER")}
              className="btn-secondary"
            >
              <ArrowLeftRight className="size-4" />
              Transferir
            </button>
          )}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="btn-ghost"
          >
            <Share2 className="size-4" />
            Compartir
          </button>
        </div>
      </div>

      {debtBalances.length > 0 && (
        <DebtsPanel
          balances={debtBalances}
          people={allPeople}
          personId={person.id}
        />
      )}

      {/* Selector de Subcuentas */}
      <div
        role="group"
        aria-label="Subcuentas"
        className="grid grid-cols-2 gap-3 tabular-nums sm:grid-cols-3 lg:grid-cols-4"
      >
        {accounts.length > 1 && (
          <button
            type="button"
            aria-pressed={selectedAccountId === "ALL"}
            onClick={() => setSelectedAccountId("ALL")}
            className={`flex min-h-11 flex-col items-start gap-1 rounded-panel border p-3 text-left transition-[background-color,border-color,scale] active:scale-[0.98] ${
              selectedAccountId === "ALL"
                ? "border-accent bg-accent-soft ring-3 ring-accent/15"
                : "border-line bg-surface hover:border-line-strong/60"
            }`}
          >
            <span
              className={`flex items-center gap-1.5 text-xs ${selectedAccountId === "ALL" ? "font-medium text-accent-ink" : "text-ink-3"}`}
            >
              <Layers className="size-3.5" aria-hidden="true" />
              Todas
            </span>
            <span
              className={`num text-lg font-medium ${detail.totalBalance < -0.004 ? "text-danger-ink" : "text-ink"}`}
            >
              {formatMoney(detail.totalBalance, person.defaultCurrency)}
            </span>
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
              aria-pressed={active}
              onClick={() =>
                setSelectedAccountId(accounts.length === 1 ? "ALL" : acc.id)
              }
              className={`flex min-h-11 flex-col items-start gap-1 rounded-panel border p-3 text-left transition-[background-color,border-color,scale] active:scale-[0.98] ${
                active
                  ? "border-accent bg-accent-soft ring-3 ring-accent/15"
                  : "border-line bg-surface hover:border-line-strong/60"
              }`}
            >
              <span
                className={`flex max-w-full items-center gap-1.5 text-xs ${active ? "font-medium text-accent-ink" : "text-ink-3"}`}
              >
                <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{acc.name}</span>
              </span>
              <span
                className={`num text-lg font-medium ${acc.balance < -0.004 ? "text-danger-ink" : "text-ink"}`}
              >
                {formatMoney(acc.balance, acc.currency)}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setNewAccOpen(true)}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-panel border border-dashed border-accent-line p-3 text-sm font-medium text-accent-ink transition-colors hover:border-accent hover:bg-accent-soft"
        >
          <Plus className="size-4" aria-hidden="true" />
          Subcuenta
        </button>
      </div>

      {/* Pestañas si también tiene Resúmenes Mensuales */}
      {detail.monthlySummaries.length > 0 && (
        <Segmented
          label="Vista de la cuenta"
          value={activeTab}
          onChange={setActiveTab}
          className="max-w-full overflow-x-auto"
          options={[
            {
              value: "movimientos",
              icon: History,
              label: `Movimientos (${activeRows.length})`,
            },
            {
              value: "resumenes",
              icon: Receipt,
              label: `Resúmenes de servicios (${detail.monthlySummaries.length})`,
            },
          ]}
        />
      )}

      {activeTab === "movimientos" ? (
        <div className="panel overflow-hidden">
          {/* Barra resumen dinámica de las filas filtradas */}
          <div className="panel-header text-xs text-ink-2">
            <div className="flex flex-wrap items-center gap-2 tabular-nums">
              <Tag tone="neutral">
                {filteredRows.length} de {activeRows.length}
              </Tag>
              <Tag tone="success" icon={ArrowDownLeft}>
                Entradas{" "}
                {formatMoney(filteredTotals.totalIn, person.defaultCurrency)}
              </Tag>
              <Tag tone="danger" icon={ArrowUpRight}>
                Salidas{" "}
                {formatMoney(filteredTotals.totalOut, person.defaultCurrency)}
              </Tag>
            </div>

            {hasColumnFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn-ghost icon-button-danger min-h-9 px-2.5 text-xs"
              >
                <FilterX className="size-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="md:hidden">
            <div className="space-y-3 border-b border-line p-4">
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
                <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control py-3 text-sm font-medium text-accent-ink">
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
            <div className="divide-y divide-line">
              {filteredRows.map((row) => (
                <article key={row.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-ink">
                        {row.concept}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                        <TxTypeTag row={row} />
                        <span>{row.accountName}</span>
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <p
                        className={`text-sm font-medium ${row.signedAmount > 0 ? "text-success-ink" : "text-danger-ink"}`}
                      >
                        {row.signedAmount > 0 ? "+" : "−"}
                        {formatMoney(row.amount, row.currency)}
                      </p>
                      <p className="mt-1 text-xs text-ink-3">
                        {formatDateAR(row.date, row.dateUnknown)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs tabular-nums ${row.runningBalance < -0.004 ? "text-danger-ink" : "text-ink-3"}`}
                    >
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
                        className="icon-button icon-button-danger"
                        aria-label={`Eliminar ${row.concept}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  {row.notes && (
                    <p className="break-words text-xs text-ink-3">
                      {row.notes}
                    </p>
                  )}
                </article>
              ))}
            </div>
            {filteredRows.length === 0 && (
              <div className="space-y-3 p-8 text-center">
                <p className="text-sm text-ink-3">
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
            <table className="data-table w-full text-sm">
              <caption className="sr-only">
                Movimientos de {person.name}
              </caption>
              <thead>
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort("date")}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg hover:text-ink cursor-pointer"
                    >
                      Fecha
                      <ArrowUpDown className="size-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort("concept")}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg hover:text-ink cursor-pointer"
                    >
                      Concepto
                      <ArrowUpDown className="size-3" />
                    </button>
                  </th>
                  {accounts.length > 1 && selectedAccountId === "ALL" && (
                    <th className="text-left px-3 py-2.5 font-medium">
                      Cuenta
                    </th>
                  )}
                  <th className="text-right px-4 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort("amount")}
                      className="inline-flex min-h-9 items-center gap-1 ml-auto rounded-lg hover:text-ink cursor-pointer"
                    >
                      Entrada
                      <ArrowUpDown className="size-3" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort("amount")}
                      className="inline-flex min-h-9 items-center gap-1 ml-auto rounded-lg hover:text-ink cursor-pointer"
                    >
                      Salida
                      <ArrowUpDown className="size-3" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium">
                    Saldo
                  </th>
                  <th className="w-20 px-3 py-2.5"></th>
                </tr>

                {/* Fila de filtros por columna */}
                <tr className="border-t border-line bg-canvas/60">
                  <th className="px-3 py-2">
                    <select
                      value={colPeriod}
                      onChange={(e) => setColPeriod(e.target.value)}
                      className="w-full min-h-9 rounded-lg border border-line-strong/60 bg-surface px-2 py-1 text-xs font-normal text-ink hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20"
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
                      className="w-full min-h-9 rounded-lg border border-line-strong/60 bg-surface px-2 py-1 text-xs font-normal text-ink hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20 min-w-36 placeholder:text-ink-3"
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
                        className="w-full min-h-9 rounded-lg border border-line-strong/60 bg-surface px-2 py-1 text-xs font-normal text-ink hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20"
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
                      className="w-full min-h-9 rounded-lg border border-line-strong/60 bg-surface px-2 py-1 text-xs font-normal text-ink hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20"
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

              <tbody className="tabular-nums">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        accounts.length > 1 && selectedAccountId === "ALL"
                          ? 7
                          : 6
                      }
                      className="py-10 text-center text-ink-3"
                    >
                      Sin movimientos para los filtros seleccionados
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const isPositive = row.signedAmount > 0;
                    const negRun = row.runningBalance < -0.004;
                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-3 whitespace-nowrap text-ink-3 text-xs sm:text-sm">
                          {formatDateAR(row.date, row.dateUnknown)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">
                            {row.concept}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <TxTypeTag row={row} />
                            {row.refAmount && row.refCurrency && (
                              <Tag tone="neutral">
                                Ref:{" "}
                                {formatMoney(row.refAmount, row.refCurrency)}
                              </Tag>
                            )}
                            {row.notes && (
                              <span className="text-xs text-ink-3 truncate max-w-xs">
                                {row.notes}
                              </span>
                            )}
                          </div>
                        </td>
                        {accounts.length > 1 && selectedAccountId === "ALL" && (
                          <td className="px-3 py-3 whitespace-nowrap">
                            <Tag tone="neutral" icon={Wallet}>
                              {row.accountName}
                            </Tag>
                          </td>
                        )}
                        <td
                          className={`px-4 py-3 text-right whitespace-nowrap font-medium ${isPositive ? "text-success-ink" : "text-ink-3"}`}
                        >
                          {isPositive
                            ? formatMoney(row.amount, row.currency)
                            : "—"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right whitespace-nowrap font-medium ${!isPositive ? "text-danger-ink" : "text-ink-3"}`}
                        >
                          {!isPositive
                            ? formatMoney(row.amount, row.currency)
                            : "—"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right whitespace-nowrap font-medium ${
                            negRun ? "text-danger-ink" : "text-ink"
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
                                <Pencil className="size-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteTx(row)}
                              disabled={isPending}
                              title="Eliminar"
                              aria-label={`Eliminar ${row.concept}`}
                              className="icon-button icon-button-danger"
                            >
                              <Trash2 className="size-4" />
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
            <div key={grp.period} className="panel">
              <div className="panel-header">
                <div className="min-w-0">
                  <h3 className="panel-title">
                    <CalendarDays className="size-4 text-ink-3" aria-hidden="true" />
                    {formatPeriodLabel(grp.period)}
                  </h3>
                  <div className="mt-1.5">
                    {grp.unsettledTotal > 0 ? (
                      <Tag tone="warning" icon={Clock3}>
                        Por descontar{" "}
                        {formatMoney(grp.unsettledTotal, "ARS")}
                      </Tag>
                    ) : (
                      <SettledTag>Descontado en cuenta</SettledTag>
                    )}
                  </div>
                </div>
                <span className="num text-lg font-medium text-ink">
                  {formatMoney(grp.total, "ARS")}
                </span>
              </div>
              <div className="divide-y divide-line px-4 text-sm sm:px-5">
                {grp.items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-3 py-2 text-ink-2"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{it.concept}</span>
                      {it.kind === "EXTRA" && <Tag tone="orange">Extra</Tag>}
                    </span>
                    <span className="font-medium text-ink">
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
                className="font-display text-lg font-medium text-ink"
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
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTx} className="space-y-3.5">
              <div role="group" aria-label="Tipo de movimiento" className="segmented grid w-full grid-cols-2 sm:grid-cols-4">
                {(
                  [
                    ["IN", "Ingreso"],
                    ["OUT", "Gasto / Salida"],
                    ["YIELD", "Rendimiento"],
                    ...(canTransfer && !editingTx
                      ? ([["TRANSFER", "Transferir"]] as const)
                      : []),
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    aria-pressed={txType === val}
                    onClick={() => setTxType(val)}
                    className={`segmented-item ${
                      txType !== val
                        ? ""
                        : val === "OUT"
                          ? "!text-danger-ink"
                          : val === "TRANSFER"
                            ? "!text-accent-ink"
                            : "!text-success-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(accounts.length > 1 || txType === "TRANSFER") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">
                      {txType === "TRANSFER" ? "Desde cuenta" : "Cuenta"}
                    </label>
                    <select
                      value={txAccountId}
                      onChange={(e) => setTxAccountId(Number(e.target.value))}
                      className="field"
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
                      <label className="field-label">
                        Hacia cuenta
                      </label>
                      <select
                        value={txToAccountId}
                        onChange={(e) =>
                          setTxToAccountId(Number(e.target.value))
                        }
                        className="field"
                      >
                        <optgroup label={`Cuentas de ${person.name}`}>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.currency})
                            </option>
                          ))}
                        </optgroup>
                        {otherPeopleGroups.map((g) => (
                          <optgroup
                            key={g.person.id}
                            label={`Cuentas de ${g.person.name}`}
                          >
                            {g.accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {g.person.name} · {a.name} ({a.currency})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {transferTargetPerson && (
                <div className="space-y-2 rounded-panel border border-iris-line bg-iris-soft/60 p-3">
                  <ToggleSwitch
                    checked={txAffectsDebt}
                    onChange={setTxAffectsDebt}
                    activeColor="indigo"
                    label="Es préstamo / devolución (cuenta para la deuda)"
                  />
                  <p className="text-xs text-ink-2">
                    {txAffectsDebt
                      ? `${transferTargetPerson.name} le va a deber este monto a ${person.name} (o se descuenta de lo que ${person.name} le debe).`
                      : "Sin marcar, la transferencia no genera deuda (por ejemplo, un regalo o un reacomodo)."}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    required
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label">
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
                <label className="field-label">
                  Concepto
                </label>
                <input
                  type="text"
                  value={txConcept}
                  onChange={(e) => setTxConcept(e.target.value)}
                  placeholder="Ej: Transferencia, Seguro Zurich, Regalo..."
                  required
                  className="field"
                />
              </div>

              {txType !== "TRANSFER" && (
                <div className="grid grid-cols-3 gap-2 rounded-panel border border-line bg-subtle p-3">
                  <div className="col-span-2">
                    <label className="field-label">
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
                    <label className="field-label">
                      Moneda ref.
                    </label>
                    <select
                      value={txRefCurrency}
                      onChange={(e) => setTxRefCurrency(e.target.value)}
                      className="field px-2 font-medium"
                    >
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="field-label">
                  Nota adicional (opcional)
                </label>
                <input
                  type="text"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="Detalle opcional..."
                  className="field"
                />
              </div>

              {formError && (
                <p
                  role="alert"
                  className="alert alert-danger py-2.5 text-xs"
                >
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTxModalOpen(false)}
                  className="btn-ghost"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn-primary"
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
                className="font-display text-lg font-medium text-ink"
              >
                Acceso Familiar · {person.name}
              </h3>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                aria-label="Cerrar acceso familiar"
                className="icon-button"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="text-xs text-ink-2">
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
                <label className="field-label">
                  Link para compartir por WhatsApp
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    aria-label="Link para compartir"
                    className="field flex-1 bg-subtle text-xs text-ink-2"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="btn-secondary px-3"
                  >
                    {copied ? (
                      <Check className="size-4 text-success" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="field-label">
                Contraseña de acceso (opcional; sirve para entrar por /login o
                con el link)
              </label>
              <input
                type="text"
                value={sharePin}
                onChange={(e) => setSharePin(e.target.value)}
                placeholder="Ej: mama2026 o 1234"
                className="field"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => handleSaveShare(true)}
                disabled={isPending}
                className="btn-ghost icon-button-danger px-3 text-xs"
              >
                <RefreshCw className="size-3.5" />
                Regenerar link
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="btn-ghost"
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
                  className="btn-primary"
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
                  className="font-display text-lg font-medium text-ink"
                >
                  Nueva subcuenta · {person.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setNewAccOpen(false)}
                  aria-label="Cerrar nueva subcuenta"
                  className="icon-button"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div>
                <label className="field-label">
                  Nombre (ej: Mercado Pago, Banco Galicia, Invertido)
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">
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
                  className="btn-ghost"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn-primary"
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
