"use client";

import {
  deletePushSubscriptionAction,
  savePushSubscriptionAction,
} from "@/app/actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function detectDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Dispositivo";
  const ua = navigator.userAgent;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  let os = "Web";
  if (/iPhone|iPad|iPod/i.test(ua)) os = "iPhone/iPad";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "Mac";

  let browser = "Navegador";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  return `${os} · ${isStandalone ? "App PWA" : browser}`;
}

export function isPushSupportedInBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function ensureServiceWorkerRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  // En Android Chrome PWA instalado, habilita chequeo periódico en segundo plano si está disponible
  const regWithPeriodic = reg as ServiceWorkerRegistration & {
    periodicSync?: {
      register: (tag: string, opts: { minInterval: number }) => Promise<void>;
    };
  };
  if (regWithPeriodic.periodicSync) {
    regWithPeriodic.periodicSync
      .register("mc-due-check", { minInterval: 60 * 60 * 1000 })
      .catch(() => {});
  }

  return reg;
}

export async function getActivePushEndpoint(): Promise<string | null> {
  if (!isPushSupportedInBrowser()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

export async function subscribeDeviceToPush(
  vapidPublicKey: string
): Promise<{ ok: boolean; error?: string; endpoint?: string }> {
  if (!isPushSupportedInBrowser()) {
    return {
      ok: false,
      error:
        "Este navegador no soporta notificaciones Push. En iPhone primero agregá la app a Pantalla de Inicio desde Safari.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      error: "Permiso de notificaciones denegado en el navegador.",
    };
  }

  const reg = await ensureServiceWorkerRegistered();
  if (!reg) {
    return { ok: false, error: "No se pudo registrar el Service Worker." };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh ?? "";
  const auth = json.keys?.auth ?? "";

  await savePushSubscriptionAction({
    endpoint: sub.endpoint,
    p256dh,
    auth,
    deviceLabel: detectDeviceLabel(),
  });

  return { ok: true, endpoint: sub.endpoint };
}

export async function unsubscribeCurrentDeviceFromPush(): Promise<void> {
  if (!isPushSupportedInBrowser()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await deletePushSubscriptionAction({ endpoint });
  }
}
