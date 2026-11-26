"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getMonthRange,
  MAX_RANGE_DAYS,
  validateDateRange,
  type DateRange,
  type GroupMode,
} from "@/lib/date-range";
import { todayISO } from "@/lib/school-data-types";

export type { DateRange, GroupMode };

const isValidISODate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

const daysBetweenInclusive = (desde: string, hasta: string): number => {
  const start = new Date(`${desde}T12:00:00Z`).valueOf();
  const end = new Date(`${hasta}T12:00:00Z`).valueOf();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return Math.round((end - start) / 86_400_000) + 1;
};

const formatShortDate = (value: string): string => {
  if (!isValidISODate(value)) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
};

const formatRangeLabel = (range: DateRange): string => {
  if (!isValidISODate(range.desde) || !isValidISODate(range.hasta)) return "Selecciona un periodo";
  if (range.desde === range.hasta) return formatShortDate(range.desde);
  return `${formatShortDate(range.desde)} – ${formatShortDate(range.hasta)}`;
};

const getWeekRange = (): DateRange => {
  const today = todayISO();
  const anchor = new Date(`${today}T12:00:00Z`);
  const offset = (anchor.getUTCDay() + 6) % 7;
  const start = new Date(anchor);
  start.setUTCDate(anchor.getUTCDate() - offset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    desde: start.toISOString().slice(0, 10),
    hasta: end.toISOString().slice(0, 10),
  };
};

const getTodayRange = (): DateRange => {
  const today = todayISO();
  return { desde: today, hasta: today };
};

type Shortcut = { id: string; label: string; getRange: () => DateRange };

const SHORTCUTS: Shortcut[] = [
  { id: "today", label: "Hoy", getRange: getTodayRange },
  { id: "week", label: "Esta semana", getRange: getWeekRange },
  { id: "month", label: "Este mes", getRange: () => getMonthRange(0) },
  { id: "last-month", label: "Mes pasado", getRange: () => getMonthRange(-1) },
];

const CalendarIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M7 3v4M17 3v4M3 10h18" />
  </svg>
);

const ChevronIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const GROUP_MODE_OPTIONS: { value: GroupMode; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "mes", label: "Mes" },
  { value: "ano", label: "Año" },
];

export function GroupModeControl({
  value,
  onChange,
  label = "Agrupar por",
}: {
  value: GroupMode;
  onChange: (next: GroupMode) => void;
  label?: string;
}) {
  return (
    <div className="group-mode-control" role="group" aria-label={label}>
      <span className="group-mode-label">{label}:</span>
      <div className="group-mode-segmented">
        {GROUP_MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "active" : ""}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DateRangeFilter({ initial }: { initial: DateRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [draftDesde, setDraftDesde] = useState(initial.desde);
  const [draftHasta, setDraftHasta] = useState(initial.hasta);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstShortcutRef = useRef<HTMLButtonElement>(null);
  const desdeRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const current = useMemo<DateRange>(() => {
    const desde = searchParams.get("desde") ?? "";
    const hasta = searchParams.get("hasta") ?? "";
    if (validateDateRange(desde, hasta)) return { desde, hasta };
    return initial;
  }, [initial, searchParams]);

  const apply = useCallback((next: DateRange) => {
    if (!validateDateRange(next.desde, next.hasta)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("desde", next.desde);
    params.set("hasta", next.hasta);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      router.refresh();
    });
  }, [pathname, router, searchParams]);

  const closePanel = useCallback((restoreFocus = true) => {
    setOpen(false);
    setCustomMode(false);
    setError("");
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openPanel = useCallback(() => {
    setDraftDesde(current.desde);
    setDraftHasta(current.hasta);
    setError("");
    setCustomMode(false);
    setOpen(true);
  }, [current.desde, current.hasta]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && containerRef.current && !containerRef.current.contains(target)) {
        closePanel(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closePanel(true);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closePanel, open]);

  useEffect(() => {
    if (!open) return;
    if (customMode) {
      desdeRef.current?.focus();
    } else {
      firstShortcutRef.current?.focus();
    }
  }, [customMode, open]);

  const selectShortcut = (shortcut: Shortcut) => {
    const range = shortcut.getRange();
    apply(range);
    closePanel(true);
  };

  const enterCustomMode = () => {
    setDraftDesde(current.desde);
    setDraftHasta(current.hasta);
    setError("");
    setCustomMode(true);
  };

  const submitCustom = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidISODate(draftDesde) || !isValidISODate(draftHasta)) {
      setError("Selecciona una fecha válida en ambos campos.");
      return;
    }
    if (draftDesde > draftHasta) {
      setError("La fecha inicial no puede ser posterior a la final.");
      return;
    }
    if (daysBetweenInclusive(draftDesde, draftHasta) > MAX_RANGE_DAYS) {
      setError(`El rango no puede exceder ${MAX_RANGE_DAYS} días.`);
      return;
    }
    apply({ desde: draftDesde, hasta: draftHasta });
    closePanel(true);
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      if (!open) {
        event.preventDefault();
        openPanel();
      }
    }
  };

  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="date-range-filter" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="date-range-trigger"
        onClick={() => (open ? closePanel(true) : openPanel())}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Periodo: ${formatRangeLabel(current)}. Abrir selector de fechas`}
        disabled={isPending}
      >
        <span className="date-range-trigger-icon"><CalendarIcon /></span>
        <span className="date-range-trigger-label">{formatRangeLabel(current)}</span>
        <span className={`date-range-trigger-chevron ${open ? "open" : ""}`}><ChevronIcon /></span>
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="date-range-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Seleccionar periodo"
          onKeyDown={onPanelKeyDown}
        >
          {!customMode ? (
            <>
              <p className="date-range-panel-title">Selecciona un periodo</p>
              <ul className="date-range-shortcuts" role="list">
                {SHORTCUTS.map((shortcut, index) => (
                  <li key={shortcut.id}>
                    <button
                      ref={index === 0 ? firstShortcutRef : undefined}
                      type="button"
                      className="date-range-shortcut"
                      onClick={() => selectShortcut(shortcut)}
                      disabled={isPending}
                    >
                      {shortcut.label}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="date-range-shortcut date-range-shortcut-custom"
                    onClick={enterCustomMode}
                    disabled={isPending}
                  >
                    Rango personalizado
                  </button>
                </li>
              </ul>
            </>
          ) : (
            <form className="date-range-custom" onSubmit={submitCustom} noValidate>
              <p className="date-range-panel-title">Rango personalizado</p>
              <div className="date-range-custom-fields">
                <label>
                  Desde
                  <input
                    ref={desdeRef}
                    type="date"
                    value={draftDesde}
                    max={draftHasta || undefined}
                    onChange={(event) => { setDraftDesde(event.target.value); setError(""); }}
                    disabled={isPending}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    value={draftHasta}
                    min={draftDesde || undefined}
                    onChange={(event) => { setDraftHasta(event.target.value); setError(""); }}
                    disabled={isPending}
                  />
                </label>
              </div>
              {error && <p className="date-range-error" role="alert">{error}</p>}
              <div className="date-range-custom-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => { setCustomMode(false); setError(""); }}
                  disabled={isPending}
                >
                  Volver
                </button>
                <button type="submit" className="primary-button" disabled={isPending}>
                  {isPending ? "Aplicando…" : "Aplicar"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
