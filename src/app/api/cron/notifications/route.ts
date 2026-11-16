import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import {
  dispatchDueNotifications,
  getOrCreateNotificationSettings,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

async function isAuthorizedRequest(req: NextRequest): Promise<boolean> {
  // 1. Admin logueado desde el navegador / PWA / Service Worker
  const cookieToken = req.cookies.get(ADMIN_COOKIE)?.value;
  if (cookieToken && (await verifyAdminToken(cookieToken))) {
    return true;
  }

  // 2. Clave propia de cron (?key=... o header x-cron-key)
  const settings = await getOrCreateNotificationSettings();
  const urlKey = req.nextUrl.searchParams.get("key")?.trim();
  const headerKey = req.headers.get("x-cron-key")?.trim();
  if (settings.cronSecret && (urlKey === settings.cronSecret || headerKey === settings.cronSecret)) {
    return true;
  }

  // 3. Vercel Cron (Authorization: Bearer CRON_SECRET o agente vercel-cron cuando no se definió CRON_SECRET)
  const authHeader = req.headers.get("authorization") ?? "";
  const envCronSecret = process.env.CRON_SECRET?.trim();
  if (envCronSecret && authHeader === `Bearer ${envCronSecret}`) {
    return true;
  }
  if (!envCronSecret && req.headers.get("user-agent")?.includes("vercel-cron")) {
    return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorizedRequest(req))) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const result = await dispatchDueNotifications();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorizedRequest(req))) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const result = await dispatchDueNotifications();
  return NextResponse.json(result);
}
