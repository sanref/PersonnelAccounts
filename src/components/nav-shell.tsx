"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck2,
  Settings,
  Download,
  LogOut,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { logoutAdminAction } from "@/app/actions";
import { FontSizeControl } from "@/components/font-size-control";
import { NotificationBell } from "@/components/notification-bell";
import type {
  DueAlertItem,
  PublicNotificationSettings,
} from "@/lib/notifications";

const destinations = [
  { href: "/", label: "Resumen", Icon: LayoutDashboard },
  { href: "/pagos", label: "Pagos mensuales", Icon: CalendarCheck2 },
  { href: "/config", label: "Configuración", Icon: Settings },
];

export function NavShell({
  peopleLinks,
  notificationAlerts,
  notificationSettings,
}: {
  peopleLinks: Array<{ slug: string; name: string }>;
  notificationAlerts: DueAlertItem[];
  notificationSettings: PublicNotificationSettings;
}) {
  const pathname = usePathname();
  const activePerson = peopleLinks.find(
    (p) => pathname === `/personas/${p.slug}`,
  );
  const activeLabel =
    activePerson?.name ??
    destinations.find((d) =>
      d.href === "/" ? pathname === "/" : pathname.startsWith(d.href),
    )?.label ??
    "MultiCuentas";
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white focus:translate-y-0"
      >
        Ir al contenido
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <Link
          href="/"
          className="flex h-20 shrink-0 items-center gap-3 px-6 font-semibold tracking-tight"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Wallet className="size-4" />
          </span>
          MultiCuentas
        </Link>
        <div className="flex-1 space-y-8 overflow-y-auto px-3 py-4">
          <nav aria-label="Navegación principal" className="space-y-1">
            {destinations.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isActive(href) ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Cuentas por persona" className="space-y-1">
            <p className="eyebrow mb-3 px-3">Cuentas administradas</p>
            {peopleLinks.map((p) => (
              <Link
                key={p.slug}
                href={`/personas/${p.slug}`}
                aria-current={
                  activePerson?.slug === p.slug ? "page" : undefined
                }
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${activePerson?.slug === p.slug ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium">
                  {p.name.slice(0, 1)}
                </span>
                <span className="truncate">{p.name}</span>
              </Link>
            ))}
            {peopleLinks.length === 0 && (
              <Link
                href="/config"
                className="btn-ghost w-full justify-start text-xs"
              >
                Agregar una persona
              </Link>
            )}
          </nav>
        </div>
        <div className="space-y-3 border-t border-slate-100 p-4">
          <a href="/api/export" className="btn-secondary w-full">
            <Download className="size-4" />
            Descargar backup
          </a>
          <p className="text-center text-xs text-slate-500">
            Administración personal y familiar
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2 text-sm font-semibold tracking-tight lg:hidden"
          >
            <Wallet className="size-5" />
            <span>MultiCuentas</span>
          </Link>
          <div className="hidden items-center gap-2 text-sm lg:flex">
            <span className="text-slate-500">Mi espacio</span>
            <ChevronRight className="size-3 text-slate-400" />
            <span className="font-medium">{activeLabel}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <details className="relative sm:hidden">
              <summary
                aria-label="Cambiar tamaño de letra"
                className="icon-button list-none text-xs font-semibold"
              >
                Aa
              </summary>
              <div className="absolute right-0 top-full mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xs">
                <FontSizeControl variant="inline" />
              </div>
            </details>
            <div className="hidden sm:block">
              <FontSizeControl variant="inline" />
            </div>
            <NotificationBell
              alerts={notificationAlerts}
              settings={notificationSettings}
            />
            <form action={logoutAdminAction}>
              <button
                type="submit"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="icon-button hover:bg-rose-50 hover:text-rose-700"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
        {peopleLinks.length > 0 && (
          <nav
            aria-label="Cuentas por persona"
            className="flex gap-2 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden"
          >
            {peopleLinks.map((p) => (
              <Link
                key={p.slug}
                href={`/personas/${p.slug}`}
                aria-current={
                  activePerson?.slug === p.slug ? "page" : undefined
                }
                className={`inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-xs font-medium ${activePerson?.slug === p.slug ? "border-slate-300 bg-slate-100 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {p.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <nav
        aria-label="Navegación móvil"
        className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-slate-200 bg-white/95 px-2 pt-2 backdrop-blur-sm lg:hidden"
      >
        {destinations.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex min-h-12 min-w-20 flex-col items-center justify-center gap-1 rounded-lg px-3 text-xs ${isActive(href) ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-500 hover:bg-slate-50"}`}
          >
            <Icon className="size-4" />
            <span>
              {label === "Pagos mensuales"
                ? "Pagos"
                : label === "Configuración"
                  ? "Ajustes"
                  : label}
            </span>
          </Link>
        ))}
      </nav>
    </>
  );
}
