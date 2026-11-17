"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FilterX,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { AccountSummary, PersonCardSummary } from "@/lib/queries";
import type { PublicNotificationSettings } from "@/lib/notifications";
import {
  createPersonAction,
  updatePersonAction,
  deletePersonAction,
  createAccountAction,
  updateAccountAction,
  deleteAccountAction,
  setDefaultAccountAction,
  updateServiceScheduleAction,
  updateShareSettingsAction,
  createServiceAction,
  toggleServiceActiveAction,
  toggleServiceArrearsAction,
  updateServiceDueDayAction,
  deleteServiceAction,
} from "@/app/actions";
import { formatMoney, formatNumberAR, parseMoneyInput } from "@/lib/format";
import { MoneyInput, ToggleSwitch } from "@/components/ui-controls";
import { NotificationSettingsCard } from "@/components/notification-settings-card";
import { EmptyState } from "@/components/ui-feedback";
import { Modal } from "@/components/modal";
import {
  FREQUENCY_OPTIONS,
  monthNameAR,
  scheduledMonths,
} from "@/lib/service-schedule";

interface ServiceItem {
  id: number;
  personId: number;
  name: string;
  defaultDueDay: number | null;
  defaultAmount: string | null;
  paysInArrears: boolean;
  frequencyMonths: number;
  startMonth: number;
  notes: string | null;
  isActive: boolean;
  person: { id: number; name: string };
}

export function ConfigClient({
  people,
  services,
  notificationSettings,
  notificationDevices,
}: {
  people: PersonCardSummary[];
  services: ServiceItem[];
  notificationSettings: PublicNotificationSettings;
  notificationDevices: Array<{
    id: number;
    endpoint: string;
    deviceLabel: string;
    createdAt: string;
  }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form Nueva Persona
  const [pName, setPName] = useState("");
  const [pCurrency, setPCurrency] = useState<"ARS" | "USD">("ARS");
  const [pAccName, setPAccName] = useState("Principal");
  const [pPassword, setPPassword] = useState("");

  // Modal Editar Persona + Contraseña + Subcuentas
  const [editingPerson, setEditingPerson] = useState<PersonCardSummary | null>(
    null,
  );
  const [epName, setEpName] = useState("");
  const [epCurrency, setEpCurrency] = useState<"ARS" | "USD">("ARS");
  const [epNotes, setEpNotes] = useState("");
  const [epManaged, setEpManaged] = useState(true);
  const [epShareEnabled, setEpShareEnabled] = useState(true);
  const [epPassword, setEpPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Subcuentas dentro del modal de persona
  const [newSubName, setNewSubName] = useState("");
  const [newSubInitial, setNewSubInitial] = useState("0,00");
  const [editingAccId, setEditingAccId] = useState<number | null>(null);
  const [editAccName, setEditAccName] = useState("");
  const [editAccInitial, setEditAccInitial] = useState("");

  // Form Nuevo Servicio Fijo
  const [sPersonId, setSPersonId] = useState<number>(people[0]?.id ?? 0);
  const [sName, setSName] = useState("");
  const [sDueDay, setSDueDay] = useState("10");
  const [sNotes, setSNotes] = useState("");
  const [sArrears, setSArrears] = useState(false);
  const [sFrequency, setSFrequency] = useState(1);
  const [sStartMonth, setSStartMonth] = useState(new Date().getMonth() + 1);

  // Filtros por columna del Catálogo de Servicios
  const [fPerson, setFPerson] = useState<number | "ALL">("ALL");
  const [fName, setFName] = useState("");
  const [fArrears, setFArrears] = useState<"ALL" | "ARREARS" | "CURRENT">(
    "ALL",
  );
  const [fActive, setFActive] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const filteredServices = useMemo(() => {
    const q = fName.trim().toLowerCase();
    return services.filter((s) => {
      if (fPerson !== "ALL" && s.personId !== fPerson) return false;
      if (q && !`${s.name} ${s.notes ?? ""}`.toLowerCase().includes(q))
        return false;
      if (fArrears === "ARREARS" && !s.paysInArrears) return false;
      if (fArrears === "CURRENT" && s.paysInArrears) return false;
      if (fActive === "ACTIVE" && !s.isActive) return false;
      if (fActive === "INACTIVE" && s.isActive) return false;
      return true;
    });
  }, [services, fPerson, fName, fArrears, fActive]);

  const hasFilters =
    fPerson !== "ALL" ||
    fName.trim() !== "" ||
    fArrears !== "ALL" ||
    fActive !== "ALL";

  function openEditPersonModal(p: PersonCardSummary) {
    setEditingPerson(p);
    setEpName(p.name);
    setEpCurrency(p.defaultCurrency as "ARS" | "USD");
    setEpNotes(p.notes ?? "");
    setEpManaged(p.hasManagedAccount);
    setEpShareEnabled(p.shareEnabled);
    setEpPassword(p.sharePin ?? "");
    setShowPass(false);
    setEditingAccId(null);
    setNewSubName("");
    setNewSubInitial("0,00");
  }

  function handleAddPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!pName.trim()) return;
    startTransition(async () => {
      const created = await createPersonAction({
        name: pName,
        defaultCurrency: pCurrency,
        initialAccountName: pAccName,
      });
      if (pPassword.trim()) {
        await updateShareSettingsAction({
          personId: created.id,
          shareEnabled: true,
          sharePin: pPassword.trim(),
        });
      }
      setPName("");
      setPPassword("");
      router.refresh();
    });
  }

  function handleSavePerson(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPerson || !epName.trim()) return;
    startTransition(async () => {
      await updatePersonAction({
        id: editingPerson.id,
        name: epName,
        defaultCurrency: epCurrency,
        notes: epNotes,
        hasManagedAccount: epManaged,
        shareEnabled: epShareEnabled,
        sharePin: epPassword,
      });
      setEditingPerson(null);
      router.refresh();
    });
  }

  function handleRegenerateLink() {
    if (!editingPerson) return;
    startTransition(async () => {
      const res = await updateShareSettingsAction({
        personId: editingPerson.id,
        shareEnabled: epShareEnabled,
        sharePin: epPassword,
        regenerateToken: true,
      });
      setEditingPerson({ ...editingPerson, shareToken: res.shareToken });
      router.refresh();
    });
  }

  function handleDeletePerson() {
    if (!editingPerson) return;
    if (
      !confirm(
        `¿Seguro que querés eliminar a "${editingPerson.name}" y todas sus cuentas/movimientos? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deletePersonAction(editingPerson.id);
      setEditingPerson(null);
      router.refresh();
    });
  }

  function startEditAcc(acc: AccountSummary) {
    setEditingAccId(acc.id);
    setEditAccName(acc.name);
    setEditAccInitial(formatNumberAR(acc.initialBalance, 2));
  }

  function handleSaveAcc(accId: number) {
    if (!editAccName.trim()) return;
    startTransition(async () => {
      await updateAccountAction({
        id: accId,
        name: editAccName,
        initialBalance: parseMoneyInput(editAccInitial) ?? 0,
      });
      setEditingAccId(null);
      router.refresh();
    });
  }

  function handleAddSubaccountInModal(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPerson || !newSubName.trim()) return;
    startTransition(async () => {
      await createAccountAction({
        personId: editingPerson.id,
        name: newSubName,
        currency: epCurrency,
        initialBalance: parseMoneyInput(newSubInitial) ?? 0,
      });
      setNewSubName("");
      setNewSubInitial("0,00");
      setEditingPerson(null);
      router.refresh();
    });
  }

  function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!sName.trim()) return;
    startTransition(async () => {
      await createServiceAction({
        personId: sPersonId,
        name: sName,
        defaultDueDay: Number(sDueDay) || null,
        paysInArrears: sArrears,
        frequencyMonths: sFrequency,
        startMonth: sStartMonth,
        notes: sNotes,
      });
      setSName("");
      setSNotes("");
      setSArrears(false);
      setSFrequency(1);
      router.refresh();
    });
  }

  // Sincronizar datos frescos de la persona abierta en modal tras refresh
  const liveEditingPerson = editingPerson
    ? (people.find((p) => p.id === editingPerson.id) ?? editingPerson)
    : null;

  const shareUrl =
    typeof window !== "undefined" && liveEditingPerson?.shareToken
      ? `${window.location.origin}/v/${liveEditingPerson.shareToken}`
      : liveEditingPerson?.shareToken
        ? `/v/${liveEditingPerson.shareToken}`
        : "";

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Tu espacio familiar</p>
          <h1 className="page-title">Configuración</h1>
          <p className="text-sm text-slate-600">
            Personas, servicios y preferencias de tu administración.
          </p>
        </div>

        <a href="/api/export" className="btn-secondary self-start">
          <Download className="w-4 h-4" />
          Descargar backup
        </a>
      </div>

      <nav
        aria-label="Secciones de configuración"
        className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-3"
      >
        <a href="#personas" className="btn-ghost text-xs">
          Personas y cuentas
        </a>
        <a href="#servicios" className="btn-ghost text-xs">
          Servicios fijos
        </a>
        <a href="#notificaciones" className="btn-ghost text-xs">
          Notificaciones
        </a>
      </nav>

      {/* SECCIÓN 1: PERSONAS, CONTRASEÑAS Y SUBCUENTAS */}
      <section
        id="personas"
        className="panel scroll-mt-36 p-4 sm:p-6 space-y-6"
      >
        <div>
          <h2 className="text-base font-medium text-slate-900">
            Personas y cuentas
          </h2>
          <p className="text-xs text-slate-600">
            Administrá subcuentas y habilitá el acceso de cada persona a su
            resumen.
          </p>
        </div>

        {/* Tarjetas de Personas existentes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {people.map((p) => {
            const hasPassword = Boolean(
              p.sharePin && p.sharePin.trim().length > 0,
            );
            return (
              <div
                key={p.id}
                className="p-4 rounded-2xl border border-slate-200 flex flex-col justify-between gap-3 hover:border-slate-300 transition"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900">{p.name}</h3>
                        <span className="text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {p.defaultCurrency}
                        </span>
                      </div>
                      {p.notes && (
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">
                          {p.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Estado de cuenta / saldo */}
                  <div className="text-xs text-slate-600 tabular-nums">
                    {p.hasManagedAccount ? (
                      <>
                        <span>Saldo total: </span>
                        <strong className="text-slate-900">
                          {formatMoney(p.totalBalance, p.defaultCurrency)}
                        </strong>
                        <span className="text-slate-600">
                          {" "}
                          · {p.accounts.map((a) => a.name).join(", ")}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-600">
                        Solo servicios mensuales (sin cuenta administrada)
                      </span>
                    )}
                  </div>

                  {/* Estado de acceso familiar */}
                  <div className="pt-1">
                    {!p.shareEnabled ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        Acceso familiar desactivado
                      </span>
                    ) : hasPassword ? (
                      <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        <KeyRound className="w-3 h-3" />
                        Con contraseña asignada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
                        Link activo (sin contraseña aún)
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => openEditPersonModal(p)}
                    className="btn-secondary text-xs"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar persona
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Formulario Agregar Nueva Persona */}
        {people.length === 0 && (
          <EmptyState
            title="Todavía no hay personas"
            description="Abrí «Agregar persona» para crear la primera cuenta familiar."
          />
        )}
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-sm font-medium">
            <Plus className="size-4" />
            Agregar persona
          </summary>
          <form
            onSubmit={handleAddPerson}
            className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-4"
          >
            <div className="sm:col-span-3">
              <label className="field-label" htmlFor="person-name">
                Nombre
              </label>
              <input
                id="person-name"
                type="text"
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="Nueva persona (ej: Papá)"
                className="field"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="person-currency">
                Moneda
              </label>
              <select
                id="person-currency"
                value={pCurrency}
                onChange={(e) => setPCurrency(e.target.value as "ARS" | "USD")}
                className="field"
              >
                <option value="ARS">Pesos (ARS)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="field-label" htmlFor="person-account">
                Primera cuenta
              </label>
              <input
                id="person-account"
                type="text"
                value={pAccName}
                onChange={(e) => setPAccName(e.target.value)}
                placeholder="1° cuenta (ej: Principal)"
                className="field"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="person-password">
                Clave familiar (opcional)
              </label>
              <input
                id="person-password"
                type="password"
                autoComplete="new-password"
                value={pPassword}
                onChange={(e) => setPPassword(e.target.value)}
                placeholder="Clave familiar (opc.)"
                className="field"
              />
            </div>
            <div className="sm:col-span-2 sm:self-end">
              <button
                type="submit"
                disabled={isPending}
                className="w-full min-h-11 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 cursor-pointer"
              >
                + Crear Persona
              </button>
            </div>
          </form>
        </details>
      </section>

      {/* SECCIÓN 2: CATÁLOGO DE SERVICIOS FIJOS */}
      <section id="servicios" className="panel scroll-mt-36 overflow-hidden">
        <div className="p-5 sm:p-6 space-y-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-medium text-slate-900">
              Servicios fijos
            </h2>
            <p className="text-xs text-slate-600">
              Este catálogo se reutiliza según la frecuencia de cada servicio
              (mensual, bimestral…). «Mes vencido» indica que la factura
              corresponde al mes anterior.
            </p>
          </div>

          <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-sm font-medium">
              <Plus className="size-4" />
              Agregar servicio fijo
            </summary>
            <form
              onSubmit={handleAddService}
              className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-4 items-end"
            >
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="service-person">
                  Persona
                </label>
                <select
                  id="service-person"
                  value={sPersonId}
                  onChange={(e) => setSPersonId(Number(e.target.value))}
                  className="field"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="field-label" htmlFor="service-name">
                  Servicio
                </label>
                <input
                  id="service-name"
                  type="text"
                  required
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  placeholder="Nombre servicio..."
                  className="field"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="service-day">
                  Día de vencimiento
                </label>
                <input
                  id="service-day"
                  type="number"
                  min={1}
                  max={31}
                  value={sDueDay}
                  onChange={(e) => setSDueDay(e.target.value)}
                  placeholder="Día venc."
                  title="Día aproximado de vencimiento (1-31)"
                  className="field text-right tabular-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="service-notes">
                  Nota (opcional)
                </label>
                <input
                  id="service-notes"
                  type="text"
                  value={sNotes}
                  onChange={(e) => setSNotes(e.target.value)}
                  placeholder="Nota / N° cliente"
                  className="field"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="field-label" htmlFor="service-frequency">
                  Frecuencia
                </label>
                <select
                  id="service-frequency"
                  value={sFrequency}
                  onChange={(e) => setSFrequency(Number(e.target.value))}
                  className="field"
                >
                  {FREQUENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {sFrequency > 1 && (
                <div className="sm:col-span-3">
                  <label className="field-label" htmlFor="service-start-month">
                    Primer mes de pago
                  </label>
                  <select
                    id="service-start-month"
                    value={sStartMonth}
                    onChange={(e) => setSStartMonth(Number(e.target.value))}
                    className="field"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {monthNameAR(m)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {sFrequency > 1 && (
                <p className="sm:col-span-12 text-xs text-slate-600">
                  Se carga en:{" "}
                  <strong>
                    {scheduledMonths({
                      frequencyMonths: sFrequency,
                      startMonth: sStartMonth,
                    })
                      .map(monthNameAR)
                      .join(", ")}
                  </strong>
                  . El importe habitual es el de cada factura.
                </p>
              )}
              <div className="sm:col-span-3 flex items-center justify-between sm:justify-end gap-3">
                <ToggleSwitch
                  checked={sArrears}
                  onChange={setSArrears}
                  activeColor="indigo"
                  label="Mes vencido"
                />
                <button
                  type="submit"
                  disabled={isPending || people.length === 0}
                  className="min-h-11 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 shrink-0 cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Agregar
                </button>
              </div>
            </form>
          </details>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
              <tr className="uppercase">
                <th className="text-left px-4 py-2.5 font-semibold">Persona</th>
                <th className="text-left px-4 py-2.5 font-semibold">
                  Servicio / Nota
                </th>
                <th className="text-center px-3 py-2.5 font-semibold">
                  Venc. aprox.
                </th>
                <th className="text-left px-3 py-2.5 font-semibold">
                  Frecuencia
                </th>
                <th className="text-center px-3 py-2.5 font-semibold">
                  Mes vencido
                </th>
                <th className="text-center px-3 py-2.5 font-semibold">
                  Activo
                </th>
                <th className="w-12 px-3 py-2.5">
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setFPerson("ALL");
                        setFName("");
                        setFArrears("ALL");
                        setFActive("ALL");
                      }}
                      title="Limpiar filtros"
                      className="text-rose-600 hover:text-rose-700 cursor-pointer"
                    >
                      <FilterX className="w-4 h-4" />
                    </button>
                  )}
                </th>
              </tr>
              <tr className="border-t border-slate-200/80 bg-slate-100">
                <th className="px-3 py-2">
                  <select
                    value={fPerson === "ALL" ? "ALL" : String(fPerson)}
                    onChange={(e) =>
                      setFPerson(
                        e.target.value === "ALL"
                          ? "ALL"
                          : Number(e.target.value),
                      )
                    }
                    className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-normal text-slate-700"
                  >
                    <option value="ALL">Todas</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="Filtrar por nombre o póliza..."
                    className="w-full px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-normal text-slate-800 focus:outline-none focus:border-slate-400"
                  />
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">
                  Día del mes
                </th>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">
                  <select
                    value={fArrears}
                    onChange={(e) =>
                      setFArrears(
                        e.target.value as "ALL" | "ARREARS" | "CURRENT",
                      )
                    }
                    className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-normal text-slate-700"
                  >
                    <option value="ALL">Todos</option>
                    <option value="ARREARS">Mes vencido</option>
                    <option value="CURRENT">Mes en curso</option>
                  </select>
                </th>
                <th className="px-3 py-2">
                  <select
                    value={fActive}
                    onChange={(e) =>
                      setFActive(
                        e.target.value as "ALL" | "ACTIVE" | "INACTIVE",
                      )
                    }
                    className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-normal text-slate-700"
                  >
                    <option value="ALL">Todos</option>
                    <option value="ACTIVE">Activos</option>
                    <option value="INACTIVE">Inactivos</option>
                  </select>
                </th>
                <th></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {filteredServices.map((srv) => (
                <tr key={srv.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {srv.person.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${
                        srv.isActive
                          ? "text-slate-900"
                          : "text-slate-600 line-through"
                      }`}
                    >
                      {srv.name}
                    </span>
                    {srv.notes && (
                      <span className="text-xs text-slate-600 ml-2">
                        · {srv.notes}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-slate-600">
                    <div className="inline-flex items-center justify-center gap-1">
                      <span className="text-slate-600">Día</span>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        defaultValue={srv.defaultDueDay ?? ""}
                        placeholder="—"
                        title="Cambiar día de vencimiento mensual (1 a 31)"
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const nextVal = raw === "" ? null : Number(raw);
                          if (nextVal === (srv.defaultDueDay ?? null)) return;
                          startTransition(async () => {
                            await updateServiceDueDayAction(srv.id, nextVal);
                            router.refresh();
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-14 px-2 py-1 text-center rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 tabular-nums focus:outline-none focus:border-slate-900"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-40 flex-col gap-1">
                      <select
                        value={srv.frequencyMonths}
                        disabled={isPending}
                        aria-label={`Frecuencia de ${srv.name}`}
                        onChange={(e) =>
                          startTransition(async () => {
                            await updateServiceScheduleAction({
                              id: srv.id,
                              frequencyMonths: Number(e.target.value),
                              startMonth: srv.startMonth,
                            });
                            router.refresh();
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                      >
                        {FREQUENCY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {srv.frequencyMonths > 1 && (
                        <>
                          <select
                            value={srv.startMonth}
                            disabled={isPending}
                            aria-label={`Primer mes de pago de ${srv.name}`}
                            onChange={(e) =>
                              startTransition(async () => {
                                await updateServiceScheduleAction({
                                  id: srv.id,
                                  frequencyMonths: srv.frequencyMonths,
                                  startMonth: Number(e.target.value),
                                });
                                router.refresh();
                              })
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(
                              (m) => (
                                <option key={m} value={m}>
                                  Desde {monthNameAR(m).toLowerCase()}
                                </option>
                              ),
                            )}
                          </select>
                          <span className="text-[0.6875rem] text-slate-600">
                            {scheduledMonths(srv)
                              .map((m) => monthNameAR(m).slice(0, 3))
                              .join(" · ")}
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="inline-flex justify-center">
                      <ToggleSwitch
                        checked={srv.paysInArrears}
                        ariaLabel={`Mes vencido de ${srv.name}`}
                        activeColor="indigo"
                        disabled={isPending}
                        onChange={(next) =>
                          startTransition(async () => {
                            await toggleServiceArrearsAction(srv.id, next);
                            router.refresh();
                          })
                        }
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="inline-flex justify-center">
                      <ToggleSwitch
                        checked={srv.isActive}
                        ariaLabel={`Servicio activo: ${srv.name}`}
                        activeColor="emerald"
                        disabled={isPending}
                        onChange={(next) =>
                          startTransition(async () => {
                            await toggleServiceActiveAction(srv.id, next);
                            router.refresh();
                          })
                        }
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      disabled={isPending}
                      aria-label={`Eliminar ${srv.name} del catálogo`}
                      onClick={() => {
                        if (!confirm(`¿Eliminar "${srv.name}" del catálogo?`))
                          return;
                        startTransition(async () => {
                          await deleteServiceAction(srv.id);
                          router.refresh();
                        });
                      }}
                      className="icon-button hover:text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredServices.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title={
                        hasFilters
                          ? "No hay servicios con estos filtros"
                          : "Tu catálogo está vacío"
                      }
                      description={
                        hasFilters
                          ? "Quitá los filtros para ver todos los servicios."
                          : "Abrí «Agregar servicio fijo» para cargar uno que se repita cada mes."
                      }
                      action={
                        hasFilters ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              setFPerson("ALL");
                              setFName("");
                              setFArrears("ALL");
                              setFActive("ALL");
                            }}
                          >
                            Limpiar filtros
                          </button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <NotificationSettingsCard
        settings={notificationSettings}
        devices={notificationDevices}
      />

      {/* MODAL EDITAR PERSONA, CONTRASEÑA Y SUBCUENTAS */}
      {liveEditingPerson && (
        <Modal
          labelledBy="edit-person-title"
          onClose={() => setEditingPerson(null)}
          busy={isPending}
        >
          <fieldset
            disabled={isPending}
            className="min-w-0 p-4 sm:p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3
                id="edit-person-title"
                className="text-base font-semibold text-slate-900"
              >
                Configurar persona · {liveEditingPerson.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingPerson(null)}
                aria-label="Cerrar edición de persona"
                className="icon-button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePerson} className="space-y-5">
              {/* 1. Datos básicos */}
              <div className="space-y-3">
                <h4 className="text-xs uppercase tracking-wider font-bold text-slate-700">
                  1. Datos generales
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Nombre
                    </label>
                    <input
                      type="text"
                      required
                      value={epName}
                      onChange={(e) => setEpName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Moneda base
                    </label>
                    <select
                      value={epCurrency}
                      onChange={(e) =>
                        setEpCurrency(e.target.value as "ARS" | "USD")
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="ARS">ARS ($)</option>
                      <option value="USD">USD (US$)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Descripción / Notas
                  </label>
                  <input
                    type="text"
                    value={epNotes}
                    onChange={(e) => setEpNotes(e.target.value)}
                    placeholder="Ej: Cuentas Cocos y Balanz + servicios..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>

                <ToggleSwitch
                  checked={epManaged}
                  onChange={setEpManaged}
                  label="Llevar cuenta y saldo administrado en Inicio"
                />
              </div>

              {/* 2. Acceso Familiar y Contraseña */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-slate-700">
                    2. Acceso y contraseña para ver sus datos
                  </h4>
                  <ToggleSwitch
                    checked={epShareEnabled}
                    onChange={setEpShareEnabled}
                    label="Habilitado"
                  />
                </div>

                {epShareEnabled && (
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Contraseña de {epName || liveEditingPerson.name}
                      </label>
                      <div className="relative">
                        <input
                          type={showPass ? "text" : "password"}
                          value={epPassword}
                          onChange={(e) => setEpPassword(e.target.value)}
                          placeholder="Escribí una clave (ej: mama2026 o 4821)..."
                          className="w-full pl-3 pr-10 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          {showPass ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Con esta contraseña puede entrar en{" "}
                        <strong>/login → Acceso Familiar</strong> escribiendo su
                        nombre (<strong>{epName}</strong>) y su clave. Si la
                        dejás vacía, podrá entrar directo solo con el link
                        privado.
                      </p>
                    </div>

                    {shareUrl && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-slate-700">
                            Enlace directo (WhatsApp)
                          </label>
                          <button
                            type="button"
                            onClick={handleRegenerateLink}
                            className="inline-flex items-center gap-1 text-[0.6875rem] text-slate-600 hover:text-rose-600 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Cambiar link
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={shareUrl}
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-600"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(shareUrl);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
                          >
                            {copiedLink ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            {copiedLink ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botones guardar datos principales */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                {!liveEditingPerson.isOwn ? (
                  <button
                    type="button"
                    onClick={handleDeletePerson}
                    className="text-xs font-medium text-rose-600 hover:text-rose-700 cursor-pointer"
                  >
                    Eliminar persona
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPerson(null)}
                    className="min-h-11 px-3.5 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="min-h-11 px-4 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
                  >
                    Guardar cambios
                  </button>
                </div>
              </div>
            </form>

            {/* 3. Administración de Subcuentas / Billeteras */}
            {epManaged && (
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <h4 className="text-xs uppercase tracking-wider font-bold text-slate-700">
                  3. Subcuentas / Billeteras (
                  {liveEditingPerson.accounts.length})
                </h4>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden text-xs">
                  {liveEditingPerson.accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="p-2.5 bg-white flex items-center justify-between gap-2"
                    >
                      {editingAccId === acc.id ? (
                        <div className="flex-1 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editAccName}
                            onChange={(e) => setEditAccName(e.target.value)}
                            className="px-2 py-1 rounded border border-slate-300 text-xs w-28"
                          />
                          <div className="w-36">
                            <MoneyInput
                              value={editAccInitial}
                              onChange={setEditAccInitial}
                              currency={acc.currency}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSaveAcc(acc.id)}
                            className="px-2.5 py-1 rounded bg-slate-900 text-white font-medium cursor-pointer"
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAccId(null)}
                            className="px-2 py-1 text-slate-600 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="tabular-nums">
                            <span className="font-semibold text-slate-900">
                              {acc.name}
                            </span>{" "}
                            {acc.isDefault && (
                              <span className="mr-1 inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-indigo-800">
                                <Star className="h-3 w-3" />
                                Predeterminada
                              </span>
                            )}
                            <span className="text-slate-600">
                              · Inicial:{" "}
                              {formatMoney(acc.initialBalance, acc.currency)} ·
                              Actual:{" "}
                            </span>
                            <strong className="text-slate-800">
                              {formatMoney(acc.balance, acc.currency)}
                            </strong>
                          </div>
                          <div className="flex items-center gap-1">
                            {!acc.isDefault && acc.isActive && (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  startTransition(async () => {
                                    await setDefaultAccountAction(acc.id);
                                    router.refresh();
                                  })
                                }
                                title="Usar como cuenta predeterminada"
                                aria-label={`Usar ${acc.name} como cuenta predeterminada`}
                                className="p-1.5 rounded hover:bg-indigo-50 text-slate-500 hover:text-indigo-700 cursor-pointer"
                              >
                                <Star className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startEditAcc(acc)}
                              title="Editar nombre o saldo inicial"
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {liveEditingPerson.accounts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    !confirm(
                                      `¿Eliminar la subcuenta "${acc.name}" y sus movimientos?`,
                                    )
                                  ) {
                                    return;
                                  }
                                  startTransition(async () => {
                                    await deleteAccountAction(acc.id);
                                    setEditingPerson(null);
                                    router.refresh();
                                  });
                                }}
                                title="Eliminar subcuenta"
                                className="p-1.5 rounded hover:bg-rose-50 text-slate-500 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Agregar otra subcuenta rápido */}
                <form
                  onSubmit={handleAddSubaccountInModal}
                  className="flex flex-wrap items-center gap-2 pt-1"
                >
                  <input
                    type="text"
                    required
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    placeholder="Nueva subcuenta (ej: Mercado Pago)"
                    className="flex-1 min-w-36 px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                  <div className="w-36">
                    <MoneyInput
                      value={newSubInitial}
                      onChange={setNewSubInitial}
                      currency={epCurrency}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    + Subcuenta
                  </button>
                </form>
              </div>
            )}
          </fieldset>
        </Modal>
      )}
    </div>
  );
}
