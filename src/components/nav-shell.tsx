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

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 lg:gap-6">
            <Link
              href="/"
              className="flex min-h-11 shrink-0 items-center gap-2.5 text-sm font-bold tracking-tight text-slate-900"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Wallet className="size-4" />
              </span>
              <span className="hidden sm:inline">MultiCuentas</span>
            </Link>

            <nav
              aria-label="Navegación principal"
              className="hidden items-center gap-1 text-sm md:flex"
            >
              {destinations.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 font-medium ${
                    isActive(href)
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <a
              href="/api/export"
              title="Descargar backup Excel (.xlsx)"
              aria-label="Descargar backup Excel (.xlsx)"
              className="btn-secondary px-3 md:hidden lg:inline-flex"
            >
              <Download className="size-4" />
              <span className="hidden lg:inline">Backup</span>
            </a>
            <details className="relative lg:hidden">
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
            <div className="hidden lg:block">
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
            className="border-t border-slate-100 px-4 py-2 sm:px-6 lg:px-8"
          >
            <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
              {peopleLinks.map((p) => (
                <Link
                  key={p.slug}
                  href={`/personas/${p.slug}`}
                  aria-current={
                    activePerson?.slug === p.slug ? "page" : undefined
                  }
                  className={`inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-sm font-medium ${
                    activePerson?.slug === p.slug
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      <nav
        aria-label="Navegación móvil"
        className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-slate-200 bg-white/95 px-2 pt-2 backdrop-blur-sm md:hidden"
      >
        {destinations.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex min-h-12 min-w-20 flex-col items-center justify-center gap-1 rounded-lg px-3 text-xs ${
              isActive(href)
                ? "bg-slate-100 font-semibold text-slate-900"
                : "text-slate-600 hover:bg-slate-100"
            }`}
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
