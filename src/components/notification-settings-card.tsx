"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  Clock,
  Copy,
  Send,
  Smartphone,
  Trash2,
} from "lucide-react";
import type { PublicNotificationSettings } from "@/lib/notifications";
import {
  deletePushSubscriptionAction,
  sendTestNotificationAction,
  triggerDueNotificationsNowAction,
  updateNotificationSettingsAction,
} from "@/app/actions";
import { ToggleSwitch } from "@/components/ui-controls";
import {
  getActivePushEndpoint,
  isPushSupportedInBrowser,
  subscribeDeviceToPush,
  unsubscribeCurrentDeviceFromPush,
} from "@/lib/push-client";

interface SubscribedDevice {
  id: number;
  endpoint: string;
  deviceLabel: string;
  createdAt: string;
}

export function NotificationSettingsCard({
  settings,
  devices,
}: {
  settings: PublicNotificationSettings;
  devices: SubscribedDevice[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [enabled, setEnabled] = useState(settings.enabled);
  const [notifyTime, setNotifyTime] = useState(settings.notifyTime);
  const [daysBefore, setDaysBefore] = useState(String(settings.daysBefore));
  const [notifyOnDueDay, setNotifyOnDueDay] = useState(settings.notifyOnDueDay);
  const [notifyOverdue, setNotifyOverdue] = useState(settings.notifyOverdue);

  const [savedOk, setSavedOk] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [pushSupported, setPushSupported] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState<string | null>(null);
  const [copiedCron, setCopiedCron] = useState(false);

  useEffect(() => {
    const supported = isPushSupportedInBrowser();
    setPushSupported(supported);
    if (supported) {
      getActivePushEndpoint()
        .then((ep) => setLocalEndpoint(ep))
        .catch(() => {});
    }
  }, []);

  const isCurrentDeviceSubscribed = Boolean(
    localEndpoint && devices.some((d) => d.endpoint === localEndpoint)
  );

  function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      await updateNotificationSettingsAction({
        enabled,
        notifyTime,
        daysBefore: Number(daysBefore) || 0,
        notifyOnDueDay,
        notifyOverdue,
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
      router.refresh();
    });
  }

  function handleSubscribeThisDevice() {
    setFeedback(null);
    startTransition(async () => {
      const res = await subscribeDeviceToPush(settings.vapidPublicKey);
      if (!res.ok) {
        setFeedback({
          type: "err",
          text: res.error ?? "No se pudo activar Push en este dispositivo.",
        });
        return;
      }
      setLocalEndpoint(res.endpoint ?? null);
      setFeedback({
        type: "ok",
        text: "Este dispositivo quedó vinculado para recibir notificaciones Push.",
      });
      router.refresh();
    });
  }

  function handleUnsubscribeThisDevice() {
    setFeedback(null);
    startTransition(async () => {
      await unsubscribeCurrentDeviceFromPush();
      setLocalEndpoint(null);
      setFeedback({
        type: "ok",
        text: "Se desactivaron las notificaciones Push en este dispositivo.",
      });
      router.refresh();
    });
  }

  function handleSendTest() {
    setFeedback(null);
    startTransition(async () => {
      const res = await sendTestNotificationAction();
      if (res.totalDevices === 0) {
        setFeedback({
          type: "err",
          text: "Primero activá Push en al menos un dispositivo (botón de abajo).",
        });
      } else if (res.sent > 0) {
        setFeedback({
          type: "ok",
          text: `Notificación de prueba enviada a ${res.sent} dispositivo(s).`,
        });
      } else {
        setFeedback({
          type: "err",
          text: "No se pudo entregar la notificación de prueba. Volvé a vincular el dispositivo.",
        });
      }
      router.refresh();
    });
  }

  function handleSendPendingSummaryNow() {
    setFeedback(null);
    startTransition(async () => {
      const res = await triggerDueNotificationsNowAction();
      if ("matched" in res && res.matched === 0) {
        setFeedback({
          type: "ok",
          text: "No hay servicios pendientes por vencer o vencidos en este momento.",
        });
      } else if ("sent" in res && (res.sent ?? 0) > 0) {
        setFeedback({
          type: "ok",
          text: `Resumen enviado (${res.matched} servicio(s) pendiente(s)) a ${res.sent} dispositivo(s).`,
        });
      } else {
        setFeedback({
          type: "err",
          text: "Hay vencimientos pendientes, pero no hay dispositivos vinculados para recibir el Push.",
        });
      }
      router.refresh();
    });
  }

  const cronUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/cron/notifications?key=${settings.cronSecret}`
      : `/api/cron/notifications?key=${settings.cronSecret}`;

  return (
    <section
      id="notificaciones"
      className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-6 scroll-mt-20"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-slate-900" />
            <h2 className="text-lg font-bold text-slate-900">
              Notificaciones de Vencimientos
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Toma las fechas de vencimiento de tus servicios mensuales pendientes y te avisa
            a la hora elegida (hora de Argentina).
          </p>
        </div>

        <ToggleSwitch
          checked={enabled}
          onChange={setEnabled}
          label={enabled ? "Avisos activados" : "Avisos pausados"}
        />
      </div>

      <form onSubmit={handleSavePreferences} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Hora de notificación */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Hora de notificación
            </label>
            <input
              type="time"
              required
              value={notifyTime}
              onChange={(e) => setNotifyTime(e.target.value)}
              className="w-full min-h-11 px-3 py-2 rounded-lg border border-slate-300 bg-white text-base font-semibold text-slate-900 tabular-nums"
            />
            <p className="text-[0.6875rem] text-slate-500">
              Huso horario: Argentina (GMT-3)
            </p>
          </div>

          {/* Días de anticipación */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Anticipación antes del vencimiento
            </label>
            <select
              value={daysBefore}
              onChange={(e) => setDaysBefore(e.target.value)}
              className="w-full min-h-11 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900"
            >
              <option value="0">Sin anticipación (solo el día que vence)</option>
              <option value="1">1 día antes</option>
              <option value="2">2 días antes</option>
              <option value="3">3 días antes (Recomendado)</option>
              <option value="5">5 días antes</option>
              <option value="7">7 días antes</option>
              <option value="10">10 días antes</option>
            </select>
            <p className="text-[0.6875rem] text-slate-500">
              Solo avisa si el servicio sigue como Pendiente.
            </p>
          </div>

          {/* Reglas adicionales */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 flex flex-col justify-center gap-2.5">
            <ToggleSwitch
              checked={notifyOnDueDay}
              onChange={setNotifyOnDueDay}
              label="Avisar el mismo día que vence"
            />
            <ToggleSwitch
              checked={notifyOverdue}
              onChange={setNotifyOverdue}
              activeColor="indigo"
              label="Repetir si quedó vencido sin pagar"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 min-h-11 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
          >
            {savedOk ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                Preferencias guardadas
              </>
            ) : (
              "Guardar horario y preferencias"
            )}
          </button>
        </div>
      </form>

      {/* Dispositivos Push vinculados */}
      <div className="pt-4 border-t border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-slate-600" />
              Dispositivos que reciben Push ({devices.length})
            </h3>
            <p className="text-xs text-slate-500">
              Activá este botón en tu celular (idealmente desde la PWA instalada) y en tu PC.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pushSupported ? (
              isCurrentDeviceSubscribed ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleUnsubscribeThisDevice}
                  className="inline-flex items-center gap-1.5 min-h-11 px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  <BellOff className="w-4 h-4" />
                  Desactivar en este equipo
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleSubscribeThisDevice}
                  className="inline-flex items-center gap-1.5 min-h-11 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                >
                  <BellRing className="w-4 h-4" />
                  Activar Push en este equipo
                </button>
              )
            ) : (
              <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Para Push en iPhone: abrí en Safari → Compartir → Agregar a inicio.
              </span>
            )}

            <button
              type="button"
              disabled={isPending || devices.length === 0}
              onClick={handleSendTest}
              className="inline-flex items-center gap-1.5 min-h-11 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              Probar aviso
            </button>

            <button
              type="button"
              disabled={isPending || devices.length === 0}
              onClick={handleSendPendingSummaryNow}
              className="inline-flex items-center gap-1.5 min-h-11 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
            >
              Enviar pendientes ahora
            </button>
          </div>
        </div>

        {feedback && (
          <p
            className={`text-xs px-3.5 py-2.5 rounded-xl border ${
              feedback.type === "ok"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-700"
            }`}
          >
            {feedback.text}
          </p>
        )}

        {devices.length > 0 && (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
            {devices.map((dev) => {
              const isThisOne = dev.endpoint === localEndpoint;
              return (
                <div
                  key={dev.id}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-white"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-800 truncate">
                      {dev.deviceLabel}
                    </span>
                    {isThisOne && (
                      <span className="text-[0.6875rem] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                        Este dispositivo
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    title="Eliminar dispositivo"
                    onClick={() =>
                      startTransition(async () => {
                        if (isThisOne) {
                          await unsubscribeCurrentDeviceFromPush();
                          setLocalEndpoint(null);
                        } else {
                          await deletePushSubscriptionAction({ id: dev.id });
                        }
                        router.refresh();
                      })
                    }
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <details className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-200/70">
          <summary className="font-semibold text-slate-700 cursor-pointer select-none">
            Opcional: disparo puntual exacto con la app cerrada en Vercel Gratis
          </summary>
          <div className="mt-2 space-y-2">
            <p>
              El plan gratuito de Vercel ejecuta su tarea programada una vez al día (9:00 hs
              Argentina) y además la app chequea el horario automáticamente al abrirse. Si
              querés que dispare al minuto exacto de cualquier hora que elijas incluso con el
              celular bloqueado, podés pegar este enlace en{" "}
              <a
                href="https://cron-job.org"
                target="_blank"
                rel="noreferrer"
                className="underline font-medium text-slate-800"
              >
                cron-job.org
              </a>{" "}
              (gratis, cada 15 minutos):
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={cronUrl}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[0.6875rem]"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(cronUrl);
                  setCopiedCron(true);
                  setTimeout(() => setCopiedCron(false), 2000);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white font-medium cursor-pointer"
              >
                {copiedCron ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCron ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
