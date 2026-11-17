"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Check, Settings } from "lucide-react";
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
        className="relative inline-flex items-center justify-center min-h-10 min-w-10 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[0.6875rem] font-bold text-white flex items-center justify-center tabular-nums ${
              hasUrgent ? "bg-rose-600" : "bg-amber-500"
            }`}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute inset-x-3 sm:inset-x-auto sm:right-0 top-16 sm:top-full sm:mt-2 sm:w-96 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Vencimientos pendientes
              </h3>
              <p className="text-[0.6875rem] text-slate-500">
                {settings.enabled
                  ? `Aviso diario a las ${settings.notifyTime} hs`
                  : "Avisos automáticos pausados"}
              </p>
            </div>
            <Link
              href="/config#notificaciones"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Horario</span>
            </Link>
          </div>

          {pushSupported && !subscribedHere && (
            <div className="p-3 bg-indigo-50/80 border-b border-indigo-100 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-indigo-950 font-medium">
                  Recibí avisos Push en este dispositivo
                </p>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleQuickSubscribe}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  {isPending ? "Activando..." : "Activar"}
                </button>
              </div>
              {subError && <p className="text-[0.6875rem] text-rose-600">{subError}</p>}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {alerts.length === 0 ? (
              <div className="p-6 text-center space-y-1">
                <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <Check className="w-4 h-4" />
                </div>
                <p className="text-sm font-medium text-slate-800">
                  Todo al día
                </p>
                <p className="text-xs text-slate-500">
                  No hay servicios próximos a vencer ni pendientes vencidos.
                </p>
              </div>
            ) : (
              alerts.map((item) => {
                const badge =
                  item.urgency === "OVERDUE"
                    ? {
                        label: `Venció ${formatDateAR(item.dueDate).slice(0, 5)}`,
                        cls: "bg-rose-100 text-rose-800",
                      }
                    : item.urgency === "DUE_TODAY"
                    ? {
                        label: "Vence hoy",
                        cls: "bg-amber-200 text-amber-950",
                      }
                    : {
                        label:
                          item.diffDays === 1
                            ? "Mañana"
                            : `En ${item.diffDays} días · ${formatDateAR(item.dueDate).slice(0, 5)}`,
                        cls: "bg-indigo-50 text-indigo-700",
                      };

                return (
                  <Link
                    key={item.id}
                    href={`/pagos?periodo=${item.period}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {item.concept}
                        </span>
                        <span className="text-[0.6875rem] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                          {item.personName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {item.amount !== null && item.amount !== ""
                          ? formatMoney(item.amount, "ARS")
                          : "Monto pendiente de carga"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </Link>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
            <Link
              href="/pagos"
              onClick={() => setOpen(false)}
              className="font-semibold text-slate-800 hover:underline"
            >
              Ir a Pagos Mensuales →
            </Link>
            <span className="text-[0.6875rem] text-slate-400">
              Anticipación: {settings.daysBefore}d
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
