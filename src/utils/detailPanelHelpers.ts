export function fmt(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === '') return '—'
  return String(val)
}

export function fmtDate(val?: string): string {
  if (!val) return '—'
  const d = new Date(val)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtCurrency(val?: string): string {
  if (!val) return '—'
  const n = parseFloat(val)
  if (Number.isNaN(n)) return val
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export type StatusPillColors = { bg: string; fg: string }

export const STATUS_COLORS: Record<string, StatusPillColors> = {
  NotStarted: { bg: '#f0f0f0', fg: '#5a5a5a' },
  InProgress: { bg: '#dbeafe', fg: '#1d4ed8' },
  Completed: { bg: '#dcfce7', fg: '#15803d' },
  Blocked: { bg: '#fef3c7', fg: '#b45309' },
  Planning: { bg: '#f0f9ff', fg: '#0369a1' },
  OnHold: { bg: '#fef9c3', fg: '#92400e' },
  Cancelled: { bg: '#fee2e2', fg: '#b91c1c' },
  Active: { bg: '#dcfce7', fg: '#15803d' },
  Inactive: { bg: '#f0f0f0', fg: '#5a5a5a' },
  Retired: { bg: '#e0e7ff', fg: '#4338ca' },
  Maintenance: { bg: '#fef9c3', fg: '#92400e' },
}

export function getStatusPillColors(status?: string): StatusPillColors {
  const key = status ?? ''
  return STATUS_COLORS[key] ?? { bg: '#f0f0f0', fg: '#5a5a5a' }
}

export function getProgressBarColor(pct: number): string {
  if (pct === 0) return '#d1d5db'
  if (pct >= 100) return '#107c41'
  if (pct >= 60) return '#0f6cbd'
  return '#ca5010'
}
