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
import { Avatar } from "@/components/cui";
import type {
  DueAlertItem,
  PublicNotificationSettings,
} from "@/lib/notifications";

const destinations = [
  { href: "/", label: "Resumen", short: "Resumen", Icon: LayoutDashboard },
  { href: "/pagos", label: "Pagos mensuales", short: "Pagos", Icon: CalendarCheck2 },
  { href: "/config", label: "Configuración", short: "Ajustes", Icon: Settings },
];

type PersonLink = { id: number; slug: string; name: string };

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-control text-ink"
    >
      <span className="flex size-8 items-center justify-center rounded-control bg-accent text-white shadow-rim">
        <Wallet className="size-4" aria-hidden="true" />
      </span>
      <span
        className={`font-display text-base font-medium tracking-tight ${compact ? "hidden sm:inline" : ""}`}
      >
        MultiCuentas
      </span>
    </Link>
  );
}

export function NavShell({
  peopleLinks,
  notificationAlerts,
  notificationSettings,
}: {
  peopleLinks: PersonLink[];
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
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-control bg-ink px-4 py-3 text-sm text-white focus:translate-y-0"
      >
        Ir al contenido
      </a>

      {/* Sidebar de escritorio (CUI sidebar) */}
      <aside
        aria-label="Barra lateral"
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-subtle lg:flex"
      >
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>

        <nav
          aria-label="Navegación principal"
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2"
        >
          <div className="space-y-0.5">
            {destinations.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className="nav-item"
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>

          {peopleLinks.length > 0 && (
            <div className="space-y-0.5">
              <p className="px-3 pb-1.5 text-xs font-medium text-ink-3">
                Cuentas por persona
              </p>
              {peopleLinks.map((p) => (
                <Link
                  key={p.slug}
                  href={`/personas/${p.slug}`}
                  aria-current={
                    activePerson?.slug === p.slug ? "page" : undefined
                  }
                  className="nav-item"
                >
                  <Avatar name={p.name} seed={p.id} size="xs" />
                  <span className="truncate">{p.name}</span>
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className="space-y-3 border-t border-line p-3">
          <div className="flex items-center justify-between gap-2 px-2">
            <span className="text-xs text-ink-3">Tamaño de letra</span>
            <FontSizeControl variant="inline" />
          </div>
          <div className="flex gap-1">
            <a href="/api/export" className="nav-item flex-1">
              <Download className="size-4 shrink-0" aria-hidden="true" />
              Backup Excel
            </a>
            <form action={logoutAdminAction}>
              <button
                type="submit"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="icon-button icon-button-danger"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Barra superior: completa en móvil/tablet, solo acciones en escritorio */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-md lg:static lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none lg:pl-64">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:justify-end lg:px-8">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <Brand compact />
            <nav
              aria-label="Navegación principal"
              className="ml-2 hidden items-center gap-1 md:flex"
            >
              {destinations.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className="nav-item whitespace-nowrap"
                >
                  <Icon className="size-4" aria-hidden="true" />
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
              className="icon-button hidden md:inline-flex lg:hidden"
            >
              <Download className="size-4" />
            </a>
            <details className="relative lg:hidden">
              <summary
                title="Cambiar tamaño de letra"
                aria-label="Cambiar tamaño de letra"
                className="icon-button list-none text-xs font-medium"
              >
                Aa
              </summary>
              <div className="cui-pop absolute right-0 top-full z-40 mt-2 rounded-panel border border-line bg-surface p-2 shadow-float">
                <FontSizeControl variant="inline" />
              </div>
            </details>
            <NotificationBell
              alerts={notificationAlerts}
              settings={notificationSettings}
            />
            <form action={logoutAdminAction} className="lg:hidden">
              <button
                type="submit"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="icon-button icon-button-danger"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>

        {peopleLinks.length > 0 && (
          <nav
            aria-label="Cuentas por persona"
            className="border-t border-line px-4 py-2 sm:px-6 lg:hidden"
          >
            <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
              {peopleLinks.map((p) => {
                const active = activePerson?.slug === p.slug;
                return (
                  <Link
                    key={p.slug}
                    href={`/personas/${p.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm transition-colors ${
                      active
                        ? "border-accent-line bg-accent-soft font-medium text-accent-ink"
                        : "border-line bg-surface text-ink-2 hover:border-line-strong/60 hover:text-ink"
                    }`}
                  >
                    <Avatar name={p.name} seed={p.id} size="sm" />
                    {p.name}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      <nav
        aria-label="Navegación móvil"
        className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-line bg-surface/95 px-2 pt-2 backdrop-blur-md md:hidden"
      >
        {destinations.map(({ href, short, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 min-w-20 flex-col items-center justify-center gap-1 rounded-control px-3 text-xs transition-colors ${
                active
                  ? "font-medium text-accent-ink"
                  : "text-ink-3 hover:bg-muted hover:text-ink"
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-accent-soft" : ""
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span>{short}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
