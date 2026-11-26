"use client";

import { useCallback, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getMonthRange,
  validateDateRange,
  type DateRange,
} from "@/lib/date-range";

export type { DateRange };

const isValidISODate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
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
