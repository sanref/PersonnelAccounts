"use client";

import { useState, useMemo, useOptimistic, useTransition } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  ListPlus,
  Trash2,
  ArrowDownToLine,
  ArrowUpDown,
  FilterX,
  History,
  X,
  Search,
  SlidersHorizontal,
  CalendarDays,
  Info,
  Receipt,
  CircleDollarSign,
  Clock3,
  FileClock,
  CheckCircle2,
} from "lucide-react";
import type { PersonCardSummary } from "@/lib/queries";
import {
  generateMonthItemsAction,
  addMonthlyItemAction,
  updateMonthlyItemAction,
  deleteMonthlyItemAction,
  settleSingleMonthlyItemAction,
  settlePersonMonthSummaryAction,
} from "@/app/actions";
import {
  formatMoney,
  formatPeriodLabel,
  formatShortPeriodLabel,
  parseMoneyInput,
  shiftPeriod,
  todayISO,
  currentPeriodISO,
} from "@/lib/format";
import {
  InlineMoneyCell,
  MoneyInput,
  ToggleSwitch,
} from "@/components/ui-controls";
import { FeedbackBanner, EmptyState } from "@/components/ui-feedback";
import { PaymentMobileCard } from "@/components/payment-mobile-card";
import { Modal } from "@/components/modal";
import {
  Avatar,
  CarryOverTag,
  PaidTag,
  PendingTag,
  ProgressBar,
  SettledTag,
  Stat,
  Tag,
} from "@/components/cui";

export interface MonthlyItemRow {
  id: number;
  period: string;
  billedPeriod: string | null;
  personId: number;
  serviceId: number | null;
  kind: string;
  concept: string;
  dueDate: string | null;
  amount: string | null;
  status: string;
  paidAt: string | null;
  settledTransactionId: number | null;
  notes: string | null;
  person: { id: number; name: string; slug: string };
  service?: { id: number; paysInArrears: boolean } | null;
  settledTransaction?: {
    id: number;
    account: { id: number; name: string };
  } | null;
}

type SortField = "dueDate" | "concept" | "person" | "amount" | "status";

type SettleTarget =
  | { kind: "person"; person: PersonCardSummary }
  | { kind: "item"; item: MonthlyItemRow; person: PersonCardSummary };

/** Los ítems mensuales son en ARS: solo se descuentan de cuentas activas en pesos. */
function settleableAccounts(p: PersonCardSummary) {
  return p.accounts.filter((a) => a.isActive && a.currency === "ARS");
}

export function MonthlyPaymentsClient({
  period,
  people,
  items: serverItems,
  carryOverItems: serverCarryOverItems,
  missingServicesCount,
  initialTab,
  initialPersonFilter,
}: {
  period: string;
  people: PersonCardSummary[];
  items: MonthlyItemRow[];
  carryOverItems: MonthlyItemRow[];
  missingServicesCount: number;
  initialTab: "grilla" | "resumen";
  initialPersonFilter: number | "ALL";
}) {
  const [isPending, startTransition] = useTransition();

  const [{ items, carryOverItems }, removeOptimisticItem] = useOptimistic(
    { items: serverItems, carryOverItems: serverCarryOverItems },
    (current, deletedId: number) => ({
      items: current.items.filter((i) => i.id !== deletedId),
      carryOverItems: current.carryOverItems.filter((i) => i.id !== deletedId),
    }),
  );

  const [tab, setTab] = useState<"grilla" | "resumen">(initialTab);
  const [showCarryOver, setShowCarryOver] = useState(true);

  // Filtros por columna en la Grilla
  const [colStatus, setColStatus] = useState<"ALL" | "PENDING" | "PAID">("ALL");
  const [colConcept, setColConcept] = useState("");
  const [colOrigin, setColOrigin] = useState<
    "ALL" | "CURRENT" | "CARRYOVER" | "ARREARS" | "EXTRA"
  >("ALL");
  const [colPerson, setColPerson] = useState<number | "ALL">(
    initialPersonFilter,
  );
  const [colAmountState, setColAmountState] = useState<
    "ALL" | "WITH" | "WITHOUT"
  >("ALL");
  const [colSettled, setColSettled] = useState<"ALL" | "SETTLED" | "UNSETTLED">(
    "ALL",
  );

  // Ordenamiento
  const [sortField, setSortField] = useState<SortField>("dueDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Modal Agregar Extra / Ítem del Mes
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraPersonId, setExtraPersonId] = useState<number>(
    initialPersonFilter !== "ALL" ? initialPersonFilter : (people[0]?.id ?? 0),
  );
  const [extraKind, setExtraKind] = useState<"EXTRA" | "SERVICE">("EXTRA");
  const [extraConcept, setExtraConcept] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [extraDueDate, setExtraDueDate] = useState(`${period}-15`);
  const [extraIsArrears, setExtraIsArrears] = useState(false);
  const [extraPaid, setExtraPaid] = useState(true);

  // Modal Descontar (ítem individual o resumen de la persona) en cuenta
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  // Cuenta de la que sale la plata (del dueño o de otra persona que presta)
  const [settleSourceAccountId, setSettleSourceAccountId] = useState<number>(0);
  // Cuenta del dueño donde se registra el gasto cuando presta otra persona
  const [settleOwnerAccountId, setSettleOwnerAccountId] = useState<number>(0);
  const [settleDate, setSettleDate] = useState<string>(todayISO());
  const [settleConcept, setSettleConcept] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{
    message: string;
    retry: () => Promise<void>;
  } | null>(null);

  function runAction(operation: () => Promise<void>) {
    startTransition(async () => {
      setActionError(null);
      setFeedback(null);
      try {
        await operation();
      } catch (err) {
        setActionError({
          message:
            err instanceof Error
              ? err.message
              : "Lamentablemente no se pudo completar la acción.",
          retry: operation,
        });
      }
    });
  }

  const prevPeriod = shiftPeriod(period, -1);
  const nextPeriod = shiftPeriod(period, 1);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const hasActiveFilters =
    colStatus !== "ALL" ||
    colConcept.trim() !== "" ||
    colOrigin !== "ALL" ||
    colPerson !== "ALL" ||
    colAmountState !== "ALL" ||
    colSettled !== "ALL";

  function clearAllFilters() {
    setColStatus("ALL");
    setColConcept("");
    setColOrigin("ALL");
    setColPerson("ALL");
    setColAmountState("ALL");
    setColSettled("ALL");
  }

  // Combinar ítems del mes actual + impagos arrastrados de meses anteriores (si showCarryOver está activo)
  const combinedSource = useMemo(() => {
    const taggedCurrent = items.map((i) => ({ ...i, isCarryOver: false }));
    const taggedCarry = showCarryOver
      ? carryOverItems.map((i) => ({ ...i, isCarryOver: true }))
      : [];
    return [...taggedCarry, ...taggedCurrent];
  }, [items, carryOverItems, showCarryOver]);

  const filteredAndSorted = useMemo(() => {
    const q = colConcept.trim().toLowerCase();

    const filtered = combinedSource.filter((item) => {
      if (colStatus !== "ALL" && item.status !== colStatus) return false;
      if (colPerson !== "ALL" && item.personId !== colPerson) return false;
      if (q) {
        const hay = `${item.concept} ${item.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      const isArrears =
        Boolean(item.billedPeriod && item.billedPeriod !== item.period) ||
        Boolean(item.service?.paysInArrears);

      if (colOrigin === "CURRENT" && item.isCarryOver) return false;
      if (colOrigin === "CARRYOVER" && !item.isCarryOver) return false;
      if (colOrigin === "ARREARS" && !isArrears) return false;
      if (colOrigin === "EXTRA" && item.kind !== "EXTRA") return false;

      const hasAmt = item.amount !== null && item.amount !== "";
      if (colAmountState === "WITH" && !hasAmt) return false;
      if (colAmountState === "WITHOUT" && hasAmt) return false;

      if (colSettled === "SETTLED" && !item.settledTransactionId) return false;
      if (colSettled === "UNSETTLED" && item.settledTransactionId) return false;

      return true;
    });

    return [...filtered].sort((a, b) => {
      // Mantener impagos arrastrados arriba si se ordena por vencimiento ascendente
      if (sortField === "dueDate" && a.isCarryOver !== b.isCarryOver) {
        return a.isCarryOver ? -1 : 1;
      }
      let cmp = 0;
      if (sortField === "dueDate") {
        cmp = (a.dueDate ?? "9999-99-99").localeCompare(
          b.dueDate ?? "9999-99-99",
        );
      } else if (sortField === "concept") {
        cmp = a.concept.localeCompare(b.concept, "es");
      } else if (sortField === "person") {
        cmp = a.person.name.localeCompare(b.person.name, "es");
      } else if (sortField === "amount") {
        cmp = Number(a.amount ?? -1) - Number(b.amount ?? -1);
      } else if (sortField === "status") {
        cmp = a.status.localeCompare(b.status);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [
    combinedSource,
    colStatus,
    colPerson,
    colConcept,
    colOrigin,
    colAmountState,
    colSettled,
    sortField,
    sortDir,
  ]);

  const totalFiltered = filteredAndSorted.reduce(
    (acc, i) => acc + Number(i.amount ?? 0),
    0,
  );
  const pendingFilteredCount = filteredAndSorted.filter(
    (i) => i.status === "PENDING",
  ).length;
  const paidFilteredTotal = filteredAndSorted
    .filter((i) => i.status === "PAID")
    .reduce((acc, i) => acc + Number(i.amount ?? 0), 0);

  function handleGenerateMonth() {
    runAction(async () => {
      const res = await generateMonthItemsAction(period);
      setFeedback(
        res.added > 0
          ? `Se agregaron ${res.added} servicios activos a ${formatPeriodLabel(period)}`
          : "Todos los servicios activos ya están cargados en este mes",
      );
    });
  }

  function handleTogglePaid(item: MonthlyItemRow) {
    const nextStatus = item.status === "PAID" ? "PENDING" : "PAID";
    runAction(async () => {
      await updateMonthlyItemAction({
        id: item.id,
        status: nextStatus,
      });
      setFeedback(
        nextStatus === "PAID"
          ? `Se marcó ${item.concept} como pagado. Esto no descuenta dinero de la cuenta.`
          : `Se marcó ${item.concept} como pendiente.`,
      );
    });
  }

  function handleSaveAmount(item: MonthlyItemRow, nextNum: number | null) {
    runAction(async () => {
      await updateMonthlyItemAction({
        id: item.id,
        amount: nextNum,
      });
    });
  }

  function handleBlurDueDate(item: MonthlyItemRow, nextDate: string) {
    if ((item.dueDate ?? "") === nextDate) return;
    runAction(async () => {
      await updateMonthlyItemAction({
        id: item.id,
        dueDate: nextDate || null,
      });
    });
  }

  function handleAddExtra(e: React.FormEvent) {
    e.preventDefault();
    if (!extraConcept.trim()) return;
    const amt = parseMoneyInput(extraAmount);

    runAction(async () => {
      await addMonthlyItemAction({
        period,
        billedPeriod: extraIsArrears ? shiftPeriod(period, -1) : period,
        personId: extraPersonId,
        kind: extraKind,
        concept: extraConcept,
        dueDate: extraDueDate || null,
        amount: amt,
        status: extraPaid ? "PAID" : "PENDING",
      });
      setExtraConcept("");
      setExtraAmount("");
      setExtraIsArrears(false);
      setExtraOpen(false);
      setFeedback("Gasto agregado al mes.");
    });
  }

  function openSettleModal(target: SettleTarget) {
    const ownAccounts = settleableAccounts(target.person);
    setActionError(null);
    setSettleTarget(target);
    setSettleSourceAccountId(ownAccounts[0]?.id ?? 0);
    setSettleOwnerAccountId(ownAccounts[0]?.id ?? 0);
    setSettleDate(todayISO());
    setSettleConcept(
      target.kind === "item"
        ? target.item.concept
        : `Servicios ${formatPeriodLabel(period)}`,
    );
  }

  function closeSettleModal() {
    setSettleTarget(null);
    setActionError(null);
  }

  function openSettlePersonModal(p: PersonCardSummary) {
    openSettleModal({ kind: "person", person: p });
  }

  function handleSettleSingleItem(item: MonthlyItemRow) {
    const owner = people.find((p) => p.id === item.personId);
    if (!owner || settleableAccounts(owner).length === 0) return;
    openSettleModal({ kind: "item", item, person: owner });
  }

  // Cuentas que pueden poner la plata: primero las del dueño, luego las de otras personas
  const settleLenderGroups = useMemo(
    () =>
      settleTarget
        ? people
            .filter((p) => p.id !== settleTarget.person.id)
            .map((p) => ({ person: p, accounts: settleableAccounts(p) }))
            .filter((g) => g.accounts.length > 0)
        : [],
    [people, settleTarget],
  );
  const settleLender = settleLenderGroups.find((g) =>
    g.accounts.some((a) => a.id === settleSourceAccountId),
  )?.person;
  const settleAmount = !settleTarget
    ? 0
    : settleTarget.kind === "item"
      ? Number(settleTarget.item.amount ?? 0)
      : Math.round(
          items
            .filter(
              (i) =>
                i.personId === settleTarget.person.id &&
                !i.settledTransactionId &&
                Number(i.amount ?? 0) > 0,
            )
            .reduce((acc, i) => acc + Number(i.amount ?? 0), 0) * 100,
        ) / 100;

  function handleConfirmSettle(e: React.FormEvent) {
    e.preventDefault();
    if (!settleTarget || !settleSourceAccountId) return;
    const target = settleTarget;
    const lender = settleLender;
    const ownerAccountId = lender ? settleOwnerAccountId : settleSourceAccountId;
    const lenderAccountId = lender ? settleSourceAccountId : null;
    if (!ownerAccountId) return;
    const sourceName =
      [...target.person.accounts, ...(lender?.accounts ?? [])].find(
        (a) => a.id === settleSourceAccountId,
      )?.name ?? "";
    const loanSuffix = lender
      ? ` con dinero de ${lender.name} (queda como deuda de ${target.person.name})`
      : "";

    runAction(async () => {
      if (target.kind === "item") {
        await settleSingleMonthlyItemAction({
          itemId: target.item.id,
          accountId: ownerAccountId,
          lenderAccountId,
          date: settleDate,
          concept: settleConcept,
        });
        setFeedback(
          `${target.item.concept} se descontó de ${sourceName}${loanSuffix}.`,
        );
      } else {
        const res = await settlePersonMonthSummaryAction({
          period,
          personId: target.person.id,
          accountId: ownerAccountId,
          lenderAccountId,
          date: settleDate,
          customConcept: settleConcept,
        });
        setFeedback(
          `Descontado ${formatMoney(res.total, "ARS")} (${res.count} ítems) de ${target.person.name}${loanSuffix}.`,
        );
      }
      setSettleTarget(null);
    });
  }

  function handleDeleteItem(item: MonthlyItemRow) {
    if (
      !confirm(
        `¿Quitar "${item.concept}" de ${formatPeriodLabel(item.period)}? No se elimina del catálogo ni se revierte un descuento ya registrado.`,
      )
    )
      return;
    runAction(async () => {
      removeOptimisticItem(item.id);
      await deleteMonthlyItemAction(item.id);
      setFeedback(`${item.concept} se quitó del listado.`);
    });
  }

  function openExtra(personId?: number) {
    if (personId) setExtraPersonId(personId);
    else if (colPerson !== "ALL") setExtraPersonId(colPerson);
    setExtraDueDate(`${period}-15`);
    setActionError(null);
    setExtraOpen(true);
  }

  const monthTotal = items.reduce(
    (total, item) => total + Number(item.amount ?? 0),
    0,
  );
  const monthPaid = items
    .filter((item) => item.status === "PAID")
    .reduce((total, item) => total + Number(item.amount ?? 0), 0);
  const monthPending = items.filter((item) => item.status === "PENDING");
  const errorNotice = actionError && (
    <FeedbackBanner
      error
      message={actionError.message}
      busy={isPending}
      onRetry={() => runAction(actionError.retry)}
      onDismiss={() => setActionError(null)}
    />
  );

  const peopleForFilter = people.filter(
    (p) =>
      p.defaultCurrency === "ARS" ||
      items.some((i) => i.personId === p.id) ||
      carryOverItems.some((i) => i.personId === p.id),
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="page-title">Pagos mensuales</h1>
          <p className="hidden text-sm text-ink-2 sm:block">
            Servicios, gastos y descuentos en un solo lugar.
          </p>
        </div>
        <button
          type="button"
          aria-label="Agregar gasto"
          disabled={people.length === 0 || isPending}
          onClick={() => openExtra()}
          className="btn-primary self-start"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">Agregar gasto</span>
        </button>
      </div>
      {/* El resumen siempre corresponde al mes; los arrastres y filtros se detallan abajo. */}
      <details className="panel group sm:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none flex-col gap-2 rounded-surface px-4 py-3">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm text-ink-2">
              <Clock3 className="size-4 text-ink-3" aria-hidden="true" />
              Pendiente del mes
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span
                className={`num text-right text-lg font-medium ${monthTotal - monthPaid > 0.004 ? "text-warning-ink" : ""}`}
              >
                {formatMoney(monthTotal - monthPaid, "ARS")}
              </span>
              <ChevronDown className="size-4 text-ink-3 transition-transform group-open:rotate-180" />
            </span>
          </span>
          <ProgressBar
            value={monthPaid}
            max={monthTotal}
            tone="success"
            label="Avance de pagos del mes"
          />
        </summary>
        <dl className="space-y-3 border-t border-line p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-ink-2">Total del mes</dt>
            <dd className="text-right tabular-nums">
              {formatMoney(monthTotal, "ARS")}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-ink-2">Pagado</dt>
            <dd className="text-right font-medium text-success-ink tabular-nums">
              {formatMoney(monthPaid, "ARS")}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-ink-2">Pendientes</dt>
            <dd className="text-right tabular-nums">
              {monthPending.length} ·{" "}
              {monthPending.filter((i) => i.amount === null).length} sin importe
            </dd>
          </div>
        </dl>
      </details>
      <div className="hidden gap-4 sm:grid sm:grid-cols-3">
        <div className="panel">
          <Stat
            label="Total del mes"
            icon={Receipt}
            value={formatMoney(monthTotal, "ARS")}
            footer={
              <p className="text-xs text-ink-3 tabular-nums">
                {items.length} conceptos cargados
              </p>
            }
          />
        </div>
        <div className="panel">
          <Stat
            label="Pagado"
            icon={CircleDollarSign}
            value={formatMoney(monthPaid, "ARS")}
            valueClassName="text-success-ink"
            footer={
              <div className="space-y-2">
                <ProgressBar
                  value={monthPaid}
                  max={monthTotal}
                  tone="success"
                  label="Avance de pagos del mes"
                />
                <p className="text-xs text-ink-3 tabular-nums">
                  {monthTotal > 0
                    ? Math.round((monthPaid / monthTotal) * 100)
                    : 0}
                  % del total del mes
                </p>
              </div>
            }
          />
        </div>
        <div className="panel">
          <Stat
            label="Pendiente de pago"
            icon={Clock3}
            value={formatMoney(monthTotal - monthPaid, "ARS")}
            valueClassName={
              monthTotal - monthPaid > 0.004 ? "text-warning-ink" : ""
            }
            footer={
              <div className="flex flex-wrap items-center gap-2">
                {monthPending.length > 0 ? (
                  <PendingTag>{monthPending.length} pendientes</PendingTag>
                ) : (
                  <Tag tone="success" icon={CheckCircle2}>
                    Todo pagado
                  </Tag>
                )}
                {monthPending.filter((i) => i.amount === null).length > 0 && (
                  <Tag tone="neutral">
                    {monthPending.filter((i) => i.amount === null).length} sin
                    importe
                  </Tag>
                )}
              </div>
            }
          />
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CalendarDays
            className="mr-1 hidden size-4 text-ink-3 sm:block"
            aria-hidden="true"
          />
          <Link
            href={`/pagos?periodo=${prevPeriod}&tab=${tab}${colPerson !== "ALL" ? `&persona=${colPerson}` : ""}`}
            aria-label="Ver mes anterior"
            title="Ver mes anterior"
            className="icon-button border border-line bg-surface"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0 flex-1 px-1 text-center sm:flex-none">
            <h2 className="font-display text-base font-medium text-ink tabular-nums">
              {formatPeriodLabel(period)}
            </h2>
          </div>
          <Link
            href={`/pagos?periodo=${nextPeriod}&tab=${tab}${colPerson !== "ALL" ? `&persona=${colPerson}` : ""}`}
            aria-label="Ver mes siguiente"
            title="Ver mes siguiente"
            className="icon-button border border-line bg-surface"
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
          {period !== currentPeriodISO() && (
            <Link href={`/pagos?tab=${tab}`} className="btn-ghost px-3 text-accent-ink">
              Mes actual
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {missingServicesCount > 0 && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleGenerateMonth}
              className="btn-secondary"
            >
              <ListPlus className="size-4" />
              Traer servicios fijos ({missingServicesCount})
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="sticky top-36 z-20 lg:top-20">
          <FeedbackBanner
            message={feedback}
            onDismiss={() => setFeedback(null)}
          />
        </div>
      )}
      {!extraOpen && !settleTarget && actionError && (
        <div className="sticky top-36 z-20 lg:top-20">{errorNotice}</div>
      )}
      <p role="status" className="sr-only">
        {isPending ? "Enviando los cambios…" : ""}
      </p>

      {/* Pestañas + Toggle de Impagos Arrastrados de Meses Anteriores */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Vista"
          className="segmented w-full sm:w-auto"
        >
          <button
            type="button"
            aria-pressed={tab === "grilla"}
            onClick={() => setTab("grilla")}
            className="segmented-item min-h-11 flex-1"
          >
            Vencimientos
          </button>
          <button
            type="button"
            aria-pressed={tab === "resumen"}
            onClick={() => setTab("resumen")}
            className="segmented-item min-h-11 flex-1"
          >
            Por persona
          </button>
        </div>

        {tab === "grilla" && carryOverItems.length > 0 && (
          <div className="flex items-center gap-2 rounded-control border border-orange-line bg-orange-soft/50 pl-3 pr-1 text-ink-2">
            <History className="size-4 shrink-0 text-orange" aria-hidden="true" />
            <ToggleSwitch
              checked={showCarryOver}
              onChange={setShowCarryOver}
              label={`Incluir pendientes anteriores (${carryOverItems.length})`}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex max-w-lg items-start gap-2 text-xs text-ink-3">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" />
          {tab === "grilla"
            ? "Marcar como pagado no descuenta saldo. Usá «Descontar» para registrar el egreso en la cuenta."
            : "Este resumen incluye solo los gastos del mes seleccionado, sin pendientes anteriores."}
        </p>
        <div
          role="group"
          aria-label="Filtrar por persona"
          className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5"
        >
          <button
            type="button"
            aria-pressed={colPerson === "ALL"}
            onClick={() => setColPerson("ALL")}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm transition-colors ${
              colPerson === "ALL"
                ? "border-accent-line bg-accent-soft font-medium text-accent-ink"
                : "border-line bg-surface text-ink-2 hover:border-line-strong/60 hover:text-ink"
            }`}
          >
            Todas
          </button>
          {peopleForFilter.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={colPerson === p.id}
              onClick={() => setColPerson(p.id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm transition-colors ${
                colPerson === p.id
                  ? "border-accent-line bg-accent-soft font-medium text-accent-ink"
                  : "border-line bg-surface text-ink-2 hover:border-line-strong/60 hover:text-ink"
              }`}
            >
              <Avatar name={p.name} seed={p.id} size="sm" />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {tab === "grilla" ? (
        <div className="panel overflow-hidden">
          <div className="space-y-3 border-b border-line bg-subtle p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-ink-3" />
                <input
                  type="search"
                  aria-label="Buscar servicio o nota"
                  placeholder="Buscar servicio o nota…"
                  value={colConcept}
                  onChange={(e) => setColConcept(e.target.value)}
                  className="field pl-10"
                />
              </div>
              <div
                className="segmented"
                role="group"
                aria-label="Estado del pago"
              >
                {(
                  [
                    ["ALL", "Todos"],
                    ["PENDING", "Pendientes"],
                    ["PAID", "Pagados"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={colStatus === value}
                    onClick={() => setColStatus(value)}
                    className="segmented-item min-h-10 flex-1"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <details className="group">
              <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-control px-2 text-sm text-ink-2 hover:bg-muted hover:text-ink">
                <SlidersHorizontal className="size-4" />
                Más filtros
                {(colOrigin !== "ALL" ||
                  colAmountState !== "ALL" ||
                  colSettled !== "ALL") && (
                  <Tag tone="accent">Activos</Tag>
                )}
              </summary>
              <div className="grid gap-4 pt-3 sm:grid-cols-3">
                <label className="field-label">
                  Origen
                  <select
                    value={colOrigin}
                    onChange={(e) =>
                      setColOrigin(e.target.value as typeof colOrigin)
                    }
                    className="field mt-1"
                  >
                    <option value="ALL">Todos los orígenes</option>
                    <option value="CURRENT">Del mes seleccionado</option>
                    <option value="CARRYOVER">Pendientes anteriores</option>
                    <option value="ARREARS">Mes vencido</option>
                    <option value="EXTRA">Extras</option>
                  </select>
                </label>
                <label className="field-label">
                  Importe
                  <select
                    value={colAmountState}
                    onChange={(e) =>
                      setColAmountState(e.target.value as typeof colAmountState)
                    }
                    className="field mt-1"
                  >
                    <option value="ALL">Con y sin importe</option>
                    <option value="WITH">Con importe</option>
                    <option value="WITHOUT">Sin importe</option>
                  </select>
                </label>
                <label className="field-label">
                  Descuento en cuenta
                  <select
                    value={colSettled}
                    onChange={(e) =>
                      setColSettled(e.target.value as typeof colSettled)
                    }
                    className="field mt-1"
                  >
                    <option value="ALL">Todos</option>
                    <option value="SETTLED">Descontados</option>
                    <option value="UNSETTLED">Sin descontar</option>
                  </select>
                </label>
              </div>
            </details>
          </div>
          {/* Barra superior de resumen de filtros */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs text-ink-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
              <span>
                Mostrando <strong>{filteredAndSorted.length}</strong> de{" "}
                {combinedSource.length} ítems
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="text-warning-ink">
                {pendingFilteredCount} pendientes
              </span>
              <span className="hidden sm:inline">·</span>
              <span>
                Pagado:{" "}
                <strong className="font-medium text-success-ink">
                  {formatMoney(paidFilteredTotal, "ARS")}
                </strong>
              </span>
              <span className="hidden sm:inline">·</span>
              <span>
                Total:{" "}
                <strong className="font-medium text-ink">
                  {formatMoney(totalFiltered, "ARS")}
                </strong>
              </span>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex min-h-9 items-center gap-1 rounded-control px-2 text-xs font-medium text-danger-ink hover:bg-danger-soft cursor-pointer"
              >
                <FilterX className="w-3.5 h-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="md:hidden">
            <label className="flex items-center justify-end gap-2 border-b border-line px-4 py-2 text-xs text-ink-3">
              Ordenar
              <select
                aria-label="Orden de los pagos"
                className="field w-auto"
                value={`${sortField}-${sortDir}`}
                onChange={(e) => {
                  const [field, dir] = e.target.value.split("-");
                  setSortField(field as SortField);
                  setSortDir(dir as "asc" | "desc");
                }}
              >
                <option value="dueDate-asc">Vencimiento ↑</option>
                <option value="dueDate-desc">Vencimiento ↓</option>
                <option value="concept-asc">Servicio A–Z</option>
                <option value="concept-desc">Servicio Z–A</option>
                <option value="amount-desc">Mayor importe</option>
                <option value="amount-asc">Menor importe</option>
                <option value="person-asc">Persona A–Z</option>
                <option value="person-desc">Persona Z–A</option>
                <option value="status-asc">Pagados primero</option>
                <option value="status-desc">Pendientes primero</option>
              </select>
            </label>
            <div className="divide-y divide-line">
              {filteredAndSorted.map((item) => (
                <PaymentMobileCard
                  key={item.id}
                  item={item}
                  busy={isPending}
                  canSettle={Boolean(
                    people.find(
                      (p) =>
                        p.id === item.personId &&
                        p.hasManagedAccount &&
                        settleableAccounts(p).length > 0,
                    ) &&
                    !item.settledTransactionId &&
                    Number(item.amount ?? 0) > 0,
                  )}
                  onTogglePaid={() => handleTogglePaid(item)}
                  onAmount={(amount) => handleSaveAmount(item, amount)}
                  onDate={(date) => handleBlurDueDate(item, date)}
                  onSettle={() => handleSettleSingleItem(item)}
                  onDelete={() => handleDeleteItem(item)}
                />
              ))}
            </div>
            {filteredAndSorted.length === 0 && (
              <EmptyState
                title={
                  hasActiveFilters
                    ? "No encontramos coincidencias"
                    : "Todavía no hay gastos"
                }
                description={
                  hasActiveFilters
                    ? "Probá otro concepto o quitá los filtros para ver más pagos."
                    : "Agregá un gasto o traé los servicios del catálogo para empezar."
                }
                action={
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={
                      isPending || (!hasActiveFilters && people.length === 0)
                    }
                    onClick={
                      hasActiveFilters ? clearAllFilters : () => openExtra()
                    }
                  >
                    {hasActiveFilters ? "Limpiar filtros" : "Agregar gasto"}
                  </button>
                }
              />
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table w-full text-sm">
              <caption className="sr-only">
                Vencimientos de {formatPeriodLabel(period)}. Los importes y
                fechas se pueden editar.
              </caption>
              <thead>
                {/* Fila 1: Títulos ordenables */}
                <tr>
                  <th
                    aria-sort={
                      sortField === "status"
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="w-24 px-3 py-2.5 text-center font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("status")}
                      className="inline-flex items-center gap-1 hover:text-ink cursor-pointer"
                    >
                      Estado
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th
                    aria-sort={
                      sortField === "concept"
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="text-left px-3 py-2.5 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("concept")}
                      className="inline-flex items-center gap-1 hover:text-ink cursor-pointer"
                    >
                      Concepto
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th
                    aria-sort={
                      sortField === "person"
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="text-left px-3 py-2.5 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("person")}
                      className="inline-flex items-center gap-1 hover:text-ink cursor-pointer"
                    >
                      Persona
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th
                    aria-sort={
                      sortField === "dueDate"
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="text-right px-3 py-2.5 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("dueDate")}
                      className="inline-flex items-center gap-1 hover:text-ink cursor-pointer"
                    >
                      Vencimiento
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th
                    aria-sort={
                      sortField === "amount"
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="text-right px-3 py-2.5 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("amount")}
                      className="inline-flex items-center gap-1 ml-auto hover:text-ink cursor-pointer"
                    >
                      Monto
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium">
                    Cuenta
                  </th>
                  <th className="w-10 px-2 py-2.5">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredAndSorted.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        title={
                          hasActiveFilters
                            ? "No encontramos coincidencias"
                            : "Todavía no hay gastos"
                        }
                        description={
                          hasActiveFilters
                            ? "Probá otra búsqueda o quitá los filtros."
                            : "Agregá un gasto para comenzar a organizar este mes."
                        }
                        action={
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={
                              isPending ||
                              (!hasActiveFilters && people.length === 0)
                            }
                            onClick={
                              hasActiveFilters
                                ? clearAllFilters
                                : () => openExtra()
                            }
                          >
                            {hasActiveFilters
                              ? "Limpiar filtros"
                              : "Agregar gasto"}
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredAndSorted.map((item) => {
                    const isPaid = item.status === "PAID";
                    const isArrears =
                      Boolean(
                        item.billedPeriod && item.billedPeriod !== item.period,
                      ) || Boolean(item.service?.paysInArrears);
                    const effectiveBilledPeriod =
                      item.billedPeriod ||
                      (item.service?.paysInArrears
                        ? shiftPeriod(item.period, -1)
                        : item.period);

                    const owner = people.find((p) => p.id === item.personId);
                    const canSettleIndividually =
                      owner &&
                      owner.hasManagedAccount &&
                      settleableAccounts(owner).length > 0 &&
                      !item.settledTransactionId &&
                      Number(item.amount ?? 0) > 0;

                    return (
                      <tr
                        key={`${item.isCarryOver ? "co" : "cur"}-${item.id}`}
                        className={
                          item.isCarryOver
                            ? "bg-orange-soft/40 hover:bg-orange-soft/70"
                            : undefined
                        }
                      >
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            disabled={isPending}
                            aria-label={`${isPaid ? "Marcar pendiente" : "Marcar pagado"}: ${item.concept}`}
                            onClick={() => handleTogglePaid(item)}
                            title={
                              isPaid
                                ? "Pagado (clic para pasar a pendiente)"
                                : "Pendiente (clic para marcar pagado)"
                            }
                            className="inline-flex min-h-11 items-center rounded-control px-1 transition-transform active:scale-[0.97] cursor-pointer"
                          >
                            {isPaid ? (
                              <PaidTag />
                            ) : (
                              <PendingTag>Pend.</PendingTag>
                            )}
                          </button>
                        </td>

                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-ink">
                              {item.concept}
                            </span>

                            {item.isCarryOver && (
                              <CarryOverTag>
                                Impago de {formatShortPeriodLabel(item.period)}
                              </CarryOverTag>
                            )}

                            {isArrears && (
                              <Tag
                                tone="neutral"
                                icon={FileClock}
                                title={`Se abona en ${formatPeriodLabel(
                                  item.period,
                                )} pero corresponde al período ${formatPeriodLabel(
                                  effectiveBilledPeriod,
                                )}`}
                              >
                                Período{" "}
                                {formatShortPeriodLabel(effectiveBilledPeriod)}
                              </Tag>
                            )}

                            {item.kind === "EXTRA" && (
                              <Tag tone="iris">Extra</Tag>
                            )}
                          </div>
                          {item.notes && (
                            <p className="text-xs text-ink-3 mt-0.5">
                              {item.notes}
                            </p>
                          )}
                        </td>

                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2 text-sm text-ink-2">
                            <Avatar
                              name={item.person.name}
                              seed={item.personId}
                              size="xs"
                            />
                            {item.person.name}
                          </span>
                        </td>

                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <input
                            type="date"
                            key={item.dueDate ?? "sin-fecha"}
                            aria-label={`Vencimiento de ${item.concept}`}
                            disabled={isPending}
                            defaultValue={item.dueDate ?? ""}
                            onBlur={(e) =>
                              handleBlurDueDate(item, e.target.value)
                            }
                            className="min-h-11 px-2 py-1 rounded-control border border-transparent hover:border-line-strong/60 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20 text-right text-sm tabular-nums text-ink-2 bg-transparent focus:bg-surface"
                          />
                        </td>

                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <InlineMoneyCell
                            disabled={isPending}
                            label={`Importe de ${item.concept}`}
                            amount={item.amount}
                            currency="ARS"
                            onSave={(val) => handleSaveAmount(item, val)}
                          />
                        </td>

                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {item.settledTransactionId ? (
                            <SettledTag>
                              Descontado
                              {item.settledTransaction?.account?.name
                                ? ` · ${item.settledTransaction.account.name}`
                                : ""}
                            </SettledTag>
                          ) : canSettleIndividually ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleSettleSingleItem(item)}
                              title="Descontar este ítem directo en la cuenta de la persona"
                              className="btn-secondary min-h-9 px-2.5"
                            >
                              <ArrowDownToLine className="size-3.5" />
                              Descontar
                            </button>
                          ) : (
                            <span className="text-xs text-ink-3">—</span>
                          )}
                        </td>

                        <td className="px-2 py-2.5 text-right">
                          <button
                            type="button"
                            disabled={isPending}
                            aria-label={`Quitar ${item.concept}`}
                            title={`Quitar ${item.concept}`}
                            onClick={() => handleDeleteItem(item)}
                            className="icon-button icon-button-danger"
                          >
                            <Trash2 className="size-4" />
                          </button>
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
        /* PESTAÑA RESUMEN POR PERSONA */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {peopleForFilter
            .filter((p) => colPerson === "ALL" || p.id === colPerson)
            .map((p) => {
              const pItems = items.filter((i) => i.personId === p.id);
              const total = pItems.reduce(
                (acc, i) => acc + Number(i.amount ?? 0),
                0,
              );
              const unsettledItems = pItems.filter(
                (i) => !i.settledTransactionId && Number(i.amount ?? 0) > 0,
              );
              const unsettledTotal = unsettledItems.reduce(
                (acc, i) => acc + Number(i.amount ?? 0),
                0,
              );

              return (
                <div
                  key={p.id}
                  className="panel flex flex-col justify-between"
                >
                  <div>
                    <div className="panel-header flex-nowrap">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={p.name} seed={p.id} size="md" />
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-medium text-ink">
                            {p.name}
                          </h2>
                          <p className="text-xs text-ink-3">
                            {formatPeriodLabel(period)} · {pItems.length}{" "}
                            conceptos
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-ink-3">Total del mes</p>
                        <p className="num text-xl font-medium text-ink">
                          {formatMoney(total, "ARS")}
                        </p>
                      </div>
                    </div>

                    {pItems.length === 0 ? (
                      <p className="text-sm text-ink-3 py-6 text-center">
                        Sin servicios ni extras en este mes
                      </p>
                    ) : (
                      <div className="divide-y divide-line px-4 text-sm sm:px-5">
                        {pItems.map((it) => {
                          const isArrears =
                            Boolean(
                              it.billedPeriod && it.billedPeriod !== it.period,
                            ) || Boolean(it.service?.paysInArrears);
                          return (
                            <div
                              key={it.id}
                              className="py-2.5 flex items-center justify-between gap-2"
                            >
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                <span className="truncate text-ink">
                                  {it.concept}
                                </span>
                                {isArrears && it.billedPeriod && (
                                  <Tag tone="neutral" icon={FileClock}>
                                    {formatShortPeriodLabel(it.billedPeriod)}
                                  </Tag>
                                )}
                                {it.kind === "EXTRA" && (
                                  <Tag tone="iris">Extra</Tag>
                                )}
                                {it.settledTransactionId && <SettledTag />}
                              </div>
                              <span
                                className={`text-right font-medium shrink-0 tabular-nums ${
                                  it.amount
                                    ? it.status === "PAID"
                                      ? "text-success-ink"
                                      : "text-ink"
                                    : "text-ink-3"
                                }`}
                              >
                                {it.amount
                                  ? formatMoney(it.amount, "ARS")
                                  : "Sin monto"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 rounded-b-surface border-t border-line bg-subtle px-4 py-3 sm:px-5">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setExtraKind("EXTRA");
                        openExtra(p.id);
                      }}
                      className="btn-ghost px-2.5"
                    >
                      <Plus className="size-4" />
                      Agregar extra a {p.name}
                    </button>

                    {p.hasManagedAccount && settleableAccounts(p).length > 0 && (
                      <div>
                        {unsettledTotal > 0 ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => openSettlePersonModal(p)}
                            className="btn-primary max-w-full whitespace-normal tabular-nums"
                          >
                            <ArrowDownToLine className="size-4" />
                            Descontar {formatMoney(unsettledTotal, "ARS")} en
                            cuenta
                          </button>
                        ) : pItems.length > 0 &&
                          pItems.every((item) => item.settledTransactionId) ? (
                          <SettledTag>Mes descontado en cuenta</SettledTag>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          {peopleForFilter.length === 0 && (
            <div className="panel col-span-full">
              <EmptyState
                title="Agregá tu primera persona"
                description="Configurá una persona antes de cargar sus servicios y gastos."
                action={
                  <Link href="/config" className="btn-secondary">
                    Ir a configuración
                  </Link>
                }
              />
            </div>
          )}
        </div>
      )}

      {/* Modal Agregar Extra del Mes */}
      {extraOpen && (
        <Modal
          labelledBy="extra-title"
          onClose={() => {
            setExtraOpen(false);
            setActionError(null);
          }}
          busy={isPending}
        >
          <form onSubmit={handleAddExtra} className="p-4 sm:p-6">
            <fieldset disabled={isPending} className="min-w-0 space-y-4">
              <div className="flex items-center justify-between">
                <h3
                  id="extra-title"
                  className="font-display text-lg font-medium text-ink"
                >
                  Agregar gasto · {formatPeriodLabel(period)}
                </h3>
                <button
                  type="button"
                  aria-label="Cerrar formulario de gasto"
                  title="Cerrar"
                  onClick={() => {
                    setExtraOpen(false);
                    setActionError(null);
                  }}
                  className="icon-button -mr-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {errorNotice}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="extra-person" className="field-label">
                    Persona
                  </label>
                  <select
                    id="extra-person"
                    value={extraPersonId}
                    onChange={(e) => setExtraPersonId(Number(e.target.value))}
                    className="field"
                  >
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="extra-kind" className="field-label">
                    Tipo
                  </label>
                  <select
                    id="extra-kind"
                    value={extraKind}
                    onChange={(e) =>
                      setExtraKind(e.target.value as "EXTRA" | "SERVICE")
                    }
                    className="field"
                  >
                    <option value="EXTRA">Extra puntual del mes</option>
                    <option value="SERVICE">Servicio del mes</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="extra-concept" className="field-label">
                  Concepto
                </label>
                <input
                  id="extra-concept"
                  placeholder="Ej.: cuota del seguro"
                  type="text"
                  required
                  autoFocus
                  value={extraConcept}
                  onChange={(e) => setExtraConcept(e.target.value)}
                  className="field"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="extra-amount" className="field-label">
                    Monto
                  </label>
                  <MoneyInput
                    id="extra-amount"
                    value={extraAmount}
                    onChange={setExtraAmount}
                    currency="ARS"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label htmlFor="extra-due" className="field-label">
                    Fecha / Vencimiento
                  </label>
                  <input
                    id="extra-due"
                    type="date"
                    value={extraDueDate}
                    onChange={(e) => setExtraDueDate(e.target.value)}
                    className="field"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <ToggleSwitch
                  checked={extraPaid}
                  onChange={setExtraPaid}
                  label="Marcar como pagado"
                />
                <ToggleSwitch
                  checked={extraIsArrears}
                  onChange={setExtraIsArrears}
                  activeColor="indigo"
                  label={`Corresponde a ${formatShortPeriodLabel(shiftPeriod(period, -1))}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setExtraOpen(false);
                    setActionError(null);
                  }}
                  className="btn-ghost"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn-primary"
                >
                  {isPending ? "Guardando…" : "Guardar gasto"}
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}

      {/* Modal Descontar en cuenta (ítem individual o resumen del mes) */}
      {settleTarget && (
        <Modal labelledBy="settle-title" onClose={closeSettleModal} busy={isPending}>
          <form onSubmit={handleConfirmSettle} className="p-4 sm:p-6">
            <fieldset disabled={isPending} className="min-w-0 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3
                  id="settle-title"
                  className="min-w-0 break-words font-display text-lg font-medium text-ink"
                >
                  {settleTarget.kind === "item"
                    ? `Descontar ${settleTarget.item.concept}`
                    : "Descontar resumen"}{" "}
                  · {settleTarget.person.name}
                </h3>
                <button
                  type="button"
                  aria-label="Cerrar descuento"
                  title="Cerrar"
                  onClick={closeSettleModal}
                  className="icon-button -mr-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {errorNotice}

              <div className="flex items-baseline justify-between gap-3 rounded-panel border border-accent-line bg-accent-soft px-3 py-2.5">
                <span className="text-xs text-accent-ink">
                  {settleTarget.kind === "item"
                    ? `Importe de ${formatPeriodLabel(settleTarget.item.period)}`
                    : `Pendiente de descontar en ${formatPeriodLabel(period)}`}
                </span>
                <span className="num text-lg font-medium text-accent-ink">
                  {formatMoney(settleAmount, "ARS")}
                </span>
              </div>

              <div>
                <label htmlFor="settle-account" className="field-label">
                  ¿Con qué dinero se paga?
                </label>
                <select
                  id="settle-account"
                  value={settleSourceAccountId}
                  onChange={(e) => setSettleSourceAccountId(Number(e.target.value))}
                  className="field"
                >
                  <optgroup label={`Cuentas de ${settleTarget.person.name}`}>
                    {settleableAccounts(settleTarget.person).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} (saldo {formatMoney(a.balance, a.currency)})
                      </option>
                    ))}
                  </optgroup>
                  {settleLenderGroups.map((g) => (
                    <optgroup
                      key={g.person.id}
                      label={`Pagar con dinero de ${g.person.name}`}
                    >
                      {g.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {g.person.name} · {a.name} (saldo{" "}
                          {formatMoney(a.balance, a.currency)})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {settleLender && (
                <>
                  <div>
                    <label htmlFor="settle-owner-account" className="field-label">
                      Registrar el gasto en la cuenta de {settleTarget.person.name}
                    </label>
                    <select
                      id="settle-owner-account"
                      value={settleOwnerAccountId}
                      onChange={(e) =>
                        setSettleOwnerAccountId(Number(e.target.value))
                      }
                      className="field"
                    >
                      {settleableAccounts(settleTarget.person).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="alert alert-accent gap-2 px-3 py-2.5 text-xs">
                    <Info className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Se registrará un préstamo de{" "}
                      <strong>{settleLender.name}</strong> a{" "}
                      <strong>{settleTarget.person.name}</strong> por{" "}
                      <strong className="tabular-nums">
                        {formatMoney(settleAmount, "ARS")}
                      </strong>
                      . El gasto queda en la cuenta de {settleTarget.person.name}{" "}
                      y la deuda se ve en el resumen general.
                    </span>
                  </p>
                </>
              )}

              {!settleLender && (
                <p className="text-xs text-ink-3">
                  {settleTarget.kind === "item"
                    ? "Se generará un egreso en la cuenta elegida y el ítem quedará marcado como descontado."
                    : `Se generará un único egreso por todos los servicios y extras pendientes de descontar en ${formatPeriodLabel(period)}, dejándolos marcados para no duplicarlos.`}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="settle-date" className="field-label">
                    Fecha del descuento
                  </label>
                  <input
                    id="settle-date"
                    type="date"
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    required
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="settle-concept" className="field-label">
                    Concepto en cuenta
                  </label>
                  <input
                    id="settle-concept"
                    type="text"
                    value={settleConcept}
                    onChange={(e) => setSettleConcept(e.target.value)}
                    required
                    className="field"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeSettleModal}
                  className="btn-ghost"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending || !settleSourceAccountId}
                  className="btn-primary"
                >
                  {isPending ? "Descontando…" : "Confirmar descuento"}
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </div>
  );
}
