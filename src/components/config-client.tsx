"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarRange,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FilterX,
  History,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Star,
  Trash2,
  Users,
  Wallet,
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
import { Avatar, PanelHeader, Tag } from "@/components/cui";
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

  const clearServiceFilters = () => {
    setFPerson("ALL");
    setFName("");
    setFArrears("ALL");
    setFActive("ALL");
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h1 className="page-title">Configuración</h1>
          <p className="text-sm text-ink-2">
            Personas, servicios y preferencias de tu administración.
          </p>
        </div>

        <a href="/api/export" className="btn-secondary self-start sm:self-auto">
          <Download className="size-4" />
          Descargar backup
        </a>
      </div>

      <nav
        aria-label="Secciones de configuración"
        className="segmented max-w-full overflow-x-auto"
      >
        <a href="#personas" className="segmented-item whitespace-nowrap">
          <Users className="size-4" aria-hidden="true" />
          Personas y cuentas
        </a>
        <a href="#servicios" className="segmented-item whitespace-nowrap">
          <Repeat className="size-4" aria-hidden="true" />
          Servicios fijos
        </a>
        <a href="#notificaciones" className="segmented-item whitespace-nowrap">
          <Bell className="size-4" aria-hidden="true" />
          Notificaciones
        </a>
      </nav>

      {/* SECCIÓN 1: PERSONAS, CONTRASEÑAS Y SUBCUENTAS */}
      <section
        id="personas"
        aria-labelledby="personas-heading"
        className="panel scroll-mt-36"
      >
        <PanelHeader
          id="personas-heading"
          icon={Users}
          title={
            <>
              Personas y cuentas
              <Tag tone="neutral">{people.length}</Tag>
            </>
          }
          description="Administrá subcuentas y habilitá el acceso de cada persona a su resumen."
        />

        {people.length === 0 ? (
          <EmptyState
            title="Todavía no hay personas"
            description="Abrí «Agregar persona» para crear la primera cuenta familiar."
          />
        ) : (
          <div className="divide-y divide-line">
            {people.map((p) => {
              const hasPassword = Boolean(
                p.sharePin && p.sharePin.trim().length > 0,
              );
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3.5 transition-colors duration-100 hover:bg-subtle sm:flex-nowrap sm:px-5"
                >
                  <Avatar name={p.name} seed={p.id} size="md" />
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-ink">{p.name}</h3>
                      <Tag tone="neutral">{p.defaultCurrency}</Tag>
                    </div>
                    {p.notes && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-ink-3">
                        {p.notes}
                      </p>
                    )}
                    {/* Estado de cuenta / saldo */}
                    <p className="mt-1 text-xs text-ink-3 tabular-nums">
                      {p.hasManagedAccount ? (
                        <>
                          <span>Saldo total: </span>
                          <strong
                            className={`font-medium ${p.totalBalance < -0.004 ? "text-danger-ink" : "text-ink"}`}
                          >
                            {formatMoney(p.totalBalance, p.defaultCurrency)}
                          </strong>
                          <span> · {p.accounts.map((a) => a.name).join(", ")}</span>
                        </>
                      ) : (
                        <span>Solo servicios mensuales (sin cuenta administrada)</span>
                      )}
                    </p>
                  </div>

                  {/* Estado de acceso familiar */}
                  <div className="flex w-full flex-wrap items-center justify-between gap-2 pl-13 sm:w-auto sm:justify-end sm:pl-0">
                    {!p.shareEnabled ? (
                      <Tag tone="neutral" icon={EyeOff}>
                        Acceso familiar desactivado
                      </Tag>
                    ) : hasPassword ? (
                      <Tag tone="success" icon={KeyRound}>
                        Con contraseña asignada
                      </Tag>
                    ) : (
                      <Tag tone="warning" icon={Link2}>
                        Link activo (sin contraseña aún)
                      </Tag>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditPersonModal(p)}
                      className="btn-secondary min-h-10 px-3"
                    >
                      <Pencil className="size-4" />
                      Editar persona
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Formulario Agregar Nueva Persona */}
        <details className="group rounded-b-surface border-t border-line bg-subtle">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-b-surface px-4 text-sm font-medium text-accent-ink hover:bg-muted/60 sm:px-5">
            <Plus className="size-4 transition-transform group-open:rotate-45" />
            Agregar persona
          </summary>
          <form
            onSubmit={handleAddPerson}
            className="grid grid-cols-1 gap-4 px-4 pb-5 pt-1 sm:grid-cols-12 sm:px-5"
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
                className="btn-primary w-full"
              >
                <Plus className="size-4" />
                Crear persona
              </button>
            </div>
          </form>
        </details>
      </section>

      {/* SECCIÓN 2: CATÁLOGO DE SERVICIOS FIJOS */}
      <section
        id="servicios"
        aria-labelledby="servicios-heading"
        className="panel scroll-mt-36 overflow-hidden"
      >
        <PanelHeader
          id="servicios-heading"
          icon={Repeat}
          title={
            <>
              Servicios fijos
              <Tag tone="neutral">{services.length}</Tag>
            </>
          }
          description="Este catálogo se reutiliza según la frecuencia de cada servicio (mensual, bimestral…). «Mes vencido» indica que la factura corresponde al mes anterior."
        />

        <details className="group border-b border-line bg-subtle">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-accent-ink hover:bg-muted/60 sm:px-5">
            <Plus className="size-4 transition-transform group-open:rotate-45" />
            Agregar servicio fijo
          </summary>
          <form
            onSubmit={handleAddService}
            className="grid grid-cols-1 items-end gap-4 px-4 pb-5 pt-1 sm:grid-cols-12 sm:px-5"
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
              <p className="alert alert-accent p-3 text-xs sm:col-span-12">
                <CalendarRange className="size-4 shrink-0" aria-hidden="true" />
                <span className="text-ink">
                  Se carga en:{" "}
                  <strong className="font-medium">
                    {scheduledMonths({
                      frequencyMonths: sFrequency,
                      startMonth: sStartMonth,
                    })
                      .map(monthNameAR)
                      .join(", ")}
                  </strong>
                  . El importe habitual es el de cada factura.
                </span>
              </p>
            )}
            <div className="flex items-center justify-between gap-3 sm:col-span-3 sm:justify-end">
              <ToggleSwitch
                checked={sArrears}
                onChange={setSArrears}
                activeColor="indigo"
                label="Mes vencido"
              />
              <button
                type="submit"
                disabled={isPending || people.length === 0}
                className="btn-primary"
              >
                <Plus className="size-4" />
                Agregar
              </button>
            </div>
          </form>
        </details>

        <div className="overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Persona</th>
                <th className="px-4 py-2.5 text-left font-medium">
                  Servicio / Nota
                </th>
                <th className="px-3 py-2.5 text-center font-medium">
                  Venc. aprox.
                </th>
                <th className="px-3 py-2.5 text-left font-medium">Frecuencia</th>
                <th className="px-3 py-2.5 text-center font-medium">
                  Mes vencido
                </th>
                <th className="px-3 py-2.5 text-center font-medium">Activo</th>
                <th className="w-12 px-3 py-1">
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={clearServiceFilters}
                      title="Limpiar filtros"
                      aria-label="Limpiar filtros"
                      className="icon-button icon-button-danger"
                    >
                      <FilterX className="size-4" />
                    </button>
                  )}
                </th>
              </tr>
              <tr className="border-t border-line bg-surface">
                <th className="px-3 py-2">
                  <select
                    aria-label="Filtrar por persona"
                    value={fPerson === "ALL" ? "ALL" : String(fPerson)}
                    onChange={(e) =>
                      setFPerson(
                        e.target.value === "ALL"
                          ? "ALL"
                          : Number(e.target.value),
                      )
                    }
                    className="field min-h-9 px-2 py-1 text-xs font-normal"
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
                    aria-label="Filtrar por nombre o póliza"
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="Filtrar por nombre o póliza..."
                    className="field min-h-9 px-2.5 py-1 text-xs font-normal"
                  />
                </th>
                <th className="px-3 py-2 text-center text-xs font-normal text-ink-3">
                  Día del mes
                </th>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">
                  <select
                    aria-label="Filtrar por mes vencido"
                    value={fArrears}
                    onChange={(e) =>
                      setFArrears(
                        e.target.value as "ALL" | "ARREARS" | "CURRENT",
                      )
                    }
                    className="field min-h-9 px-2 py-1 text-xs font-normal"
                  >
                    <option value="ALL">Todos</option>
                    <option value="ARREARS">Mes vencido</option>
                    <option value="CURRENT">Mes en curso</option>
                  </select>
                </th>
                <th className="px-3 py-2">
                  <select
                    aria-label="Filtrar por estado"
                    value={fActive}
                    onChange={(e) =>
                      setFActive(
                        e.target.value as "ALL" | "ACTIVE" | "INACTIVE",
                      )
                    }
                    className="field min-h-9 px-2 py-1 text-xs font-normal"
                  >
                    <option value="ALL">Todos</option>
                    <option value="ACTIVE">Activos</option>
                    <option value="INACTIVE">Inactivos</option>
                  </select>
                </th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {filteredServices.map((srv) => (
                <tr key={srv.id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-sm text-ink-2">
                      <Avatar
                        name={srv.person.name}
                        seed={srv.person.id}
                        size="xs"
                      />
                      {srv.person.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={`font-medium ${
                          srv.isActive ? "text-ink" : "text-ink-3 line-through"
                        }`}
                      >
                        {srv.name}
                      </span>
                      {!srv.isActive && <Tag tone="neutral">Inactivo</Tag>}
                      {srv.paysInArrears && (
                        <Tag tone="orange" icon={History}>
                          Mes vencido
                        </Tag>
                      )}
                    </div>
                    {srv.notes && (
                      <p className="mt-0.5 text-xs text-ink-3">{srv.notes}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-ink-3">
                    <div className="inline-flex items-center justify-center gap-1.5">
                      <span>Día</span>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        defaultValue={srv.defaultDueDay ?? ""}
                        placeholder="—"
                        title="Cambiar día de vencimiento mensual (1 a 31)"
                        aria-label={`Día de vencimiento de ${srv.name}`}
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
                        className="field min-h-9 w-16 px-2 py-1 text-center text-xs font-medium tabular-nums"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-40 flex-col gap-1.5">
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
                        className="field min-h-9 px-2 py-1 text-xs font-medium"
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
                            className="field min-h-9 px-2 py-1 text-xs"
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(
                              (m) => (
                                <option key={m} value={m}>
                                  Desde {monthNameAR(m).toLowerCase()}
                                </option>
                              ),
                            )}
                          </select>
                          <Tag tone="iris" icon={CalendarRange} className="self-start">
                            {scheduledMonths(srv)
                              .map((m) => monthNameAR(m).slice(0, 3))
                              .join(" · ")}
                          </Tag>
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
                      title={`Eliminar ${srv.name} del catálogo`}
                      aria-label={`Eliminar ${srv.name} del catálogo`}
                      onClick={() => {
                        if (!confirm(`¿Eliminar "${srv.name}" del catálogo?`))
                          return;
                        startTransition(async () => {
                          await deleteServiceAction(srv.id);
                          router.refresh();
                        });
                      }}
                      className="icon-button icon-button-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredServices.length === 0 && (
                <tr className="hover:bg-transparent">
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
                            onClick={clearServiceFilters}
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
          <fieldset disabled={isPending} className="min-w-0">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-subtle px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  name={liveEditingPerson.name}
                  seed={liveEditingPerson.id}
                  size="sm"
                />
                <h3
                  id="edit-person-title"
                  className="min-w-0 truncate font-display text-lg font-medium text-ink"
                >
                  Configurar persona · {liveEditingPerson.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingPerson(null)}
                aria-label="Cerrar edición de persona"
                title="Cerrar"
                className="icon-button -mr-2"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-6 p-4 sm:p-6">
              <form onSubmit={handleSavePerson} className="space-y-6">
                {/* 1. Datos básicos */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-ink">
                    Datos generales
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label htmlFor="ep-name" className="field-label">
                        Nombre
                      </label>
                      <input
                        id="ep-name"
                        type="text"
                        required
                        value={epName}
                        onChange={(e) => setEpName(e.target.value)}
                        className="field"
                      />
                    </div>
                    <div>
                      <label htmlFor="ep-currency" className="field-label">
                        Moneda base
                      </label>
                      <select
                        id="ep-currency"
                        value={epCurrency}
                        onChange={(e) =>
                          setEpCurrency(e.target.value as "ARS" | "USD")
                        }
                        className="field"
                      >
                        <option value="ARS">ARS ($)</option>
                        <option value="USD">USD (US$)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ep-notes" className="field-label">
                      Descripción / Notas
                    </label>
                    <input
                      id="ep-notes"
                      type="text"
                      value={epNotes}
                      onChange={(e) => setEpNotes(e.target.value)}
                      placeholder="Ej: Cuentas Cocos y Balanz + servicios..."
                      className="field"
                    />
                  </div>

                  <ToggleSwitch
                    checked={epManaged}
                    onChange={setEpManaged}
                    label="Llevar cuenta y saldo administrado en Inicio"
                  />
                </div>

                {/* 2. Acceso Familiar y Contraseña */}
                <div className="space-y-3 border-t border-line pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-sm font-medium text-ink">
                      <KeyRound className="size-4 text-ink-3" aria-hidden="true" />
                      Acceso y contraseña para ver sus datos
                    </h4>
                    <ToggleSwitch
                      checked={epShareEnabled}
                      onChange={setEpShareEnabled}
                      label="Habilitado"
                    />
                  </div>

                  {epShareEnabled && (
                    <div className="space-y-4 rounded-panel border border-iris-line bg-iris-soft/50 p-4">
                      <div>
                        <label htmlFor="ep-password" className="field-label">
                          Contraseña de {epName || liveEditingPerson.name}
                        </label>
                        <div className="relative">
                          <input
                            id="ep-password"
                            type={showPass ? "text" : "password"}
                            value={epPassword}
                            onChange={(e) => setEpPassword(e.target.value)}
                            placeholder="Escribí una clave (ej: mama2026 o 4821)..."
                            className="field pr-12"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPass((v) => !v)}
                            title={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                            aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                            className="icon-button absolute right-0 top-1/2 -translate-y-1/2"
                          >
                            {showPass ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs text-ink-2">
                          Con esta contraseña puede entrar en{" "}
                          <strong className="font-medium text-ink">
                            /login → Acceso Familiar
                          </strong>{" "}
                          escribiendo su nombre (
                          <strong className="font-medium text-ink">{epName}</strong>)
                          y su clave. Si la dejás vacía, podrá entrar directo solo
                          con el link privado.
                        </p>
                      </div>

                      {shareUrl && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="ep-share-url" className="text-sm font-medium text-ink-2">
                              Enlace directo (WhatsApp)
                            </label>
                            <button
                              type="button"
                              onClick={handleRegenerateLink}
                              className="btn-ghost min-h-9 px-2 text-xs hover:bg-danger-soft hover:text-danger-ink"
                            >
                              <RefreshCw className="size-3.5" />
                              Cambiar link
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <input
                              id="ep-share-url"
                              type="text"
                              readOnly
                              value={shareUrl}
                              className="field min-h-10 flex-1 text-xs text-ink-2"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(shareUrl);
                                setCopiedLink(true);
                                setTimeout(() => setCopiedLink(false), 2000);
                              }}
                              className="btn-secondary min-h-10 bg-surface px-3 hover:bg-muted"
                            >
                              {copiedLink ? (
                                <Check className="size-4 text-success" />
                              ) : (
                                <Copy className="size-4" />
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
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                  {!liveEditingPerson.isOwn ? (
                    <button
                      type="button"
                      onClick={handleDeletePerson}
                      className="btn-ghost px-3 text-danger-ink hover:bg-danger-soft hover:text-danger-ink"
                    >
                      <Trash2 className="size-4" />
                      Eliminar persona
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingPerson(null)}
                      className="btn-ghost"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="btn-primary"
                    >
                      Guardar cambios
                    </button>
                  </div>
                </div>
              </form>

              {/* 3. Administración de Subcuentas / Billeteras */}
              {epManaged && (
                <div className="space-y-3 border-t border-line pt-5">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-ink">
                    <Wallet className="size-4 text-ink-3" aria-hidden="true" />
                    Subcuentas / Billeteras
                    <Tag tone="neutral">{liveEditingPerson.accounts.length}</Tag>
                  </h4>

                  <div className="divide-y divide-line overflow-hidden rounded-panel border border-line text-sm">
                    {liveEditingPerson.accounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between gap-2 bg-surface px-3 py-2"
                      >
                        {editingAccId === acc.id ? (
                          <div className="flex flex-1 flex-wrap items-center gap-2 py-1">
                            <input
                              type="text"
                              aria-label="Nombre de la subcuenta"
                              value={editAccName}
                              onChange={(e) => setEditAccName(e.target.value)}
                              className="field min-h-10 w-32"
                            />
                            <div className="w-40">
                              <MoneyInput
                                value={editAccInitial}
                                onChange={setEditAccInitial}
                                currency={acc.currency}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSaveAcc(acc.id)}
                              className="btn-primary min-h-10 px-3"
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAccId(null)}
                              className="btn-ghost min-h-10 px-3"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="min-w-0 tabular-nums">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-ink">
                                  {acc.name}
                                </span>
                                {acc.isDefault && (
                                  <Tag tone="accent" icon={Star}>
                                    Predeterminada
                                  </Tag>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-ink-3">
                                Inicial:{" "}
                                {formatMoney(acc.initialBalance, acc.currency)} ·
                                Actual:{" "}
                                <strong
                                  className={`font-medium ${Number(acc.balance) < -0.004 ? "text-danger-ink" : "text-ink"}`}
                                >
                                  {formatMoney(acc.balance, acc.currency)}
                                </strong>
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center">
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
                                  className="icon-button hover:bg-accent-soft hover:text-accent-ink"
                                >
                                  <Star className="size-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => startEditAcc(acc)}
                                title="Editar nombre o saldo inicial"
                                aria-label={`Editar ${acc.name}`}
                                className="icon-button"
                              >
                                <Pencil className="size-4" />
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
                                  aria-label={`Eliminar subcuenta ${acc.name}`}
                                  className="icon-button icon-button-danger"
                                >
                                  <Trash2 className="size-4" />
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
                      aria-label="Nombre de la nueva subcuenta"
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      placeholder="Nueva subcuenta (ej: Mercado Pago)"
                      className="field min-w-36 flex-1"
                    />
                    <div className="w-40">
                      <MoneyInput
                        value={newSubInitial}
                        onChange={setNewSubInitial}
                        currency={epCurrency}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="btn-secondary"
                    >
                      <Plus className="size-4" />
                      Subcuenta
                    </button>
                  </form>
                </div>
              )}
            </div>
          </fieldset>
        </Modal>
      )}
    </div>
  );
}
