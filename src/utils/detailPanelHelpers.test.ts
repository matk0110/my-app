import { describe, it, expect } from 'vitest'
import {
  fmt,
  fmtDate,
  fmtCurrency,
  getStatusPillColors,
  getProgressBarColor,
  STATUS_COLORS,
} from './detailPanelHelpers'

// ── fmt ─────────────────────────────────────────────────────────────

describe('fmt', () => {
  it('returns em dash for undefined', () => {
    expect(fmt(undefined)).toBe('—')
  })

  it('returns em dash for null', () => {
    expect(fmt(null)).toBe('—')
  })

  it('returns em dash for empty string', () => {
    expect(fmt('')).toBe('—')
  })

  it('returns stringified number', () => {
    expect(fmt(42)).toBe('42')
  })

  it('returns string value as-is', () => {
    expect(fmt('hello')).toBe('hello')
  })

  it('returns "0" for number zero (not em dash)', () => {
    expect(fmt(0)).toBe('0')
  })
})

// ── fmtDate ─────────────────────────────────────────────────────────

describe('fmtDate', () => {
  it('returns em dash for undefined', () => {
    expect(fmtDate(undefined)).toBe('—')
  })

  it('returns em dash for empty string', () => {
    expect(fmtDate('')).toBe('—')
  })

  it('returns em dash for invalid date', () => {
    expect(fmtDate('not-a-date')).toBe('—')
  })

  it('formats valid date in en-US short format', () => {
    const result = fmtDate('2025-06-15T12:00:00.000Z')
    expect(result).toContain('Jun')
    expect(result).toContain('2025')
    // Day may be 14 or 15 depending on timezone; just verify it's a number
    expect(result).toMatch(/\d{1,2}/)
  })
})

// ── fmtCurrency ─────────────────────────────────────────────────────

describe('fmtCurrency', () => {
  it('returns em dash for undefined', () => {
    expect(fmtCurrency(undefined)).toBe('—')
  })

  it('returns em dash for empty string', () => {
    expect(fmtCurrency('')).toBe('—')
  })

  it('returns raw string for non-numeric value', () => {
    expect(fmtCurrency('N/A')).toBe('N/A')
  })

  it('formats numeric value as USD currency', () => {
    const result = fmtCurrency('50000')
    expect(result).toContain('$')
    expect(result).toContain('50,000')
  })

  it('handles decimal amounts (no fraction digits)', () => {
    const result = fmtCurrency('1234.56')
    expect(result).toContain('$')
    expect(result).toContain('1,235')
  })
})

// ── getStatusPillColors ─────────────────────────────────────────────

describe('getStatusPillColors', () => {
  it('returns correct colors for NotStarted', () => {
    const c = getStatusPillColors('NotStarted')
    expect(c).toEqual(STATUS_COLORS.NotStarted)
  })

  it('returns correct colors for InProgress', () => {
    const c = getStatusPillColors('InProgress')
    expect(c).toEqual(STATUS_COLORS.InProgress)
  })

  it('returns correct colors for Completed', () => {
    const c = getStatusPillColors('Completed')
    expect(c).toEqual(STATUS_COLORS.Completed)
  })

  it('returns correct colors for Blocked', () => {
    const c = getStatusPillColors('Blocked')
    expect(c).toEqual(STATUS_COLORS.Blocked)
  })

  it('returns correct colors for Planning', () => {
    expect(getStatusPillColors('Planning')).toEqual(STATUS_COLORS.Planning)
  })

  it('returns correct colors for Cancelled', () => {
    expect(getStatusPillColors('Cancelled')).toEqual(STATUS_COLORS.Cancelled)
  })

  it('returns correct colors for Active', () => {
    expect(getStatusPillColors('Active')).toEqual(STATUS_COLORS.Active)
  })

  it('returns correct colors for Retired', () => {
    expect(getStatusPillColors('Retired')).toEqual(STATUS_COLORS.Retired)
  })

  it('returns correct colors for Maintenance', () => {
    expect(getStatusPillColors('Maintenance')).toEqual(STATUS_COLORS.Maintenance)
  })

  it('returns default gray for unknown status', () => {
    const c = getStatusPillColors('UnknownStatus')
    expect(c).toEqual({ bg: '#f0f0f0', fg: '#5a5a5a' })
  })

  it('returns default gray for undefined', () => {
    const c = getStatusPillColors(undefined)
    expect(c).toEqual({ bg: '#f0f0f0', fg: '#5a5a5a' })
  })
})

// ── getProgressBarColor ─────────────────────────────────────────────

describe('getProgressBarColor', () => {
  it('returns gray (#d1d5db) for 0%', () => {
    expect(getProgressBarColor(0)).toBe('#d1d5db')
  })

  it('returns green (#107c41) for 100%', () => {
    expect(getProgressBarColor(100)).toBe('#107c41')
  })

  it('returns green (#107c41) for >100%', () => {
    expect(getProgressBarColor(150)).toBe('#107c41')
  })

  it('returns blue (#0f6cbd) for 60-99%', () => {
    expect(getProgressBarColor(60)).toBe('#0f6cbd')
    expect(getProgressBarColor(75)).toBe('#0f6cbd')
    expect(getProgressBarColor(99)).toBe('#0f6cbd')
  })

  it('returns orange (#ca5010) for 1-59%', () => {
    expect(getProgressBarColor(1)).toBe('#ca5010')
    expect(getProgressBarColor(30)).toBe('#ca5010')
    expect(getProgressBarColor(59)).toBe('#ca5010')
  })
})
