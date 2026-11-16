"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  CheckCircle2,
  Circle,
  Trash2,
  ArrowDownToLine,
  ArrowUpDown,
  FilterX,
  History,
  X,
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
} from "@/lib/format";
import { InlineMoneyCell, MoneyInput, ToggleSwitch } from "@/components/ui-controls";

interface MonthlyItemRow {
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

export function MonthlyPaymentsClient({
  period,
  people,
  items,
  carryOverItems,
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tab, setTab] = useState<"grilla" | "resumen">(initialTab);
  const [showCarryOver, setShowCarryOver] = useState(true);

  // Filtros por columna en la Grilla
  const [colStatus, setColStatus] = useState<"ALL" | "PENDING" | "PAID">("ALL");
  const [colConcept, setColConcept] = useState("");
  const [colOrigin, setColOrigin] = useState<
    "ALL" | "CURRENT" | "CARRYOVER" | "ARREARS" | "EXTRA"
  >("ALL");
  const [colPerson, setColPerson] = useState<number | "ALL">(initialPersonFilter);
  const [colAmountState, setColAmountState] = useState<"ALL" | "WITH" | "WITHOUT">("ALL");
  const [colSettled, setColSettled] = useState<"ALL" | "SETTLED" | "UNSETTLED">("ALL");

  // Ordenamiento
  const [sortField, setSortField] = useState<SortField>("dueDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Modal Agregar Extra / Ítem del Mes
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraPersonId, setExtraPersonId] = useState<number>(
    initialPersonFilter !== "ALL" ? initialPersonFilter : (people[0]?.id ?? 0)
  );
  const [extraKind, setExtraKind] = useState<"EXTRA" | "SERVICE">("EXTRA");
  const [extraConcept, setExtraConcept] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [extraDueDate, setExtraDueDate] = useState(`${period}-15`);
  const [extraIsArrears, setExtraIsArrears] = useState(false);
  const [extraPaid, setExtraPaid] = useState(true);

  // Modal Liquidar Resumen de Persona en Subcuenta
  const [settleModalPerson, setSettleModalPerson] = useState<PersonCardSummary | null>(null);
  const [settleAccountId, setSettleAccountId] = useState<number>(0);
  const [settleDate, setSettleDate] = useState<string>(todayISO());
  const [settleConcept, setSettleConcept] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);

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
        cmp = (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99");
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
    0
  );
  const pendingFilteredCount = filteredAndSorted.filter(
    (i) => i.status === "PENDING"
  ).length;
  const paidFilteredTotal = filteredAndSorted
    .filter((i) => i.status === "PAID")
    .reduce((acc, i) => acc + Number(i.amount ?? 0), 0);

  function handleGenerateMonth() {
    startTransition(async () => {
      const res = await generateMonthItemsAction(period);
      setFeedback(
        res.added > 0
          ? `Se agregaron ${res.added} servicios activos a ${formatPeriodLabel(period)}`
          : "Todos los servicios activos ya están cargados en este mes"
      );
      router.refresh();
    });
  }

  function handleTogglePaid(item: MonthlyItemRow) {
    const nextStatus = item.status === "PAID" ? "PENDING" : "PAID";
    startTransition(async () => {
      await updateMonthlyItemAction({
        id: item.id,
        status: nextStatus,
      });
      router.refresh();
    });
  }

  function handleSaveAmount(item: MonthlyItemRow, nextNum: number | null) {
    startTransition(async () => {
      await updateMonthlyItemAction({
        id: item.id,
        amount: nextNum,
      });
      router.refresh();
    });
  }

  function handleBlurDueDate(item: MonthlyItemRow, nextDate: string) {
    if ((item.dueDate ?? "") === nextDate) return;
    startTransition(async () => {
      await updateMonthlyItemAction({
        id: item.id,
        dueDate: nextDate || null,
      });
      router.refresh();
    });
  }

  function handleAddExtra(e: React.FormEvent) {
    e.preventDefault();
    if (!extraConcept.trim()) return;
    const amt = parseMoneyInput(extraAmount);

    startTransition(async () => {
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
      router.refresh();
    });
  }

  function openSettlePersonModal(p: PersonCardSummary) {
    setSettleModalPerson(p);
    setSettleAccountId(p.accounts[0]?.id ?? 0);
    setSettleDate(todayISO());
    setSettleConcept(`Servicios ${formatPeriodLabel(period)}`);
  }

  function handleConfirmSettleSummary(e: React.FormEvent) {
    e.preventDefault();
    if (!settleModalPerson || !settleAccountId) return;
    startTransition(async () => {
      try {
        const res = await settlePersonMonthSummaryAction({
          period,
          personId: settleModalPerson.id,
          accountId: settleAccountId,
          date: settleDate,
          customConcept: settleConcept,
        });
        setFeedback(
          `Descontado ${formatMoney(res.total, "ARS")} (${res.count} ítems) en la cuenta de ${settleModalPerson.name}`
        );
        setSettleModalPerson(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al descontar");
      }
    });
  }

  function handleSettleSingleItem(item: MonthlyItemRow) {
    const owner = people.find((p) => p.id === item.personId);
    if (!owner || owner.accounts.length === 0) return;
    const targetAcc = owner.accounts[0];
    if (
      !confirm(
        `¿Descontar "${item.concept}" (${formatMoney(item.amount, "ARS")}) en la cuenta ${targetAcc.name} de ${owner.name}?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await settleSingleMonthlyItemAction({
          itemId: item.id,
          accountId: targetAcc.id,
        });
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al descontar");
      }
    });
  }

  const peopleForFilter = people.filter(
    (p) =>
      p.defaultCurrency === "ARS" ||
      items.some((i) => i.personId === p.id) ||
      carryOverItems.some((i) => i.personId === p.id)
  );

  return (
    <div className="space-y-5">
      {/* Navegador de Mes + Acciones */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/pagos?periodo=${prevPeriod}&tab=${tab}`}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-48 text-center">
            <h1 className="text-xl font-bold text-slate-900">
              {formatPeriodLabel(period)}
            </h1>
            <p className="text-xs text-slate-500 tabular-nums">
              Total listado: <span className="font-semibold text-slate-700">{formatMoney(totalFiltered, "ARS")}</span> ·{" "}
              {pendingFilteredCount} pendientes
            </p>
          </div>
          <Link
            href={`/pagos?periodo=${nextPeriod}&tab=${tab}`}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {missingServicesCount > 0 && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleGenerateMonth}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 text-xs sm:text-sm font-medium hover:bg-slate-100 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              Traer servicios fijos ({missingServicesCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (colPerson !== "ALL") setExtraPersonId(colPerson);
              setExtraDueDate(`${period}-15`);
              setExtraOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-medium hover:bg-slate-800 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Extra / Gasto del mes
          </button>
        </div>
      </div>

      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm px-4 py-2.5 rounded-xl flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-emerald-700 font-bold cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Pestañas + Toggle de Impagos Arrastrados de Meses Anteriores */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex bg-slate-200/70 p-1 rounded-xl text-xs sm:text-sm font-semibold self-start">
          <button
            type="button"
            onClick={() => setTab("grilla")}
            className={`px-4 py-1.5 rounded-lg transition cursor-pointer ${
              tab === "grilla" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
            }`}
          >
            Grilla de Vencimientos
          </button>
          <button
            type="button"
            onClick={() => setTab("resumen")}
            className={`px-4 py-1.5 rounded-lg transition cursor-pointer ${
              tab === "resumen" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
            }`}
          >
            Resumen y Descuento por Persona
          </button>
        </div>

        {tab === "grilla" && carryOverItems.length > 0 && (
          <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl">
            <History className="w-4 h-4 text-amber-600 shrink-0" />
            <ToggleSwitch
              checked={showCarryOver}
              onChange={setShowCarryOver}
              activeColor="slate"
              label={`Incluir impagos de meses anteriores (${carryOverItems.length})`}
            />
          </div>
        )}
      </div>

      {tab === "grilla" ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Barra superior de resumen de filtros */}
          <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-3 tabular-nums">
              <span>
                Mostrando <strong>{filteredAndSorted.length}</strong> de{" "}
                {combinedSource.length} ítems
              </span>
              <span>·</span>
              <span>
                Pagado: <strong className="text-emerald-700">{formatMoney(paidFilteredTotal, "ARS")}</strong>
              </span>
              <span>·</span>
              <span>
                Total: <strong className="text-slate-900">{formatMoney(totalFiltered, "ARS")}</strong>
              </span>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
              >
                <FilterX className="w-3.5 h-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                {/* Fila 1: Títulos ordenables */}
                <tr className="uppercase">
                  <th className="w-24 px-3 py-2.5 text-center font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("status")}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      Estado
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("concept")}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      Servicio / Concepto
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("person")}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      Persona
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("dueDate")}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      Vencimiento
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("amount")}
                      className="inline-flex items-center gap-1 ml-auto hover:text-slate-900 cursor-pointer"
                    >
                      Monto
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-center px-3 py-2.5 font-semibold">Cuenta</th>
                  <th className="w-10 px-2 py-2.5"></th>
                </tr>

                {/* Fila 2: Filtros por columna */}
                <tr className="border-t border-slate-200/80 bg-slate-100/70">
                  <th className="px-2 py-2">
                    <select
                      value={colStatus}
                      onChange={(e) =>
                        setColStatus(e.target.value as "ALL" | "PENDING" | "PAID")
                      }
                      className="w-full px-1.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-normal text-slate-700"
                    >
                      <option value="ALL">Todos</option>
                      <option value="PENDING">Pendientes</option>
                      <option value="PAID">Pagados</option>
                    </select>
                  </th>
                  <th className="px-2 py-2">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={colConcept}
                        onChange={(e) => setColConcept(e.target.value)}
                        placeholder="Filtrar concepto..."
                        className="flex-1 min-w-28 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-normal text-slate-800 focus:outline-none focus:border-slate-400"
                      />
                      <select
                        value={colOrigin}
                        onChange={(e) =>
                          setColOrigin(
                            e.target.value as
                              | "ALL"
                              | "CURRENT"
                              | "CARRYOVER"
                              | "ARREARS"
                              | "EXTRA"
                          )
                        }
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-normal text-slate-700"
                      >
                        <option value="ALL">Todo tipo</option>
                        <option value="CURRENT">Solo del mes</option>
                        <option value="CARRYOVER">Impagos mes ant.</option>
                        <option value="ARREARS">Mes vencido</option>
                        <option value="EXTRA">Extras</option>
                      </select>
                    </div>
                  </th>
                  <th className="px-2 py-2">
                    <select
                      value={colPerson === "ALL" ? "ALL" : String(colPerson)}
                      onChange={(e) =>
                        setColPerson(
                          e.target.value === "ALL" ? "ALL" : Number(e.target.value)
                        )
                      }
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-normal text-slate-700"
                    >
                      <option value="ALL">Todas</option>
                      {peopleForFilter.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="px-2 py-2 text-[0.6875rem] font-normal text-slate-400">
                    Clic en fecha p/ editar
                  </th>
                  <th className="px-2 py-2">
                    <select
                      value={colAmountState}
                      onChange={(e) =>
                        setColAmountState(e.target.value as "ALL" | "WITH" | "WITHOUT")
                      }
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-normal text-slate-700"
                    >
                      <option value="ALL">Todos</option>
                      <option value="WITH">Con monto</option>
                      <option value="WITHOUT">Sin monto</option>
                    </select>
                  </th>
                  <th className="px-2 py-2">
                    <select
                      value={colSettled}
                      onChange={(e) =>
                        setColSettled(
                          e.target.value as "ALL" | "SETTLED" | "UNSETTLED"
                        )
                      }
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-normal text-slate-700"
                    >
                      <option value="ALL">Todos</option>
                      <option value="SETTLED">Descontados</option>
                      <option value="UNSETTLED">Sin descontar</option>
                    </select>
                  </th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredAndSorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                      <p>No hay servicios que coincidan con el filtro actual.</p>
                      {hasActiveFilters ? (
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
                        >
                          Quitar filtros
                        </button>
                      ) : (
                        missingServicesCount > 0 && (
                          <button
                            type="button"
                            onClick={handleGenerateMonth}
                            className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
                          >
                            Generar mes con catálogo activo
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredAndSorted.map((item) => {
                    const isPaid = item.status === "PAID";
                    const isArrears =
                      Boolean(item.billedPeriod && item.billedPeriod !== item.period) ||
                      Boolean(item.service?.paysInArrears);
                    const effectiveBilledPeriod =
                      item.billedPeriod ||
                      (item.service?.paysInArrears
                        ? shiftPeriod(item.period, -1)
                        : item.period);

                    const owner = people.find((p) => p.id === item.personId);
                    const canSettleIndividually =
                      owner &&
                      owner.hasManagedAccount &&
                      owner.accounts.length > 0 &&
                      !item.settledTransactionId &&
                      Number(item.amount ?? 0) > 0;

                    return (
                      <tr
                        key={`${item.isCarryOver ? "co" : "cur"}-${item.id}`}
                        className={`transition ${
                          item.isCarryOver
                            ? "bg-amber-50/60 hover:bg-amber-50"
                            : isPaid
                            ? "hover:bg-slate-50/70"
                            : "bg-slate-50/30 hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleTogglePaid(item)}
                            title={
                              isPaid
                                ? "Pagado (clic para pasar a pendiente)"
                                : "Pendiente (clic para marcar pagado)"
                            }
                            className="inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Pagado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full">
                                <Circle className="w-3.5 h-3.5" />
                                Pend.
                              </span>
                            )}
                          </button>
                        </td>

                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-slate-900">
                              {item.concept}
                            </span>

                            {item.isCarryOver && (
                              <span className="text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-950">
                                Impago de {formatShortPeriodLabel(item.period)}
                              </span>
                            )}

                            {isArrears && (
                              <span
                                title={`Se abona en ${formatPeriodLabel(
                                  item.period
                                )} pero corresponde al período ${formatPeriodLabel(
                                  effectiveBilledPeriod
                                )}`}
                                className="text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80"
                              >
                                Período {formatShortPeriodLabel(effectiveBilledPeriod)}
                              </span>
                            )}

                            {item.kind === "EXTRA" && (
                              <span className="text-[0.625rem] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                Extra
                              </span>
                            )}
                          </div>
                          {item.notes && (
                            <p className="text-[0.6875rem] text-slate-400 mt-0.5">
                              {item.notes}
                            </p>
                          )}
                        </td>

                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            {item.person.name}
                          </span>
                        </td>

                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <input
                            type="date"
                            defaultValue={item.dueDate ?? ""}
                            onBlur={(e) => handleBlurDueDate(item, e.target.value)}
                            className="px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-slate-400 text-xs text-slate-700 bg-transparent focus:bg-white focus:outline-none"
                          />
                        </td>

                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <InlineMoneyCell
                            amount={item.amount}
                            currency="ARS"
                            onSave={(val) => handleSaveAmount(item, val)}
                          />
                        </td>

                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {item.settledTransactionId ? (
                            <span className="text-[0.6875rem] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                              Descontado
                              {item.settledTransaction?.account?.name
                                ? ` (${item.settledTransaction.account.name})`
                                : ""}
                            </span>
                          ) : canSettleIndividually ? (
                            <button
                              type="button"
                              onClick={() => handleSettleSingleItem(item)}
                              title="Descontar este ítem directo en la cuenta de la persona"
                              className="inline-flex items-center gap-1 text-[0.6875rem] font-medium px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-900 hover:text-white transition cursor-pointer"
                            >
                              <ArrowDownToLine className="w-3 h-3" />
                              Descontar
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-2 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm(`¿Quitar "${item.concept}"?`)) return;
                              startTransition(async () => {
                                await deleteMonthlyItemAction(item.id);
                                router.refresh();
                              });
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
          {peopleForFilter.map((p) => {
            const pItems = items.filter((i) => i.personId === p.id);
            const total = pItems.reduce((acc, i) => acc + Number(i.amount ?? 0), 0);
            const unsettledItems = pItems.filter(
              (i) => !i.settledTransactionId && Number(i.amount ?? 0) > 0
            );
            const unsettledTotal = unsettledItems.reduce(
              (acc, i) => acc + Number(i.amount ?? 0),
              0
            );

            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{p.name}</h2>
                      <p className="text-xs text-slate-500">
                        {formatPeriodLabel(period)} · {pItems.length} conceptos
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="text-xs text-slate-400 uppercase font-semibold">
                        Total Mes
                      </p>
                      <p className="text-xl font-bold text-slate-900">
                        {formatMoney(total, "ARS")}
                      </p>
                    </div>
                  </div>

                  {pItems.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      Sin servicios ni extras en este mes
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 text-sm">
                      {pItems.map((it) => {
                        const isArrears =
                          Boolean(it.billedPeriod && it.billedPeriod !== it.period) ||
                          Boolean(it.service?.paysInArrears);
                        return (
                          <div
                            key={it.id}
                            className="py-2 flex items-center justify-between gap-2"
                          >
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              <span className="truncate text-slate-800">
                                {it.concept}
                              </span>
                              {isArrears && it.billedPeriod && (
                                <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                                  {formatShortPeriodLabel(it.billedPeriod)}
                                </span>
                              )}
                              {it.kind === "EXTRA" && (
                                <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                                  Extra
                                </span>
                              )}
                              {it.settledTransactionId && (
                                <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                                  Descontado
                                </span>
                              )}
                            </div>
                            <span className="font-semibold text-slate-900 shrink-0 tabular-nums">
                              {it.amount ? formatMoney(it.amount, "ARS") : "Sin monto"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setExtraPersonId(p.id);
                      setExtraKind("EXTRA");
                      setExtraDueDate(`${period}-15`);
                      setExtraOpen(true);
                    }}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    + Agregar extra a {p.name}
                  </button>

                  {p.hasManagedAccount && p.accounts.length > 0 && (
                    <div>
                      {unsettledTotal > 0 ? (
                        <button
                          type="button"
                          onClick={() => openSettlePersonModal(p)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer tabular-nums"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                          Descontar {formatMoney(unsettledTotal, "ARS")} en cuenta
                        </button>
                      ) : pItems.length > 0 ? (
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                          Mes descontado en cuenta
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Agregar Extra del Mes */}
      {extraOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAddExtra}
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Agregar gasto al mes · {formatPeriodLabel(period)}
              </h3>
              <button
                type="button"
                onClick={() => setExtraOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Persona
                </label>
                <select
                  value={extraPersonId}
                  onChange={(e) => setExtraPersonId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tipo
                </label>
                <select
                  value={extraKind}
                  onChange={(e) =>
                    setExtraKind(e.target.value as "EXTRA" | "SERVICE")
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                >
                  <option value="EXTRA">Extra puntual del mes</option>
                  <option value="SERVICE">Servicio del mes</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Concepto (ej: Impuestos, Remedios, Cuota compra, Nafta...)
              </label>
              <input
                type="text"
                required
                autoFocus
                value={extraConcept}
                onChange={(e) => setExtraConcept(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Monto
                </label>
                <MoneyInput
                  value={extraAmount}
                  onChange={setExtraAmount}
                  currency="ARS"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Fecha / Vencimiento
                </label>
                <input
                  type="date"
                  value={extraDueDate}
                  onChange={(e) => setExtraDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
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
                onClick={() => setExtraOpen(false)}
                className="min-h-11 px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="min-h-11 px-4 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Confirmar Descuento del Resumen Mensual en Subcuenta */}
      {settleModalPerson && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmSettleSummary}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Descontar resumen · {settleModalPerson.name}
              </h3>
              <button
                type="button"
                onClick={() => setSettleModalPerson(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Se generará un movimiento de salida en la cuenta elegida por todos los
              servicios y extras pendientes de descontar en{" "}
              <strong>{formatPeriodLabel(period)}</strong>, dejándolos marcados para no
              duplicarlos.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                ¿De qué cuenta descontar?
              </label>
              <select
                value={settleAccountId}
                onChange={(e) => setSettleAccountId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {settleModalPerson.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (Saldo actual: {formatMoney(a.balance, a.currency)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Fecha del descuento
                </label>
                <input
                  type="date"
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Concepto en cuenta
                </label>
                <input
                  type="text"
                  value={settleConcept}
                  onChange={(e) => setSettleConcept(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSettleModalPerson(null)}
                className="min-h-11 px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="min-h-11 px-4 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
              >
                Confirmar descuento
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
