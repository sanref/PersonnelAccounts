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

export function NavShell({
  peopleLinks,
}: {
  peopleLinks: Array<{ slug: string; name: string }>;
}) {
  const pathname = usePathname();

  const isHome = pathname === "/";
  const isPagos = pathname.startsWith("/pagos");
  const isConfig = pathname.startsWith("/config");

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 font-bold text-slate-900">
              <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </span>
              <span>MultiCuentas</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1 text-sm">
              <Link
                href="/"
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  isHome
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                Inicio
              </Link>
              {peopleLinks.map((p) => {
                const active = pathname === `/personas/${p.slug}`;
                return (
                  <Link
                    key={p.slug}
                    href={`/personas/${p.slug}`}
                    className={`px-3 py-1.5 rounded-lg font-medium transition ${
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {p.name}
                  </Link>
                );
              })}
              <span className="h-4 w-px bg-slate-200 mx-1" />
              <Link
                href="/pagos"
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  isPagos
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                Pagos Mensuales
              </Link>
              <Link
                href="/config"
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  isConfig
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                Configuración
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/export"
              title="Descargar Backup Excel (.xlsx)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Excel</span>
            </a>
            <form action={logoutAdminAction}>
              <button
                type="submit"
                title="Cerrar sesión"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Barra inferior para celular */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex items-center justify-around py-2 px-1 text-xs">
        <Link
          href="/"
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${
            isHome ? "text-slate-900 font-semibold" : "text-slate-500"
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Saldos</span>
        </Link>
        <Link
          href="/pagos"
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${
            isPagos ? "text-slate-900 font-semibold" : "text-slate-500"
          }`}
        >
          <CalendarCheck2 className="w-4 h-4" />
          <span>Pagos</span>
        </Link>
        <Link
          href="/config"
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${
            isConfig ? "text-slate-900 font-semibold" : "text-slate-500"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Config</span>
        </Link>
      </nav>
    </>
  );
}
