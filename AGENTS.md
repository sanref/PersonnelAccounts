<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MultiCuentas — guía para agentes

App Next.js 16 (App Router, React 19, Tailwind v4) para administrar cuentas, saldos y pagos mensuales de una familia. Todo el producto está en **español (es-AR)**: labels, mensajes, errores y comentarios.

## Comandos

- `npm run dev` — dev server (Turbopack).
- `npx tsc --noEmit` — typecheck; es la verificación principal (no hay tests ni runner).
- `npm run build` — build de producción; también corre TypeScript.
- `npm run lint` — eslint. Baseline actual **falla** con 4 errores preexistentes (`font-size-control.tsx`, `notification-bell.tsx`, `notification-settings-card.tsx`, `lib/notifications.ts` → `prefer-const`). No los mezcles con tu cambio ni asumas que los rompiste.
- `npm run db:push` — `drizzle-kit push` contra la DB de `.env.local`. No hay `drizzle/` ni migraciones versionadas: todo cambio en `src/db/schema.ts` se aplica con esto sobre Neon (y hay que aplicarlo en producción antes de deployar código que use la columna nueva).
- `npm run db:import` — `scripts/import-excel.ts`: hace **TRUNCATE** de people/accounts/transactions/services/monthly_items y reimporta `_data/MultiCuentas.xlsx`. Destructivo: no lo corras por iniciativa propia.

## Entorno y datos

- `.env.local` (cargado con dotenv solo en `drizzle.config.ts` y `scripts/`): `DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`, opcionales `VAPID_*` / `CRON_SECRET`.
- DB = Neon Postgres con `drizzle-orm/neon-http` (HTTP serverless). **`db.transaction()` no existe** en este driver: para atomicidad usar SQL atómico o `db.batch()`.
- Montos son `numeric(14,2)` → llegan como `string`. Formatear/parsear siempre con `src/lib/format.ts` (`formatMoney`, `formatNumberAR`, `parseMoneyInput`). Evitar `toLocaleString`/`Intl` para dinero: el repo usa formateo determinístico propio.
- La raíz tipográfica no es 16px: 17.5px en móvil y el usuario puede cambiarla (`html[data-font]`). No fijes tamaños en px ni asumas `rem` estándar.

## Arquitectura

- `src/app/actions.ts` — **todas** las Server Actions (`"use server"`). Salvo `loginAdminAction`/`logoutAdminAction`, cada una debe empezar con `await requireAdmin()` y terminar con `revalidateAll()` (= `revalidatePath("/", "layout")`). Esa revalidación ya devuelve el RSC actualizado en la misma respuesta del action, así que `router.refresh()` después es redundante (queda en algunos handlers; inocuo). Para feedback inmediato usar `useOptimistic`.
- `src/app/(admin)/` — área autenticada: layout con `NavShell` + campanita, y páginas `/` (dashboard), `/pagos`, `/config`, `/personas/[slug]`. `src/app/v/[token]` es la vista familiar pública (solo lectura, PIN opcional).
- `src/proxy.ts` es el middleware (Next 16 renombró `middleware` → `proxy`): valida la cookie JWT admin. Si agregás una ruta pública, sumala a la lista de excepciones ahí.
- Links a `/pagos` usan **`?periodo=YYYY-MM`** (no `period`), más `tab=grilla|resumen` y `persona=<id>`.
- `src/lib/queries.ts` — lecturas agregadas (saldos, detalle por persona, datos de `/pagos`). `src/lib/notifications.ts` — ajustes de avisos + `ensurePeriodsInitialized()`.

## Trampa central: `monthly_items` se auto-inicializa

- `getPublicNotificationState()` corre en el layout admin y en `/api/cron/notifications` (cron diario, ver `vercel.json`). Llama a `ensurePeriodsInitialized()`, que **inserta filas en `monthly_items`** para cada servicio activo del catálogo en el mes actual y el horizonte. O sea: **renderizar el layout escribe en la DB**.
- Consecuencia (bug ya corregido): un `DELETE` físico de un ítem con `serviceId` era reinsertado solo y "reaparecía". Regla: quitar un servicio del mes = `status = "SKIPPED"` (tombstone por período), **nunca** borrar la fila; los extras manuales (`serviceId === null`) sí se borran físicamente. Ver `deleteMonthlyItemAction`.
- Cualquier lectura de `monthly_items` que alimente UI, totales o export **debe excluir `status = 'SKIPPED'`** (`ne(monthlyItems.status, "SKIPPED")`). Si agregás una query nueva sobre la tabla, filtrá.
- `ensurePeriodsInitialized` usa `INSERT ... SELECT ... WHERE NOT EXISTS (period, service_id)` para ser idempotente ante ejecuciones concurrentes (layout + cron + refresh). No vuelvas a un `insert` ciego; tampoco hay unique index `(period, service_id)` que te salve.
- `generateMonthItemsAction` ("Traer servicios fijos") restaura los `SKIPPED` a `PENDING`; `missingServicesCount` cuenta justamente esos servicios ocultos.
- Mes: `period` = mes en que se paga/gestiona; `billedPeriod` = mes de la factura. `service.paysInArrears` ⇒ `billedPeriod = period - 1`. Vencimientos por `defaultDueDay` clampeado con `clampDayForPeriod`.
- `settledTransactionId` enlaza el ítem con el egreso creado en la subcuenta: no descontar ítems `SKIPPED` ni ya descontados.
- El FK `monthly_items.service_id` es `ON DELETE SET NULL`: borrar del catálogo conserva los ítems históricos, por eso `deleteServiceAction` limpia antes las tombstones `SKIPPED`.

## UI/UX (resumen de `AGENTS UI UX.md`)

`AGENTS UI UX.md` es un estándar genérico escrito para Angular: su sección 1 (standalone, signals, `@if`, OnPush…, archivos `.scss`) **no aplica**. Aplican las secciones 2–4 adaptadas a este repo:

- Espaciado en múltiplos de 4/8 px (`p-4`/`p-5`, `gap-2/3/4`). Jerarquía por borde fino `border-slate-200` sobre `bg-slate-50`, tarjetas `bg-white`; nada de sombras difusas (`shadow-xs` en cards, `shadow-xl` solo en modales), gradientes ni **dark mode** (no existe ninguna variante `dark:` — no la agregues).
- Radios reales del repo: `rounded-lg` (8px) inputs/botones/badges, `rounded-xl` (12px) paneles, `rounded-2xl` (16px) cards y modales. El doc pide 6px; seguí el repo.
- Color: neutros slate; el acento es `bg-slate-900` sólido y se reserva al CTA principal de cada vista. Colores semánticos solo en badges con fondo suave (`emerald/amber/rose/indigo` en -50/-100).
- Toda cifra, fecha o métrica: `tabular-nums` y alineación a la derecha en tablas.
- Tablas sin bordes verticales, encabezado `text-xs uppercase` sobre `bg-slate-50`, separadores `divide-y`.
- Acciones destructivas piden `confirm()`; botones solo-ícono llevan `title`/`aria-label`; targets táctiles `min-h-11` (se usa mucho desde el celular).
- Reutilizá `src/components/ui-controls.tsx` (`ToggleSwitch`, `MoneyInput`, `InlineMoneyCell`) en lugar de crear inputs nuevos. Para el resto hay primitivas en `globals.css`: `.panel`, `.page-title`, `.eyebrow`, `.btn-primary`/`.btn-secondary`/`.btn-ghost`, `.icon-button`, `.field`/`.field-label`. No repitas esas combinaciones de utilidades a mano.
- Estados: `src/components/ui-feedback.tsx` (`EmptyState`, `FeedbackBanner`) para vacío y error inline con reintento. Modales: `src/components/modal.tsx` (`<dialog>` nativo con foco, Escape y scroll lock) — no vuelvas a los overlays `fixed inset-0`.
- Listados largos: tabla en `hidden md:block` + tarjetas equivalentes en `md:hidden` (ver `monthly-payments-client.tsx` y `payment-mobile-card.tsx`). El layout admin usa sidebar fijo en `lg` (`lg:pl-60`) y barra inferior en móvil: dejá `pb-32 lg:pb-8` y no pongas acciones flotantes sobre la barra.
- `<MonthlyPaymentsClient>` lleva `key` por período/persona/tab en `pagos/page.tsx` para reiniciar filtros locales al navegar; no lo saques.
- Todo interactivo necesita `hover`, `focus-visible` (definido global en `globals.css`) y estado `disabled`. Nunca datos de relleno tipo "Lorem ipsum" o cifras ficticias.
- Sin librerías nuevas de UI: solo Tailwind + `lucide-react`. Pedí aprobación antes de sumar dependencias.
