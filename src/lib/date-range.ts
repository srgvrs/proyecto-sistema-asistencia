import { todayISO } from "./school-data-types"

export type DateRange = { desde: string; hasta: string }

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
  isValidISODate(desde) && isValidISODate(hasta) && desde <= hasta && daysBetween(desde, hasta) <= 366

export const getDefaultDateRange = (): DateRange => {
  const today = todayISO()
  const [year, month] = today.split("-").map(Number)
  const first = `${year}-${String(month).padStart(2, "0")}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  return { desde: first, hasta: last }
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
