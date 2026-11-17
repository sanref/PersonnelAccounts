// Calendario de servicios fijos: qué meses generan ítem según su frecuencia.
// Módulo puro (sin acceso a DB) para poder usarlo en servidor y cliente.

export const FREQUENCY_OPTIONS = [
  { value: 1, label: "Mensual" },
  { value: 2, label: "Bimestral" },
  { value: 3, label: "Trimestral" },
  { value: 4, label: "Cuatrimestral" },
  { value: 6, label: "Semestral" },
  { value: 12, label: "Anual" },
] as const;

const VALID_FREQUENCIES: readonly number[] = FREQUENCY_OPTIONS.map((o) => o.value);

const MONTH_NAMES_AR = [
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

export interface ServiceSchedule {
  frequencyMonths: number;
  startMonth: number;
}

export function isValidFrequency(value: number): boolean {
  return VALID_FREQUENCIES.includes(value);
}

export function monthNameAR(month: number): string {
  return MONTH_NAMES_AR[month - 1] ?? String(month);
}

export function frequencyLabel(frequencyMonths: number): string {
  return (
    FREQUENCY_OPTIONS.find((o) => o.value === frequencyMonths)?.label ??
    `Cada ${frequencyMonths} meses`
  );
}

/**
 * ¿Este servicio genera ítem en el período 'YYYY-MM'?
 * Mensual: siempre. Si no, solo en los meses cuyo número coincide con
 * `startMonth` + múltiplos de la frecuencia (12 es divisible por todas las
 * frecuencias válidas, así que no depende del año).
 */
export function serviceAppliesToPeriod(
  schedule: ServiceSchedule,
  period: string
): boolean {
  const freq = schedule.frequencyMonths;
  if (!freq || freq <= 1) return true;
  const month = Number(period.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return true;
  const start = schedule.startMonth >= 1 && schedule.startMonth <= 12 ? schedule.startMonth : 1;
  return (((month - start) % freq) + freq) % freq === 0;
}

/** Meses del año en que cae el servicio, ej. [2, 4, 6, 8, 10, 12]. */
export function scheduledMonths(schedule: ServiceSchedule): number[] {
  const out: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const p = `2000-${String(m).padStart(2, "0")}`;
    if (serviceAppliesToPeriod(schedule, p)) out.push(m);
  }
  return out;
}

/** Texto corto para listas: "Bimestral · feb, abr, jun…" (vacío si es mensual). */
export function scheduleSummary(schedule: ServiceSchedule): string {
  if (schedule.frequencyMonths <= 1) return "";
  const months = scheduledMonths(schedule)
    .map((m) => monthNameAR(m).slice(0, 3).toLowerCase())
    .join(", ");
  return `${frequencyLabel(schedule.frequencyMonths)} · ${months}`;
}
