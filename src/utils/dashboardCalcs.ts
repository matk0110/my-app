import type { TaskRecord } from './buildTaskData'

export type ActivityStatus = 'NotStarted' | 'InProgress' | 'Completed' | 'Blocked'

export type DashTaskRecord = TaskRecord

export type HealthStatus = 'Complete' | 'Ahead' | 'On Track' | 'At Risk' | 'Behind' | 'Not Started'

export interface ProjectMetrics {
  project: DashTaskRecord
  assetCount: number
  totalActivities: number
  completed: number
  inProgress: number
  notStarted: number
  blocked: number
  atRiskCount: number
  daysRemaining: number
  daysOverdue: number
  elapsedRatio: number
  healthStatus: HealthStatus
}

export interface GlobalKPIs {
  total: number
  completed: number
  atRisk: number
  blocked: number
  inProgress: number
}

export interface PredictiveProjectInsight {
  project: DashTaskRecord
  confidence: number
  projectedSlipDays: number
  riskDays: number
}

export interface PredictiveInsights {
  perProject: PredictiveProjectInsight[]
  totalRiskDays: number
  avgConfidence: number
  predictedMaxSlip: number
}

export function computeProjectMetrics(
  tasks: DashTaskRecord[],
  nowMs: number,
  todayMs: number,
): ProjectMetrics[] {
  const projects = tasks.filter((t) => t.ItemType === 'Project')
  return projects.map((project) => {
    const assets = tasks.filter((t) => t.ItemType === 'Asset' && t.ParentID === project.TaskID)
    const assetSourceIds = new Set(assets.map((a) => a.SourceId))
    const activities = tasks.filter((t) => t.ItemType === 'Activity' && t.AssetId && assetSourceIds.has(t.AssetId))

    const completed = activities.filter((a) => a.Status === 'Completed').length
    const inProgress = activities.filter((a) => a.Status === 'InProgress').length
    const notStarted = activities.filter((a) => a.Status === 'NotStarted').length
    const blocked = activities.filter((a) => a.Status === 'Blocked').length

    const atRiskCount = activities.filter((a) => {
      if (a.Status === 'Completed') return false
      const s = a.StartDate.getTime()
      const e = a.EndDate.getTime()
      if (e <= s) return false
      const elapsed = Math.min(1, Math.max(0, (nowMs - s) / (e - s)))
      if (elapsed <= 0) return false
      return a.Progress / 100 < elapsed
    }).length

    const start = project.StartDate.getTime()
    const end = project.EndDate.getTime()
    const elapsed = end > start ? Math.min(1, Math.max(0, (nowMs - start) / (end - start))) : 0
    const daysRemaining = Math.ceil((project.EndDate.getTime() - todayMs) / 86400000)
    const daysOverdue = daysRemaining < 0 && project.Progress < 100 ? -daysRemaining : 0

    const pct = project.Progress
    let healthStatus: HealthStatus
    if (pct >= 100) healthStatus = 'Complete'
    else if (pct === 0 && elapsed < 0.05) healthStatus = 'Not Started'
    else if (pct / 100 >= elapsed + 0.03) healthStatus = 'Ahead'
    else if (pct / 100 >= elapsed - 0.05) healthStatus = 'On Track'
    else if (pct / 100 >= elapsed - 0.15) healthStatus = 'At Risk'
    else healthStatus = 'Behind'

    return {
      project,
      assetCount: assets.length,
      totalActivities: activities.length,
      completed,
      inProgress,
      notStarted,
      blocked,
      atRiskCount,
      daysRemaining,
      daysOverdue,
      elapsedRatio: elapsed,
      healthStatus,
    }
  })
}

export function computeGlobalKPIs(
  tasks: DashTaskRecord[],
  atRiskCount: number,
): GlobalKPIs {
  const activities = tasks.filter((t) => t.ItemType === 'Activity')
  return {
    total: activities.length,
    completed: activities.filter((a) => a.Status === 'Completed').length,
    atRisk: atRiskCount,
    blocked: activities.filter((a) => a.Status === 'Blocked').length,
    inProgress: activities.filter((a) => a.Status === 'InProgress').length,
  }
}

export function computePredictiveInsights(
  tasks: DashTaskRecord[],
  nowMs: number,
  todayMs: number,
): PredictiveInsights {
  const projects = tasks.filter((t) => t.ItemType === 'Project')
  const activities = tasks.filter((t) => t.ItemType === 'Activity')

  const perProject = projects.map((project) => {
    const assets = tasks.filter((t) => t.ItemType === 'Asset' && t.ParentID === project.TaskID)
    const assetSourceIds = new Set(assets.map((a) => a.SourceId))
    const projectActivities = activities.filter((a) => a.AssetId && assetSourceIds.has(a.AssetId))

    const atRisk = projectActivities.filter((a) => {
      if (a.Status === 'Completed') return false
      const s = a.StartDate.getTime()
      const e = a.EndDate.getTime()
      if (e <= s) return false
      const elapsed = Math.min(1, Math.max(0, (nowMs - s) / (e - s)))
      if (elapsed <= 0) return false
      return a.Progress / 100 < elapsed
    })

    const riskDays = atRisk.reduce((sum, a) => {
      const durationMs = Math.max(86400000, a.EndDate.getTime() - a.StartDate.getTime())
      const elapsedRatio = Math.min(1, Math.max(0, (nowMs - a.StartDate.getTime()) / durationMs))
      const progressRatio = Math.min(1, Math.max(0, a.Progress / 100))
      const variance = Math.max(0, elapsedRatio - progressRatio)
      const durationDays = Math.max(1, Math.round(durationMs / 86400000))
      return sum + variance * durationDays
    }, 0)

    const total = projectActivities.length
    const blocked = projectActivities.filter((a) => a.Status === 'Blocked').length
    const atRiskRatio = total > 0 ? atRisk.length / total : 0
    const blockedRatio = total > 0 ? blocked / total : 0
    const projectLate = project.EndDate.getTime() < todayMs && project.Progress < 100 ? 1 : 0
    const confidence = Math.max(5, Math.round(100 - atRiskRatio * 45 - blockedRatio * 35 - projectLate * 20))
    const projectedSlipDays = Math.max(0, Math.round(riskDays * 0.7 + blocked * 0.75))

    return {
      project,
      confidence,
      projectedSlipDays,
      riskDays: Math.round(riskDays),
    }
  })

  const totalRiskDays = perProject.reduce((sum, p) => sum + p.riskDays, 0)
  const avgConfidence = perProject.length > 0
    ? Math.round(perProject.reduce((sum, p) => sum + p.confidence, 0) / perProject.length)
    : 100
  const predictedMaxSlip = perProject.length > 0
    ? Math.max(...perProject.map((p) => p.projectedSlipDays))
    : 0

  return {
    perProject: perProject.sort((a, b) => b.projectedSlipDays - a.projectedSlipDays),
    totalRiskDays,
    avgConfidence,
    predictedMaxSlip,
  }
}
