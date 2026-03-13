import { describe, it, expect } from 'vitest'
import {
  computeProjectMetrics,
  computeGlobalKPIs,
  computePredictiveInsights,
} from './dashboardCalcs'
import type { DashTaskRecord } from './dashboardCalcs'

// ── Factory helpers ─────────────────────────────────────────────────

function makeTask(overrides: Partial<DashTaskRecord> = {}): DashTaskRecord {
  return {
    TaskID: 'task:t1',
    TaskName: 'Test',
    StartDate: new Date('2025-01-01'),
    EndDate: new Date('2025-12-31'),
    ItemType: 'Activity',
    SourceId: 't1',
    Progress: 0,
    ...overrides,
  }
}

function makeProject(overrides: Partial<DashTaskRecord> = {}): DashTaskRecord {
  return makeTask({
    TaskID: 'project:p1',
    ItemType: 'Project',
    SourceId: 'p1',
    TaskName: 'Project Alpha',
    Progress: 50,
    ...overrides,
  })
}

function makeAsset(overrides: Partial<DashTaskRecord> = {}): DashTaskRecord {
  return makeTask({
    TaskID: 'asset:a1',
    ItemType: 'Asset',
    SourceId: 'a1',
    TaskName: 'Asset One',
    ParentID: 'project:p1',
    Progress: 30,
    ...overrides,
  })
}

function makeActivity(overrides: Partial<DashTaskRecord> = {}): DashTaskRecord {
  return makeTask({
    TaskID: 'activity:act1',
    ItemType: 'Activity',
    SourceId: 'act1',
    AssetId: 'a1',
    TaskName: 'Activity One',
    Progress: 0,
    Status: 'NotStarted',
    ...overrides,
  })
}

// ── computeProjectMetrics ───────────────────────────────────────────

describe('computeProjectMetrics', () => {
  it('returns empty array when no projects', () => {
    const result = computeProjectMetrics([], Date.now(), Date.now())
    expect(result).toEqual([])
  })

  it('counts activity statuses correctly', () => {
    const tasks: DashTaskRecord[] = [
      makeProject(),
      makeAsset(),
      makeActivity({ TaskID: 'activity:1', SourceId: '1', Status: 'Completed' }),
      makeActivity({ TaskID: 'activity:2', SourceId: '2', Status: 'InProgress' }),
      makeActivity({ TaskID: 'activity:3', SourceId: '3', Status: 'Blocked' }),
      makeActivity({ TaskID: 'activity:4', SourceId: '4', Status: 'NotStarted' }),
    ]

    const nowMs = Date.now()
    const todayMs = new Date().setHours(0, 0, 0, 0)
    const result = computeProjectMetrics(tasks, nowMs, todayMs)

    expect(result).toHaveLength(1)
    expect(result[0].completed).toBe(1)
    expect(result[0].inProgress).toBe(1)
    expect(result[0].blocked).toBe(1)
    expect(result[0].notStarted).toBe(1)
    expect(result[0].totalActivities).toBe(4)
    expect(result[0].assetCount).toBe(1)
  })

  describe('health status', () => {
    it('returns "Complete" when progress >= 100', () => {
      const tasks: DashTaskRecord[] = [
        makeProject({ Progress: 100 }),
      ]
      const result = computeProjectMetrics(tasks, Date.now(), Date.now())
      expect(result[0].healthStatus).toBe('Complete')
    })

    it('returns "Not Started" when progress is 0 and elapsed < 5%', () => {
      const start = new Date()
      const end = new Date(start.getTime() + 365 * 86400000)
      const tasks: DashTaskRecord[] = [
        makeProject({ Progress: 0, StartDate: start, EndDate: end }),
      ]
      const nowMs = start.getTime() + 1 * 86400000 // 1 day in on a 365-day project = ~0.3%
      const result = computeProjectMetrics(tasks, nowMs, start.getTime())
      expect(result[0].healthStatus).toBe('Not Started')
    })

    it('returns "Behind" for very low progress vs elapsed time', () => {
      const start = new Date('2025-01-01')
      const end = new Date('2025-12-31')
      const tasks: DashTaskRecord[] = [
        makeProject({ Progress: 5, StartDate: start, EndDate: end }),
      ]
      // Simulate being 80% through the timeline
      const nowMs = start.getTime() + 0.8 * (end.getTime() - start.getTime())
      const result = computeProjectMetrics(tasks, nowMs, start.getTime())
      expect(result[0].healthStatus).toBe('Behind')
    })

    it('returns "Ahead" when progress is well above elapsed time', () => {
      const start = new Date('2025-01-01')
      const end = new Date('2025-12-31')
      const tasks: DashTaskRecord[] = [
        makeProject({ Progress: 80, StartDate: start, EndDate: end }),
      ]
      // 10% elapsed
      const nowMs = start.getTime() + 0.1 * (end.getTime() - start.getTime())
      const result = computeProjectMetrics(tasks, nowMs, start.getTime())
      expect(result[0].healthStatus).toBe('Ahead')
    })
  })

  it('calculates daysOverdue when project is past due and incomplete', () => {
    const start = new Date('2025-01-01')
    const end = new Date('2025-06-01')
    const today = new Date('2025-07-01')
    const tasks: DashTaskRecord[] = [
      makeProject({ Progress: 50, StartDate: start, EndDate: end }),
    ]
    const result = computeProjectMetrics(tasks, today.getTime(), today.getTime())
    expect(result[0].daysOverdue).toBeGreaterThan(0)
    expect(result[0].daysRemaining).toBeLessThan(0)
  })

  it('reports 0 daysOverdue when project is completed', () => {
    const start = new Date('2025-01-01')
    const end = new Date('2025-06-01')
    const today = new Date('2025-07-01')
    const tasks: DashTaskRecord[] = [
      makeProject({ Progress: 100, StartDate: start, EndDate: end }),
    ]
    const result = computeProjectMetrics(tasks, today.getTime(), today.getTime())
    expect(result[0].daysOverdue).toBe(0)
  })

  it('identifies at-risk activities: progress lags behind elapsed time', () => {
    const actStart = new Date('2025-01-01')
    const actEnd = new Date('2025-12-31')
    const tasks: DashTaskRecord[] = [
      makeProject(),
      makeAsset(),
      makeActivity({
        StartDate: actStart,
        EndDate: actEnd,
        Status: 'InProgress',
        Progress: 10,
      }),
    ]
    // 80% elapsed
    const nowMs = actStart.getTime() + 0.8 * (actEnd.getTime() - actStart.getTime())
    const result = computeProjectMetrics(tasks, nowMs, actStart.getTime())
    expect(result[0].atRiskCount).toBe(1)
  })

  it('does not flag completed activities as at-risk', () => {
    const actStart = new Date('2025-01-01')
    const actEnd = new Date('2025-12-31')
    const tasks: DashTaskRecord[] = [
      makeProject(),
      makeAsset(),
      makeActivity({
        StartDate: actStart,
        EndDate: actEnd,
        Status: 'Completed',
        Progress: 10,
      }),
    ]
    const nowMs = actStart.getTime() + 0.8 * (actEnd.getTime() - actStart.getTime())
    const result = computeProjectMetrics(tasks, nowMs, actStart.getTime())
    expect(result[0].atRiskCount).toBe(0)
  })
})

// ── computeGlobalKPIs ───────────────────────────────────────────────

describe('computeGlobalKPIs', () => {
  it('counts all activity statuses correctly', () => {
    const tasks: DashTaskRecord[] = [
      makeProject(),
      makeAsset(),
      makeActivity({ TaskID: 'activity:1', SourceId: '1', Status: 'Completed' }),
      makeActivity({ TaskID: 'activity:2', SourceId: '2', Status: 'InProgress' }),
      makeActivity({ TaskID: 'activity:3', SourceId: '3', Status: 'Blocked' }),
      makeActivity({ TaskID: 'activity:4', SourceId: '4', Status: 'NotStarted' }),
      makeActivity({ TaskID: 'activity:5', SourceId: '5', Status: 'NotStarted' }),
    ]

    const kpis = computeGlobalKPIs(tasks, 2)
    expect(kpis.total).toBe(5)
    expect(kpis.completed).toBe(1)
    expect(kpis.inProgress).toBe(1)
    expect(kpis.blocked).toBe(1)
    expect(kpis.atRisk).toBe(2)
  })

  it('returns zeros for empty tasks', () => {
    const kpis = computeGlobalKPIs([], 0)
    expect(kpis.total).toBe(0)
    expect(kpis.completed).toBe(0)
    expect(kpis.blocked).toBe(0)
  })

  it('ignores non-activity tasks in counts', () => {
    const tasks: DashTaskRecord[] = [makeProject(), makeAsset()]
    const kpis = computeGlobalKPIs(tasks, 0)
    expect(kpis.total).toBe(0)
  })
})

// ── computePredictiveInsights ───────────────────────────────────────

describe('computePredictiveInsights', () => {
  it('returns 100% confidence and zero slip when no projects', () => {
    const result = computePredictiveInsights([], Date.now(), Date.now())
    expect(result.avgConfidence).toBe(100)
    expect(result.predictedMaxSlip).toBe(0)
    expect(result.totalRiskDays).toBe(0)
  })

  it('returns high confidence for projects with all activities on track', () => {
    const start = new Date('2025-01-01')
    const end = new Date('2025-12-31')
    const tasks: DashTaskRecord[] = [
      makeProject({ StartDate: start, EndDate: end }),
      makeAsset(),
      makeActivity({
        StartDate: start,
        EndDate: end,
        Status: 'InProgress',
        Progress: 50,
      }),
    ]
    // 50% through — progress matches elapsed
    const nowMs = start.getTime() + 0.5 * (end.getTime() - start.getTime())
    const result = computePredictiveInsights(tasks, nowMs, start.getTime())
    expect(result.avgConfidence).toBeGreaterThanOrEqual(95)
    expect(result.predictedMaxSlip).toBe(0)
  })

  it('reduces confidence when activities are behind', () => {
    const start = new Date('2025-01-01')
    const end = new Date('2025-12-31')
    const tasks: DashTaskRecord[] = [
      makeProject({ StartDate: start, EndDate: end, Progress: 10 }),
      makeAsset(),
      makeActivity({
        TaskID: 'activity:behind1',
        SourceId: 'behind1',
        StartDate: start,
        EndDate: end,
        Status: 'InProgress',
        Progress: 5,
      }),
      makeActivity({
        TaskID: 'activity:behind2',
        SourceId: 'behind2',
        StartDate: start,
        EndDate: end,
        Status: 'Blocked',
        Progress: 0,
      }),
    ]
    const nowMs = start.getTime() + 0.8 * (end.getTime() - start.getTime())
    const result = computePredictiveInsights(tasks, nowMs, start.getTime())
    expect(result.avgConfidence).toBeLessThan(90)
    expect(result.predictedMaxSlip).toBeGreaterThan(0)
    expect(result.totalRiskDays).toBeGreaterThan(0)
  })

  it('penalizes confidence for late projects', () => {
    const start = new Date('2024-01-01')
    const end = new Date('2024-12-31')
    const today = new Date('2025-06-01')
    const tasks: DashTaskRecord[] = [
      makeProject({ StartDate: start, EndDate: end, Progress: 80 }),
      makeAsset(),
    ]
    const result = computePredictiveInsights(tasks, today.getTime(), today.getTime())
    // Project is overdue — should get -20 penalty
    expect(result.avgConfidence).toBeLessThanOrEqual(80)
  })
})
