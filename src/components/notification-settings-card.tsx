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
import { Tag } from "@/components/cui";
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
    <section id="notificaciones" className="panel scroll-mt-36">
      <div className="panel-header">
        <div className="min-w-0">
          <h2 className="panel-title">
            <Bell className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            Notificaciones de vencimientos
            {enabled ? (
              <Tag tone="success">Activas</Tag>
            ) : (
              <Tag tone="neutral">Pausadas</Tag>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">
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

      <div className="space-y-6 p-4 sm:p-5">
        <form onSubmit={handleSavePreferences} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Hora de notificación */}
            <div className="space-y-1.5 rounded-panel border border-line bg-subtle p-4">
              <label htmlFor="notif-time" className="field-label flex items-center gap-1.5">
                <Clock className="size-3.5 text-ink-3" aria-hidden="true" />
                Hora de notificación
              </label>
              <input
                id="notif-time"
                type="time"
                required
                value={notifyTime}
                onChange={(e) => setNotifyTime(e.target.value)}
                className="field text-base font-medium tabular-nums"
              />
              <p className="text-xs text-ink-3">Huso horario: Argentina (GMT-3)</p>
            </div>

            {/* Días de anticipación */}
            <div className="space-y-1.5 rounded-panel border border-line bg-subtle p-4">
              <label htmlFor="notif-days" className="field-label">
                Anticipación antes del vencimiento
              </label>
              <select
                id="notif-days"
                value={daysBefore}
                onChange={(e) => setDaysBefore(e.target.value)}
                className="field"
              >
                <option value="0">Sin anticipación (solo el día que vence)</option>
                <option value="1">1 día antes</option>
                <option value="2">2 días antes</option>
                <option value="3">3 días antes (Recomendado)</option>
                <option value="5">5 días antes</option>
                <option value="7">7 días antes</option>
                <option value="10">10 días antes</option>
              </select>
              <p className="text-xs text-ink-3">
                Solo avisa si el servicio sigue como Pendiente.
              </p>
            </div>

            {/* Reglas adicionales */}
            <div className="flex flex-col justify-center gap-1 rounded-panel border border-line bg-subtle p-4">
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
            <button type="submit" disabled={isPending} className="btn-primary">
              {savedOk ? (
                <>
                  <Check className="size-4" />
                  Preferencias guardadas
                </>
              ) : (
                "Guardar horario y preferencias"
              )}
            </button>
          </div>
        </form>

        {/* Dispositivos Push vinculados */}
        <div className="space-y-4 border-t border-line pt-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
                <Smartphone className="size-4 text-ink-3" aria-hidden="true" />
                Dispositivos que reciben Push
                <Tag tone={devices.length > 0 ? "accent" : "neutral"}>
                  {devices.length}
                </Tag>
              </h3>
              <p className="mt-0.5 text-xs text-ink-3">
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
                    className="btn-secondary"
                  >
                    <BellOff className="size-4" />
                    Desactivar en este equipo
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleSubscribeThisDevice}
                    className="btn-primary"
                  >
                    <BellRing className="size-4" />
                    Activar Push en este equipo
                  </button>
                )
              ) : (
                <span className="alert alert-warning p-3 text-xs">
                  Para Push en iPhone: abrí en Safari → Compartir → Agregar a inicio.
                </span>
              )}

              <button
                type="button"
                disabled={isPending || devices.length === 0}
                onClick={handleSendTest}
                className="btn-secondary"
              >
                <Send className="size-4" />
                Probar aviso
              </button>

              <button
                type="button"
                disabled={isPending || devices.length === 0}
                onClick={handleSendPendingSummaryNow}
                className="btn-secondary"
              >
                Enviar pendientes ahora
              </button>
            </div>
          </div>

          {feedback && (
            <div
              role={feedback.type === "ok" ? "status" : "alert"}
              className={`alert cui-pop ${
                feedback.type === "ok" ? "alert-success" : "alert-danger"
              }`}
            >
              <p className="text-ink">{feedback.text}</p>
            </div>
          )}

          {devices.length > 0 && (
            <div className="divide-y divide-line overflow-hidden rounded-panel border border-line text-sm">
              {devices.map((dev) => {
                const isThisOne = dev.endpoint === localEndpoint;
                return (
                  <div
                    key={dev.id}
                    className="flex items-center justify-between gap-2 bg-surface px-3.5 py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Smartphone className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                      <span className="truncate font-medium text-ink">
                        {dev.deviceLabel}
                      </span>
                      {isThisOne && <Tag tone="success">Este dispositivo</Tag>}
                    </div>
                    <button
                      type="button"
                      title="Eliminar dispositivo"
                      aria-label={`Eliminar dispositivo ${dev.deviceLabel}`}
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
                      className="icon-button icon-button-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <details className="rounded-panel border border-line bg-subtle p-3 text-xs text-ink-2">
            <summary className="min-h-9 cursor-pointer select-none content-center font-medium text-ink">
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
                  className="font-medium text-accent-ink underline underline-offset-2"
                >
                  cron-job.org
                </a>{" "}
                (gratis, cada 15 minutos):
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  aria-label="URL del cron"
                  value={cronUrl}
                  className="field min-h-10 flex-1 font-mono text-[0.6875rem] text-ink-2"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(cronUrl);
                    setCopiedCron(true);
                    setTimeout(() => setCopiedCron(false), 2000);
                  }}
                  className="btn-secondary min-h-10 px-3"
                >
                  {copiedCron ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copiedCron ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
