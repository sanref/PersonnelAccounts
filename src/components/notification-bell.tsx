"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, BellRing, Check, Settings } from "lucide-react";
import { Avatar, Tag, type Tone } from "@/components/cui";
import type { DueAlertItem, PublicNotificationSettings } from "@/lib/notifications";
import { formatDateAR, formatMoney } from "@/lib/format";
import {
  ensureServiceWorkerRegistered,
  getActivePushEndpoint,
  isPushSupportedInBrowser,
  subscribeDeviceToPush,
} from "@/lib/push-client";

export function NotificationBell({
  alerts,
  settings,
}: {
  alerts: DueAlertItem[];
  settings: PublicNotificationSettings;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [subscribedHere, setSubscribedHere] = useState(true);
  const [subError, setSubError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Alertas activas según ventana configurada (vencidos + hoy + hasta daysBefore)
  const activeAlerts = alerts.filter((a) => a.diffDays <= settings.daysBefore);
  const hasUrgent = activeAlerts.some(
    (a) => a.urgency === "OVERDUE" || a.urgency === "DUE_TODAY"
  );
  const count = activeAlerts.length;

  // Cerrar popover al hacer clic afuera
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleOutside);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // Registrar Service Worker, detectar suscripción local y chequear horario de notificación
  useEffect(() => {
    const supported = isPushSupportedInBrowser();
    setPushSupported(supported);

    if (supported) {
      ensureServiceWorkerRegistered()
        .then(() => getActivePushEndpoint())
        .then((ep) => setSubscribedHere(Boolean(ep)))
        .catch(() => {});
    }

    const checkSchedule = () => {
      if (!settings.enabled) return;
      fetch("/api/cron/notifications", { credentials: "include" }).catch(() => {});
    };

    checkSchedule();
    const timer = window.setInterval(checkSchedule, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkSchedule();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [settings.enabled, settings.notifyTime]);

  function handleQuickSubscribe() {
    setSubError(null);
    startTransition(async () => {
      const res = await subscribeDeviceToPush(settings.vapidPublicKey);
      if (!res.ok) {
        setSubError(res.error ?? "No se pudo activar");
      } else {
        setSubscribedHere(true);
        router.refresh();
      }
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Notificaciones de vencimientos"
        aria-label="Notificaciones de vencimientos"
        aria-expanded={open}
        className={`icon-button relative ${open ? "bg-muted text-ink" : ""}`}
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span
            className={`absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.6875rem] font-medium text-white tabular-nums ring-2 ring-surface ${
              hasUrgent ? "bg-danger" : "bg-warning"
            }`}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="cui-pop fixed inset-x-3 top-16 z-50 overflow-hidden rounded-surface border border-line bg-surface shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-4 py-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
                <Bell className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                Vencimientos pendientes
              </h3>
              <p className="mt-0.5 text-xs text-ink-3">
                {settings.enabled
                  ? `Aviso diario a las ${settings.notifyTime} hs`
                  : "Avisos automáticos pausados"}
              </p>
            </div>
            <Link
              href="/config#notificaciones"
              onClick={() => setOpen(false)}
              className="btn-ghost min-h-9 px-2.5"
            >
              <Settings className="size-4" />
              <span>Horario</span>
            </Link>
          </div>

          {pushSupported && !subscribedHere && (
            <div className="border-b border-line p-3">
              <div className="alert alert-accent items-center p-3">
                <BellRing className="size-4 shrink-0" aria-hidden="true" />
                <p className="min-w-0 flex-1 text-xs font-medium text-ink">
                  Recibí avisos push en este dispositivo
                </p>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleQuickSubscribe}
                  className="btn-primary min-h-9 px-3"
                >
                  {isPending ? "Activando..." : "Activar"}
                </button>
              </div>
              {subError && (
                <p className="mt-2 text-xs text-danger-ink">{subError}</p>
              )}
            </div>
          )}

          <div className="max-h-80 divide-y divide-line overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="space-y-1 p-6 text-center">
                <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full border border-success-line bg-success-soft text-success">
                  <Check className="size-4" />
                </div>
                <p className="text-sm font-medium text-ink">Todo al día</p>
                <p className="text-xs text-ink-3">
                  No hay servicios próximos a vencer ni pendientes vencidos.
                </p>
              </div>
            ) : (
              alerts.map((item) => {
                const badge: { label: string; tone: Tone } =
                  item.urgency === "OVERDUE"
                    ? {
                        label: `Venció ${formatDateAR(item.dueDate).slice(0, 5)}`,
                        tone: "danger",
                      }
                    : item.urgency === "DUE_TODAY"
                    ? {
                        label: "Vence hoy",
                        tone: "warning",
                      }
                    : {
                        label:
                          item.diffDays === 1
                            ? "Mañana"
                            : `En ${item.diffDays} días · ${formatDateAR(item.dueDate).slice(0, 5)}`,
                        tone: "accent",
                      };

                return (
                  <Link
                    key={item.id}
                    href={`/pagos?periodo=${item.period}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 transition-colors duration-100 hover:bg-subtle"
                  >
                    <Avatar name={item.personName} seed={item.personId} size="sm" />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="truncate text-sm font-medium text-ink">
                        {item.concept}
                      </p>
                      <p className="truncate text-xs text-ink-3 tabular-nums">
                        {item.personName} ·{" "}
                        {item.amount !== null && item.amount !== ""
                          ? formatMoney(item.amount, "ARS")
                          : "Monto pendiente de carga"}
                      </p>
                    </div>
                    <Tag tone={badge.tone}>{badge.label}</Tag>
                  </Link>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line bg-subtle px-4 py-2 text-xs">
            <Link
              href="/pagos"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-9 items-center gap-1 rounded-control font-medium text-accent-ink hover:underline"
            >
              Ir a pagos mensuales
              <ArrowRight className="size-3.5" />
            </Link>
            <span className="text-ink-3">
              Anticipación: {settings.daysBefore}d
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
