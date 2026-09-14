export interface TimeRange {
  label: string
  start: string // YYYY-MM-DD inclusive
  end: string // YYYY-MM-DD inclusive
  month: string | null // 'YYYY-MM' when the range is exactly one calendar month
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export function monthRange(year: number, month: number): TimeRange {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  const label = start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return {
    label,
    start: iso(start),
    end: iso(end),
    month: `${year}-${String(month).padStart(2, '0')}`,
  }
}

export function presets(): TimeRange[] {
  const now = new Date()
  const year = now.getFullYear()
  const thisMonth = monthRange(year, now.getMonth() + 1)
  const last30 = new Date(now)
  last30.setDate(last30.getDate() - 29)
  return [
    { label: 'All Time', start: '1970-01-01', end: iso(now), month: null },
    { label: 'This Year', start: `${year}-01-01`, end: iso(now), month: null },
    { label: 'Last 30 Days', start: iso(last30), end: iso(now), month: null },
    { ...thisMonth, label: 'This Month' },
  ]
}

/** Months available for the month picker, newest first, back to a floor year. */
export function monthOptions(floorYear = 2020): TimeRange[] {
  const now = new Date()
  const out: TimeRange[] = []
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  while (y > floorYear || (y === floorYear && m >= 1)) {
    out.push(monthRange(y, m))
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return out
}

export function formatDateMs(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatNumber(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString()
}
