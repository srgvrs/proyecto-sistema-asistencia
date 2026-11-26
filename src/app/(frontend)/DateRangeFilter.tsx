"use client";

import { useCallback, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { todayISO } from "@/lib/school-data-types";

export type DateRange = { desde: string; hasta: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isValidISODate = (value: string): boolean => {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

const daysBetween = (desde: string, hasta: string): number => {
  const start = new Date(`${desde}T12:00:00Z`).valueOf();
  const end = new Date(`${hasta}T12:00:00Z`).valueOf();
  return Math.round((end - start) / 86_400_000);
};

export const validateDateRange = (desde: string, hasta: string): boolean =>
  isValidISODate(desde) && isValidISODate(hasta) && desde <= hasta && daysBetween(desde, hasta) <= 366;

export const getDefaultDateRange = (): DateRange => {
  const today = todayISO();
  const [year, month] = today.split("-").map(Number);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { desde: first, hasta: last };
};

const getMonthRange = (offset: number): DateRange => {
  const today = todayISO();
  const [year, month] = today.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1 + offset, 1));
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    desde: `${y}-${String(m).padStart(2, "0")}-01`,
    hasta: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
};

export function DateRangeFilter({ initial }: { initial: DateRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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

  const setDesde = (value: string) => {
    if (!isValidISODate(value)) return;
    apply({ desde: value, hasta: current.hasta });
  };
  const setHasta = (value: string) => {
    if (!isValidISODate(value)) return;
    apply({ desde: current.desde, hasta: value });
  };

  const invalid = !validateDateRange(current.desde, current.hasta);

  return (
    <div className="date-range-filter" role="group" aria-label="Filtrar por periodo">
      <label>
        Desde
        <input type="date" value={current.desde} max={current.hasta} onChange={(event) => setDesde(event.target.value)} disabled={isPending} />
      </label>
      <label>
        Hasta
        <input type="date" value={current.hasta} min={current.desde} onChange={(event) => setHasta(event.target.value)} disabled={isPending} />
      </label>
      <button type="button" className="secondary-button" onClick={() => apply(getMonthRange(0))} disabled={isPending}>Este mes</button>
      <button type="button" className="secondary-button" onClick={() => apply(getMonthRange(-1))} disabled={isPending}>Mes pasado</button>
      {invalid && <small role="alert">El rango no es válido (máximo 366 días).</small>}
    </div>
  );
}
