export type Currency = "ARS" | "USD";

/**
 * Formatea un número con separador de miles "." y decimales "," (ej: 236.254,56)
 * de forma determinística sin depender del ICU del navegador o servidor.
 */
export function formatNumberAR(
  value: number | string | null | undefined,
  decimals = 2
): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0,00";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const formatted = decPart !== undefined ? `${withThousands},${decPart}` : withThousands;
  return n < -0.004 ? `-${formatted}` : formatted;
}

/**
 * Formatea montos al estilo "$ 236.254,56" o "US$ 1.597,16" (y "-$ 23.317,11" para negativos).
 */
export function formatMoney(
  value: number | string | null | undefined,
  currency: string = "ARS"
): string {
  const n = Number(value ?? 0);
  const prefix = currency === "USD" ? "US$ " : "$ ";
  if (!Number.isFinite(n)) return `${prefix}0,00`;
  const absFormatted = formatNumberAR(Math.abs(n), 2);
  return n < -0.004 ? `-${prefix}${absFormatted}` : `${prefix}${absFormatted}`;
}

/**
 * Parsea un texto escrito por el usuario en formato argentino o estándar:
 * - "236.254,56" -> 236254.56
 * - "236254,56"  -> 236254.56
 * - "236254.56"  -> 236254.56
 * - "1.500"      -> 1500 (si hay 3 dígitos tras único punto y sin coma, o decimal si 1-2 dígitos)
 */
export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,-]/g, "").trim();
  if (!cleaned || cleaned === "-") return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized = cleaned;
  if (hasComma && hasDot) {
    // El último separador es el decimal
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    const parts = cleaned.split(".");
    // Si tiene múltiples puntos (ej. 1.250.000) o exactamente 3 dígitos luego del punto (ej. 50.000), es miles
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      normalized = cleaned.replace(/\./g, "");
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function formatDateAR(iso: string | null | undefined, dateUnknown?: boolean): string {
  if (dateUnknown || !iso) return "Sin fecha";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const SHORT_MONTH_NAMES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export function formatPeriodLabel(period: string): string {
  const [y, m] = period.split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return period;
  return `${MONTH_NAMES[idx]} ${y}`;
}

export function formatShortPeriodLabel(period: string): string {
  const [y, m] = period.split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return period;
  return `${SHORT_MONTH_NAMES[idx]} ${y}`;
}

export function shiftPeriod(period: string, deltaMonths: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentPeriodISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}
