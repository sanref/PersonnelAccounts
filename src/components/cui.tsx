import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  History,
  Share2,
  type LucideProps,
} from "lucide-react";

/*
 * Componentes portados de CUI (github.com/yappologistic/CUI). Sin estado ni hooks,
 * así que sirven tanto en Server como en Client Components. Las clases base viven
 * en globals.css (.tag, .avatar, .segmented, .alert, .panel-header…).
 */

type Icon = ComponentType<LucideProps>;

export type Tone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "orange"
  | "danger"
  | "iris"
  | "solid";

const TAG_TONE: Record<Tone, string> = {
  neutral: "tag-neutral",
  accent: "tag-accent",
  success: "tag-success",
  warning: "tag-warning",
  orange: "tag-orange",
  danger: "tag-danger",
  iris: "tag-iris",
  solid: "tag-solid",
};

/** Etiqueta de estado: tinte suave + borde del mismo tono + ícono opcional. */
export function Tag({
  tone = "neutral",
  icon: IconCmp,
  children,
  className = "",
  title,
}: {
  tone?: Tone;
  icon?: Icon;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={`tag ${TAG_TONE[tone]} ${className}`} title={title}>
      {IconCmp && <IconCmp aria-hidden="true" />}
      {children}
    </span>
  );
}

/* Estados de dominio: un único lugar para que cada estado tenga siempre el mismo color. */
export function PaidTag({ children = "Pagado" }: { children?: ReactNode }) {
  return (
    <Tag tone="success" icon={CheckCircle2}>
      {children}
    </Tag>
  );
}

export function PendingTag({ children = "Pendiente" }: { children?: ReactNode }) {
  return (
    <Tag tone="warning" icon={Clock3}>
      {children}
    </Tag>
  );
}

export function CarryOverTag({ children }: { children: ReactNode }) {
  return (
    <Tag tone="orange" icon={History}>
      {children}
    </Tag>
  );
}

export function SettledTag({ children = "Descontado" }: { children?: ReactNode }) {
  return (
    <Tag tone="accent" icon={ArrowDownToLine}>
      {children}
    </Tag>
  );
}

export function SharedTag({ children = "Compartido" }: { children?: ReactNode }) {
  return (
    <Tag tone="iris" icon={Share2}>
      {children}
    </Tag>
  );
}

/* ---------- Avatar ---------- */

const AVATAR_SIZE = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
} as const;

function hashSeed(seed: string | number) {
  if (typeof seed === "number") return Math.abs(seed);
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Índice de tinte (0-5) estable por persona; usalo para colorear otras piezas de la misma persona. */
export function personHue(seed: string | number) {
  return hashSeed(seed) % 6;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Avatar con iniciales y un tinte por persona (CUI badges/avatars). */
export function Avatar({
  name,
  seed,
  size = "md",
  className = "",
}: {
  name: string;
  /** Normalmente el id de la persona; por defecto el nombre. */
  seed?: string | number;
  size?: keyof typeof AVATAR_SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-hue={personHue(seed ?? name)}
      className={`avatar ${AVATAR_SIZE[size]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}

/* ---------- Progreso ---------- */

const BAR_TONE: Record<"accent" | "success" | "warning" | "danger" | "ink", string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  ink: "bg-ink",
};

export function ProgressBar({
  value,
  max = 100,
  tone = "accent",
  label,
  className = "",
}: {
  value: number;
  max?: number;
  tone?: keyof typeof BAR_TONE;
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-muted ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${BAR_TONE[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ---------- Cabecera de tarjeta ---------- */

export function PanelHeader({
  title,
  description,
  icon: IconCmp,
  action,
  id,
  as: Heading = "h2",
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: Icon;
  action?: ReactNode;
  id?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className="panel-header">
      <div className="min-w-0">
        <Heading id={id} className="panel-title">
          {IconCmp && (
            <IconCmp className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
          )}
          {title}
        </Heading>
        {description && (
          <p className="mt-0.5 text-xs text-ink-3">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ---------- Métrica (CUI card "Weekly installs") ---------- */

export function Stat({
  label,
  icon: IconCmp,
  value,
  footer,
  valueClassName = "",
}: {
  label: string;
  icon?: Icon;
  value: ReactNode;
  footer?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm text-ink-2">
        {IconCmp && <IconCmp className="size-4 text-ink-3" aria-hidden="true" />}
        {label}
      </p>
      <p
        className={`num break-words text-2xl font-medium sm:text-[1.875rem] ${valueClassName}`}
      >
        {value}
      </p>
      {footer}
    </div>
  );
}

/* ---------- Control segmentado ---------- */

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: Icon;
  href?: string;
};

/**
 * Pestañas compactas. Con `href` en cada opción renderiza links (sirve en Server
 * Components); si no, botones con `onChange` (solo desde Client Components).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (next: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`segmented ${className}`}>
      {options.map(({ value: v, label: l, icon: IconCmp, href }) => {
        const selected = v === value;
        const content = (
          <>
            {IconCmp && <IconCmp className="size-4" aria-hidden="true" />}
            {l}
          </>
        );
        return href ? (
          <Link
            key={v}
            href={href}
            aria-current={selected ? "page" : undefined}
            className="segmented-item"
          >
            {content}
          </Link>
        ) : (
          <button
            key={v}
            type="button"
            aria-pressed={selected}
            onClick={onChange ? () => onChange(v) : undefined}
            className="segmented-item"
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
