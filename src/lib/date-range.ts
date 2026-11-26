import { todayISO } from "./school-data-types"

export type DateRange = { desde: string; hasta: string }

export type GroupMode = "dia" | "mes" | "ano"

export type PeriodGroup<T> = {
  key: string
  label: string
  count: number
  items: T[]
}

export const MAX_RANGE_DAYS = 800

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isValidISODate = (value: string): boolean => {
  if (!ISO_DATE.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

const daysBetween = (desde: string, hasta: string): number => {
  const start = new Date(`${desde}T12:00:00Z`).valueOf()
  const end = new Date(`${hasta}T12:00:00Z`).valueOf()
  return Math.round((end - start) / 86_400_000)
}

export const validateDateRange = (desde: string, hasta: string): boolean =>
  isValidISODate(desde) && isValidISODate(hasta) && desde <= hasta && daysBetween(desde, hasta) <= MAX_RANGE_DAYS

export const getDefaultDateRange = (): DateRange => {
  const today = todayISO()
  const [year, month] = today.split("-").map(Number)
  const first = `${year}-${String(month).padStart(2, "0")}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  return { desde: first, hasta: last }
}

const MEXICO_TZ = "America/Mexico_City"

const DAY_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/

const capitalize = (value: string): string =>
  value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value

const dayLabelFormatter = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const monthLabelFormatter = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: MEXICO_TZ,
})

const monthKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: MEXICO_TZ,
})

const yearKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  timeZone: MEXICO_TZ,
})

/**
 * Single source of truth for turning a stored value into a school day key.
 * - Day-only values (`YYYY-MM-DDT00:00:00.000Z`) are sliced, no timezone shift.
 * - Real timestamps (entryTime, exitTime, etc.) are formatted in America/Mexico_City.
 */
export const toSchoolDayKey = (value: string | null | undefined): string => {
  if (!value) return ""
  if (DAY_ONLY_PATTERN.test(value)) return value.slice(0, 10)
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ""
  return dayKeyFormatter.format(date)
}

/**
 * Formats a stored timestamp as a Mexico City day key (YYYY-MM-DD).
 * Day-only values are returned as-is so they are never shifted twice.
 */
export const toMexicoDayKey = (value: string | null | undefined): string => toSchoolDayKey(value)

const toMonthKey = (value: string): string => {
  const dayKey = toSchoolDayKey(value)
  if (dayKey) return dayKey.slice(0, 7)
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ""
  return monthKeyFormatter.format(date)
}

const toYearKey = (value: string): string => {
  const dayKey = toSchoolDayKey(value)
  if (dayKey) return dayKey.slice(0, 4)
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ""
  return yearKeyFormatter.format(date)
}

const labelForDay = (dayKey: string): string => {
  if (!isValidISODate(dayKey)) return dayKey
  return capitalize(dayLabelFormatter.format(new Date(`${dayKey}T12:00:00Z`)))
}

const labelForMonth = (monthKey: string): string => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey
  return capitalize(monthLabelFormatter.format(new Date(`${monthKey}-01T12:00:00Z`)))
}

const labelForYear = (yearKey: string): string => yearKey

/** Formats a day key (YYYY-MM-DD) as "Miércoles, 25 de noviembre de 2026". */
export const formatSchoolDay = (dayKey: string): string => labelForDay(dayKey)

/** Formats a stored timestamp as a Mexico City day label ("jueves, 26 de noviembre de 2026"). */
export const formatSchoolDateTime = (value: string | null | undefined): string =>
  labelForDay(toMexicoDayKey(value))

export const groupByPeriod = <T>(
  items: readonly T[],
  getDate: (item: T) => string,
  mode: GroupMode,
): PeriodGroup<T>[] => {
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const raw = getDate(item)
    if (!raw) continue
    const key = mode === "dia" ? toSchoolDayKey(raw) : mode === "mes" ? toMonthKey(raw) : toYearKey(raw)
    if (!key) continue
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }
  const labelFor = mode === "dia" ? labelForDay : mode === "mes" ? labelForMonth : labelForYear
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, groupItems]) => ({
      key,
      label: labelFor(key),
      count: groupItems.length,
      items: groupItems,
    }))
}

export const getMonthRange = (offset: number): DateRange => {
  const today = todayISO()
  const [year, month] = today.split("-").map(Number)
  const base = new Date(Date.UTC(year, month - 1 + offset, 1))
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return {
    desde: `${y}-${String(m).padStart(2, "0")}-01`,
    hasta: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  }
}
