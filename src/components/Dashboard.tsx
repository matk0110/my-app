import { useEffect, useState, useMemo } from 'react'
import type { Cr809_projects } from '../generated/models/Cr809_projectsModel'

// Mirror of TaskRecord from App.tsx (avoid circular imports)
type ActivityStatus = 'NotStarted' | 'InProgress' | 'Completed' | 'Blocked'

export type DashTaskRecord = {
  TaskID: string
  TaskName: string
  StartDate: Date
  EndDate: Date
  ParentID?: string
  ItemType: 'Project' | 'Asset' | 'Activity'
  SourceId: string
  AssetId?: string
  Sequence?: number
  DurationDays?: number
  Progress: number
  Status?: ActivityStatus
  IsVendorActivity?: boolean
  Predecessor?: string
}

type TrendSnapshot = {
  dateKey: string
  onTrackPct: number
  blockedCount: number
  vendorCount: number
  criticalDelayDays: number
}

interface ProjectMetrics {
  project: DashTaskRecord
  rawProject?: Cr809_projects
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
  healthStatus: 'Complete' | 'Ahead' | 'On Track' | 'At Risk' | 'Behind' | 'Not Started'
}

interface AtRiskActivity {
  task: DashTaskRecord
  projectName: string
  assetName: string
  progressPct: number
  expectedPct: number
  daysBehind: number
}

function DonutChart({ pct, color, size = 76 }: { pct: number; color: string; size?: number }) {
  const r = size * 0.37
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const filled = Math.min(1, pct / 100) * circ
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eeeeee" strokeWidth={size * 0.13} />
      {pct > 0 && (
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.13}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
      <text
        x={cx} y={cy + 1}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.2} fontWeight="700" fill="#201f1e"
      >
        {pct}%
      </text>
    </svg>
  )
}

function StatusBar({ completed, inProgress, blocked, notStarted, total }: {
  completed: number; inProgress: number; blocked: number; notStarted: number; total: number
}) {
  if (total === 0) return <div className="dash-status-bar"><div style={{ flex: 1, background: '#f0f0f0' }} /></div>
  const segs = [
    { n: completed, color: '#107c41', label: 'Completed' },
    { n: inProgress, color: '#0f6cbd', label: 'In Progress' },
    { n: blocked, color: '#ca5010', label: 'Blocked' },
    { n: notStarted, color: '#dde1e6', label: 'Not Started' },
  ]
  return (
    <div className="dash-status-bar">
      {segs.map((s) =>
        s.n > 0 ? (
          <div key={s.label} style={{ flex: s.n, background: s.color }} title={`${s.label}: ${s.n}`} />
        ) : null,
      )}
    </div>
  )
}

function healthColor(h: ProjectMetrics['healthStatus']): string {
  switch (h) {
    case 'Complete': return '#107c41'
    case 'Ahead': return '#0f6cbd'
    case 'On Track': return '#0f6cbd'
    case 'At Risk': return '#ca5010'
    case 'Behind': return '#c50f1f'
    case 'Not Started': return '#8a8886'
  }
}

export interface DashboardProps {
  tasks: DashTaskRecord[]
  rawProjects: Cr809_projects[]
  onActivityClick?: (task: DashTaskRecord) => void
}

export function Dashboard({ tasks, rawProjects, onActivityClick }: DashboardProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [trendSnapshots, setTrendSnapshots] = useState<TrendSnapshot[]>([])
  const [persistedTrendSnapshots, setPersistedTrendSnapshots] = useState<TrendSnapshot[]>([])

  const nowMs = Date.now()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rawProjectMap = useMemo(
    () => new Map(rawProjects.map((p) => [p.cr809_projectid?.replace(/[{}]/g, '').toLowerCase(), p])),
    [rawProjects],
  )

  const projectMetrics = useMemo<ProjectMetrics[]>(() => {
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
        if (elapsed <= 0) return false // hasn't started yet — no expectation set
        return a.Progress / 100 < elapsed
      }).length

      const start = project.StartDate.getTime()
      const end = project.EndDate.getTime()
      const elapsed = end > start ? Math.min(1, Math.max(0, (nowMs - start) / (end - start))) : 0
      const daysRemaining = Math.ceil((project.EndDate.getTime() - today.getTime()) / 86400000)
      const daysOverdue = daysRemaining < 0 && project.Progress < 100 ? -daysRemaining : 0

      const pct = project.Progress
      let healthStatus: ProjectMetrics['healthStatus']
      if (pct >= 100) healthStatus = 'Complete'
      else if (pct === 0 && elapsed < 0.05) healthStatus = 'Not Started'
      else if (pct / 100 >= elapsed + 0.03) healthStatus = 'Ahead'
      else if (pct / 100 >= elapsed - 0.05) healthStatus = 'On Track'
      else if (pct / 100 >= elapsed - 0.15) healthStatus = 'At Risk'
      else healthStatus = 'Behind'

      return {
        project,
        rawProject: rawProjectMap.get(project.SourceId.toLowerCase()),
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
  }, [tasks, rawProjectMap, nowMs, today])

  const assetTaskMap = useMemo(
    () => new Map(tasks.filter((t) => t.ItemType === 'Asset').map((t) => [t.SourceId, t])),
    [tasks],
  )
  const projectTaskMap = useMemo(
    () => new Map(tasks.filter((t) => t.ItemType === 'Project').map((t) => [t.TaskID, t.TaskName])),
    [tasks],
  )

  const atRiskActivities = useMemo<AtRiskActivity[]>(() => {
    return tasks
      .filter((t) => {
        if (t.ItemType !== 'Activity') return false
        if (t.Status === 'Completed') return false
        const s = t.StartDate.getTime()
        const e = t.EndDate.getTime()
        if (e <= s) return false
        const elapsed = Math.min(1, Math.max(0, (nowMs - s) / (e - s)))
        if (elapsed <= 0) return false // hasn't started yet
        return t.Progress / 100 < elapsed
      })
      .map((t) => {
        const asset = t.AssetId ? assetTaskMap.get(t.AssetId) : undefined
        const projectName = asset?.ParentID ? (projectTaskMap.get(asset.ParentID) ?? '—') : '—'
        const s = t.StartDate.getTime()
        const e = t.EndDate.getTime()
        const elapsed = e > s ? Math.min(1, Math.max(0, (nowMs - s) / (e - s))) : 0
        const totalDays = Math.round((e - s) / 86400000)
        const daysBehind = Math.round((elapsed - t.Progress / 100) * totalDays)
        return {
          task: t,
          projectName,
          assetName: asset?.TaskName ?? '—',
          progressPct: t.Progress,
          expectedPct: Math.round(elapsed * 100),
          daysBehind,
        }
      })
      .sort((a, b) => b.daysBehind - a.daysBehind)
  }, [tasks, assetTaskMap, projectTaskMap, nowMs])

  const globalKPIs = useMemo(() => {
    const activities = tasks.filter((t) => t.ItemType === 'Activity')
    return {
      total: activities.length,
      completed: activities.filter((a) => a.Status === 'Completed').length,
      atRisk: atRiskActivities.length,
      blocked: activities.filter((a) => a.Status === 'Blocked').length,
      inProgress: activities.filter((a) => a.Status === 'InProgress').length,
    }
  }, [tasks, atRiskActivities])

  const predictiveInsights = useMemo(() => {
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
      const projectLate = project.EndDate.getTime() < today.getTime() && project.Progress < 100 ? 1 : 0
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
  }, [tasks, nowMs, today])

  const blockerAging = useMemo(() => {
    const blocked = tasks
      .filter((t) => t.ItemType === 'Activity' && t.Status === 'Blocked')
      .map((t) => {
        const ageDays = Math.max(0, Math.floor((today.getTime() - t.StartDate.getTime()) / 86400000))
        const asset = t.AssetId ? assetTaskMap.get(t.AssetId) : undefined
        const projectName = asset?.ParentID ? (projectTaskMap.get(asset.ParentID) ?? '—') : '—'
        return {
          task: t,
          ageDays,
          projectName,
          assetName: asset?.TaskName ?? '—',
        }
      })
      .sort((a, b) => b.ageDays - a.ageDays)

    const over7 = blocked.filter((b) => b.ageDays > 7).length
    const over14 = blocked.filter((b) => b.ageDays > 14).length
    return { blocked, over7, over14 }
  }, [tasks, today, assetTaskMap, projectTaskMap])

  const vendorInsights = useMemo(() => {
    const activities = tasks.filter((t) => t.ItemType === 'Activity')
    const vendor = activities.filter((a) => a.IsVendorActivity)
    const internal = activities.filter((a) => !a.IsVendorActivity)

    const avgBehind = (rows: DashTaskRecord[]): number => {
      if (rows.length === 0) return 0
      const total = rows.reduce((sum, row) => {
        const s = row.StartDate.getTime()
        const e = row.EndDate.getTime()
        if (e <= s) return sum
        const elapsed = Math.min(1, Math.max(0, (nowMs - s) / (e - s)))
        const progress = Math.min(1, Math.max(0, row.Progress / 100))
        const variance = Math.max(0, elapsed - progress)
        const days = Math.max(1, Math.round((e - s) / 86400000))
        return sum + variance * days
      }, 0)
      return Math.round((total / rows.length) * 10) / 10
    }

    const vendorBlockedPct = vendor.length > 0
      ? Math.round((vendor.filter((a) => a.Status === 'Blocked').length / vendor.length) * 100)
      : 0
    const internalBlockedPct = internal.length > 0
      ? Math.round((internal.filter((a) => a.Status === 'Blocked').length / internal.length) * 100)
      : 0

    return {
      vendorCount: vendor.length,
      internalCount: internal.length,
      vendorBehindDays: avgBehind(vendor),
      internalBehindDays: avgBehind(internal),
      vendorBlockedPct,
      internalBlockedPct,
      vendorDelayContributionPct: activities.length > 0
        ? Math.round((vendor.length / activities.length) * 100)
        : 0,
    }
  }, [tasks, nowMs])

  const dependencyInsights = useMemo(() => {
    const activities = tasks.filter((t) => t.ItemType === 'Activity')
    const predecessorCounts = new Map<string, number>()
    for (const activity of activities) {
      if (!activity.Predecessor) continue
      const predecessorTaskId = activity.Predecessor.replace('FS', '')
      predecessorCounts.set(predecessorTaskId, (predecessorCounts.get(predecessorTaskId) ?? 0) + 1)
    }

    const singlePointFailures = activities
      .filter((a) => (predecessorCounts.get(a.TaskID) ?? 0) >= 2)
      .map((a) => ({
        task: a,
        dependents: predecessorCounts.get(a.TaskID) ?? 0,
      }))
      .sort((a, b) => b.dependents - a.dependents)

    const brittleChains = tasks
      .filter((t) => t.ItemType === 'Asset')
      .map((asset) => {
        const children = activities.filter((a) => a.AssetId === asset.SourceId)
        const chainLength = children.length
        const behindCount = children.filter((c) => {
          if (c.Status === 'Completed') return false
          const s = c.StartDate.getTime()
          const e = c.EndDate.getTime()
          if (e <= s) return false
          const elapsed = Math.min(1, Math.max(0, (nowMs - s) / (e - s)))
          return c.Progress / 100 < elapsed
        }).length
        return {
          assetName: asset.TaskName,
          chainLength,
          behindCount,
          score: chainLength + behindCount * 2,
        }
      })
      .filter((r) => r.chainLength >= 4)
      .sort((a, b) => b.score - a.score)

    return {
      singlePointFailures,
      brittleChains,
    }
  }, [tasks, nowMs])

  const qualitySignals = useMemo(() => {
    const activities = tasks.filter((t) => t.ItemType === 'Activity')
    const completed = activities.filter((a) => a.Status === 'Completed')
    const completedLate = completed.filter((a) => a.EndDate.getTime() < today.getTime()).length
    const estimateAccuracy = activities.length > 0
      ? Math.round((activities.filter((a) => {
          const s = a.StartDate.getTime()
          const e = a.EndDate.getTime()
          if (e <= s) return true
          const elapsed = Math.min(1, Math.max(0, (nowMs - s) / (e - s)))
          const progress = Math.min(1, Math.max(0, a.Progress / 100))
          return Math.abs(elapsed - progress) <= 0.15
        }).length / activities.length) * 100)
      : 100

    return {
      scheduleAdherencePct: completed.length > 0 ? Math.round(((completed.length - completedLate) / completed.length) * 100) : 100,
      estimateAccuracyPct: estimateAccuracy,
      completedCount: completed.length,
    }
  }, [tasks, nowMs, today])

  const passiveAlerts = useMemo(() => {
    const alerts: Array<{ severity: 'High' | 'Medium' | 'Low'; text: string }> = []
    const assets = tasks.filter((t) => t.ItemType === 'Asset')
    const activities = tasks.filter((t) => t.ItemType === 'Activity')

    const assetsWithoutActive = assets.filter((asset) => {
      const children = activities.filter((a) => a.AssetId === asset.SourceId)
      return children.length > 0 && children.every((c) => c.Status === 'NotStarted' || c.Status === 'Completed')
    })
    if (assetsWithoutActive.length > 0) {
      alerts.push({ severity: 'Medium', text: `${assetsWithoutActive.length} asset(s) have no active in-progress activities.` })
    }

    if (blockerAging.over14 > 0) {
      alerts.push({ severity: 'High', text: `${blockerAging.over14} blocked activity(ies) are older than 14 days.` })
    }
    if (vendorInsights.vendorBlockedPct > vendorInsights.internalBlockedPct + 10) {
      alerts.push({ severity: 'High', text: 'Vendor activities are blocked at a materially higher rate than internal activities.' })
    }
    if (predictiveInsights.predictedMaxSlip >= 10) {
      alerts.push({ severity: 'Medium', text: `Predicted slip exceeds 10 days on at least one project.` })
    }
    if (qualitySignals.estimateAccuracyPct < 65) {
      alerts.push({ severity: 'Low', text: 'Estimate accuracy dipped below 65%; duration calibration may be needed.' })
    }

    return alerts
  }, [tasks, blockerAging, vendorInsights, predictiveInsights, qualitySignals])

  useEffect(() => {
    let active = true

    async function loadPersistedHistory() {
      try {
        const res = await fetch('/insights/trend-history.json', { cache: 'no-store' })
        if (!res.ok) {
          if (active) setPersistedTrendSnapshots([])
          return
        }

        const payload = (await res.json()) as unknown
        if (!Array.isArray(payload)) {
          if (active) setPersistedTrendSnapshots([])
          return
        }

        const parsed = payload
          .map((row) => row as Partial<TrendSnapshot>)
          .filter((row) =>
            typeof row.dateKey === 'string'
            && typeof row.onTrackPct === 'number'
            && typeof row.blockedCount === 'number'
            && typeof row.vendorCount === 'number'
            && typeof row.criticalDelayDays === 'number',
          )
          .map((row) => ({
            dateKey: row.dateKey as string,
            onTrackPct: row.onTrackPct as number,
            blockedCount: row.blockedCount as number,
            vendorCount: row.vendorCount as number,
            criticalDelayDays: row.criticalDelayDays as number,
          }))

        if (active) setPersistedTrendSnapshots(parsed)
      } catch {
        if (active) setPersistedTrendSnapshots([])
      }
    }

    const refreshMs = 60_000
    void loadPersistedHistory()

    const intervalId = globalThis.setInterval(() => {
      void loadPersistedHistory()
    }, refreshMs)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadPersistedHistory()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      globalThis.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    const activities = tasks.filter((t) => t.ItemType === 'Activity')
    const onTrackPct = activities.length > 0
      ? Math.round(((activities.length - atRiskActivities.length) / activities.length) * 100)
      : 100
    const snapshot: TrendSnapshot = {
      dateKey: today.toISOString().slice(0, 10),
      onTrackPct,
      blockedCount: activities.filter((a) => a.Status === 'Blocked').length,
      vendorCount: activities.filter((a) => a.IsVendorActivity).length,
      criticalDelayDays: predictiveInsights.predictedMaxSlip,
    }

    const storageKey = 'insights-trends-v1'
    const maxPoints = 24

    try {
      const raw = globalThis.localStorage.getItem(storageKey)
      const parsedLocal = raw ? (JSON.parse(raw) as TrendSnapshot[]) : []
      const dedupedMap = new Map<string, TrendSnapshot>()

      for (const item of [...persistedTrendSnapshots, ...parsedLocal, snapshot]) {
        if (!item?.dateKey) continue
        dedupedMap.set(item.dateKey, item)
      }

      const next = [...dedupedMap.values()]
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .slice(-maxPoints)

      globalThis.localStorage.setItem(storageKey, JSON.stringify(next))
      setTrendSnapshots(next)
    } catch {
      const fallback = [...persistedTrendSnapshots, snapshot]
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .slice(-maxPoints)
      setTrendSnapshots(fallback)
    }
  }, [tasks, atRiskActivities.length, today, predictiveInsights.predictedMaxSlip, persistedTrendSnapshots])

  const trendMeta = useMemo(() => {
    const totalPoints = trendSnapshots.length
    const persistedPoints = persistedTrendSnapshots.length
    const localPoints = Math.max(0, totalPoints - persistedPoints)

    const firstDate = totalPoints > 0 ? trendSnapshots[0].dateKey : undefined
    const lastDate = totalPoints > 0 ? trendSnapshots[totalPoints - 1].dateKey : undefined

    let freshnessLabel = 'No data'
    if (lastDate) {
      const last = new Date(`${lastDate}T00:00:00.000Z`)
      const daysStale = Math.max(0, Math.floor((today.getTime() - last.getTime()) / 86400000))
      freshnessLabel = daysStale === 0 ? 'Fresh today' : `${daysStale} day(s) old`
    }

    const sourceLabel = persistedPoints > 0
      ? `Persisted ${persistedPoints}`
      : 'Local only'
    const overlayLabel = localPoints > 0
      ? `Local overlay ${localPoints}`
      : 'No local overlay'

    return {
      totalPoints,
      sourceLabel,
      overlayLabel,
      freshnessLabel,
      windowLabel: firstDate && lastDate ? `${firstDate} -> ${lastDate}` : 'n/a',
    }
  }, [trendSnapshots, persistedTrendSnapshots, today])

  const filteredRisk = selectedProjectId
    ? atRiskActivities.filter((a) => {
        const asset = a.task.AssetId ? assetTaskMap.get(a.task.AssetId) : undefined
        return asset?.ParentID === `project:${selectedProjectId}`
      })
    : atRiskActivities

  return (
    <div className="dashboard">
      {/* KPI Strip */}
      <div className="dash-kpi-strip">
        {[
          { label: 'Total Activities', value: globalKPIs.total, color: '#0f6cbd', bg: '#eff6ff', icon: '◉' },
          { label: 'Completed', value: globalKPIs.completed, color: '#107c41', bg: '#f0fdf4', icon: '✓' },
          { label: 'At Risk', value: globalKPIs.atRisk, color: '#c50f1f', bg: '#fff1f0', icon: '⚠' },
          { label: 'Blocked', value: globalKPIs.blocked, color: '#ca5010', bg: '#fff7ed', icon: '⊘' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="dash-kpi-card"
            style={{ borderTop: `3px solid ${kpi.color}`, background: kpi.bg }}
          >
            <span className="dash-kpi-icon" style={{ color: kpi.color }}>{kpi.icon}</span>
            <p className="dash-kpi-value" style={{ color: kpi.color }}>{kpi.value}</p>
            <p className="dash-kpi-label">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Project Health Cards */}
      <section className="dash-section">
        <h2 className="dash-section-title">
          Project Health
          <span className="dash-section-hint">Click a card to filter at-risk activities</span>
        </h2>
        <div className="dash-project-grid">
          {projectMetrics.map((m) => {
            const hc = healthColor(m.healthStatus)
            const isSelected = selectedProjectId === m.project.SourceId
            return (
              <div
                key={m.project.TaskID}
                className={`dash-project-card${isSelected ? ' selected' : ''}`}
                onClick={() =>
                  setSelectedProjectId((prev) => (prev === m.project.SourceId ? null : m.project.SourceId))
                }
                style={{ '--hc': hc } as React.CSSProperties}
              >
                {/* Card header */}
                <div className="dash-card-head">
                  <div className="dash-health-badge" style={{ background: hc + '18', color: hc, borderColor: hc + '40' }}>
                    {m.healthStatus}
                  </div>
                  {m.rawProject?.cr809_risklevel && (
                    <span className="dash-risk-tag">Risk: {m.rawProject.cr809_risklevel}</span>
                  )}
                </div>

                <h3 className="dash-project-name">{m.project.TaskName}</h3>

                {/* Donut + stats */}
                <div className="dash-card-body">
                  <DonutChart pct={m.project.Progress} color={hc} size={80} />
                  <div className="dash-card-stats">
                    <div className="dash-stat-item">
                      <span className="dash-si-val">{m.totalActivities}</span>
                      <span className="dash-si-lbl">Activities</span>
                    </div>
                    <div className="dash-stat-item">
                      <span className="dash-si-val" style={{ color: '#107c41' }}>{m.completed}</span>
                      <span className="dash-si-lbl">Done</span>
                    </div>
                    <div className="dash-stat-item">
                      <span className="dash-si-val" style={{ color: m.atRiskCount > 0 ? '#c50f1f' : '#201f1e' }}>
                        {m.atRiskCount}
                      </span>
                      <span className="dash-si-lbl">At Risk</span>
                    </div>
                    <div className="dash-stat-item">
                      <span
                        className="dash-si-val"
                        style={{
                          color:
                            m.daysOverdue > 0 ? '#c50f1f' : m.daysRemaining <= 14 ? '#ca5010' : '#201f1e',
                        }}
                      >
                        {m.daysOverdue > 0 ? `+${m.daysOverdue}d` : `${Math.max(0, m.daysRemaining)}d`}
                      </span>
                      <span className="dash-si-lbl">{m.daysOverdue > 0 ? 'Overdue' : 'Left'}</span>
                    </div>
                  </div>
                </div>

                {/* Status stacked bar */}
                <div className="dash-card-footer">
                  <StatusBar
                    completed={m.completed}
                    inProgress={m.inProgress}
                    blocked={m.blocked}
                    notStarted={m.notStarted}
                    total={m.totalActivities}
                  />
                  {/* Timeline position bar */}
                  <div className="dash-timeline-track">
                    <div className="dash-timeline-elapsed" style={{ width: `${Math.round(m.elapsedRatio * 100)}%` }} />
                    <div
                      className="dash-timeline-needle"
                      style={{ left: `${Math.round(m.elapsedRatio * 100)}%` }}
                      title={`Time elapsed: ${Math.round(m.elapsedRatio * 100)}%`}
                    />
                  </div>
                  <div className="dash-timeline-dates">
                    <span>
                      {m.project.StartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ color: '#0f6cbd', fontSize: '0.68rem', fontWeight: 600 }}>
                      Today {Math.round(m.elapsedRatio * 100)}%
                    </span>
                    <span>
                      {m.project.EndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* At-Risk Table */}
      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">
            At-Risk Activities
            {filteredRisk.length > 0 && (
              <span className="dash-count-badge">{filteredRisk.length}</span>
            )}
          </h2>
          {selectedProjectId && (
            <button className="dash-clear-btn" onClick={() => setSelectedProjectId(null)}>
              Clear filter ×
            </button>
          )}
        </div>

        {filteredRisk.length === 0 ? (
          <div className="dash-empty-state">
            <span className="dash-empty-icon">✓</span>
            <p>No at-risk activities{selectedProjectId ? ' for this project' : ''}.</p>
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Asset</th>
                  <th>Project</th>
                  <th>Progress</th>
                  <th>Expected</th>
                  <th>Days Behind</th>
                </tr>
              </thead>
              <tbody>
                {filteredRisk.slice(0, 12).map((row) => (
                  <tr
                    key={row.task.TaskID}
                    className="dash-tr-clickable"
                    onClick={() => onActivityClick?.(row.task)}
                  >
                    <td className="dash-td-primary">{row.task.TaskName}</td>
                    <td>{row.assetName}</td>
                    <td>{row.projectName}</td>
                    <td>
                      <div className="dash-mini-progress">
                        <div className="dash-mini-bar" style={{ width: `${row.progressPct}%`, background: '#0f6cbd' }} />
                        <span>{row.progressPct}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="dash-mini-progress">
                        <div className="dash-mini-bar" style={{ width: `${row.expectedPct}%`, background: '#d1d5db' }} />
                        <span>{row.expectedPct}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="dash-behind-chip">−{row.daysBehind}d</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Status Distribution */}
      <section className="dash-section">
        <h2 className="dash-section-title">Activity Distribution by Project</h2>
        <div className="dash-dist-grid">
          {projectMetrics.map((m) => (
            <div key={m.project.TaskID} className="dash-dist-row">
              <span className="dash-dist-label" title={m.project.TaskName}>
                {m.project.TaskName}
              </span>
              <div className="dash-dist-bars">
                <StatusBar
                  completed={m.completed}
                  inProgress={m.inProgress}
                  blocked={m.blocked}
                  notStarted={m.notStarted}
                  total={m.totalActivities}
                />
                <div className="dash-dist-counts">
                  {m.completed > 0 && <span style={{ color: '#107c41' }}>{m.completed} done</span>}
                  {m.inProgress > 0 && <span style={{ color: '#0f6cbd' }}>{m.inProgress} active</span>}
                  {m.blocked > 0 && <span style={{ color: '#ca5010' }}>{m.blocked} blocked</span>}
                  {m.notStarted > 0 && <span style={{ color: '#8a8886' }}>{m.notStarted} pending</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="dash-legend">
          {[
            ['#107c41', 'Completed'],
            ['#0f6cbd', 'In Progress'],
            ['#ca5010', 'Blocked'],
            ['#dde1e6', 'Not Started'],
          ].map(([c, l]) => (
            <span key={l} className="dash-legend-item">
              <span className="dash-legend-dot" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">Predictive Outlook</h2>
        <div className="dash-kpi-strip dash-plus-strip">
          {[
            { label: 'Avg Confidence', value: `${predictiveInsights.avgConfidence}%`, color: '#0f6cbd', bg: '#eff6ff' },
            { label: 'Days At Risk', value: predictiveInsights.totalRiskDays, color: '#c2410c', bg: '#fff7ed' },
            { label: 'Max Predicted Slip', value: `${predictiveInsights.predictedMaxSlip}d`, color: '#b91c1c', bg: '#fef2f2' },
            { label: 'Vendor Delay Share', value: `${vendorInsights.vendorDelayContributionPct}%`, color: '#be185d', bg: '#fdf2f8' },
          ].map((kpi) => (
            <div key={kpi.label} className="dash-kpi-card" style={{ borderTop: `3px solid ${kpi.color}`, background: kpi.bg }}>
              <p className="dash-kpi-value" style={{ color: kpi.color }}>{kpi.value}</p>
              <p className="dash-kpi-label">{kpi.label}</p>
            </div>
          ))}
        </div>
        <div className="dash-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Confidence</th>
                <th>Predicted Slip</th>
                <th>Days At Risk</th>
              </tr>
            </thead>
            <tbody>
              {predictiveInsights.perProject.map((p) => (
                <tr key={p.project.TaskID}>
                  <td className="dash-td-primary">{p.project.TaskName}</td>
                  <td>{p.confidence}%</td>
                  <td><span className="dash-behind-chip">{p.projectedSlipDays}d</span></td>
                  <td>{p.riskDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">Trend Snapshots</h2>
        <div className="dash-trend-meta">
          <span className="dash-trend-pill">{trendMeta.sourceLabel}</span>
          <span className="dash-trend-pill">{trendMeta.overlayLabel}</span>
          <span className="dash-trend-pill">Points {trendMeta.totalPoints}</span>
          <span className="dash-trend-pill">Window {trendMeta.windowLabel}</span>
          <span className="dash-trend-pill">Freshness {trendMeta.freshnessLabel}</span>
        </div>
        <div className="dash-trend-grid">
          {([
            ['On-Track %', 'onTrackPct', '#0f6cbd'],
            ['Blocked Count', 'blockedCount', '#ca5010'],
            ['Vendor Activities', 'vendorCount', '#be185d'],
            ['Critical Delay (d)', 'criticalDelayDays', '#b91c1c'],
          ] as Array<[string, keyof TrendSnapshot, string]>).map(([label, key, color]) => {
            const values = trendSnapshots.map((s) => Number(s[key] ?? 0))
            const maxVal = Math.max(1, ...values)
            return (
              <div key={label} className="dash-trend-card">
                <div className="dash-trend-head">
                  <span>{label}</span>
                  <strong style={{ color }}>{values[values.length - 1] ?? 0}</strong>
                </div>
                <div className="dash-sparkline">
                  {values.map((v, i) => (
                    <span
                      key={`${label}-${i}`}
                      className="dash-spark-bar"
                      style={{ height: `${Math.max(10, (v / maxVal) * 100)}%`, background: color }}
                      title={`${trendSnapshots[i]?.dateKey}: ${v}`}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">Blocker And Vendor Intelligence</h2>
        <div className="dash-plus-grid-2">
          <div>
            <h3 className="dash-plus-subtitle">Longest Blockers</h3>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Project</th>
                    <th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {blockerAging.blocked.slice(0, 8).map((b) => (
                    <tr key={b.task.TaskID} className="dash-tr-clickable" onClick={() => onActivityClick?.(b.task)}>
                      <td className="dash-td-primary">{b.task.TaskName}</td>
                      <td>{b.projectName}</td>
                      <td><span className="dash-behind-chip">{b.ageDays}d</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="dash-plus-subtitle">Vendor Performance</h3>
            <div className="dash-plus-metrics">
              <div><span>Vendor Activities</span><strong>{vendorInsights.vendorCount}</strong></div>
              <div><span>Vendor Avg Behind</span><strong>{vendorInsights.vendorBehindDays}d</strong></div>
              <div><span>Internal Avg Behind</span><strong>{vendorInsights.internalBehindDays}d</strong></div>
              <div><span>Vendor Blocked Rate</span><strong>{vendorInsights.vendorBlockedPct}%</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">Dependency Health And Quality</h2>
        <div className="dash-plus-grid-2">
          <div>
            <h3 className="dash-plus-subtitle">Single-Point Failure Activities</h3>
            <ul className="dash-plus-list">
              {dependencyInsights.singlePointFailures.slice(0, 6).map((s) => (
                <li key={s.task.TaskID}>
                  <button type="button" className="dash-plus-link" onClick={() => onActivityClick?.(s.task)}>
                    {s.task.TaskName}
                  </button>
                  <span>{s.dependents} dependents</span>
                </li>
              ))}
              {dependencyInsights.singlePointFailures.length === 0 && <li>No concentrated dependency points detected.</li>}
            </ul>
            <h3 className="dash-plus-subtitle" style={{ marginTop: '0.9rem' }}>Brittle Chains</h3>
            <ul className="dash-plus-list">
              {dependencyInsights.brittleChains.slice(0, 6).map((chain) => (
                <li key={chain.assetName}>
                  <span>{chain.assetName}</span>
                  <span>{chain.chainLength} tasks, {chain.behindCount} behind</span>
                </li>
              ))}
              {dependencyInsights.brittleChains.length === 0 && <li>No brittle chains currently flagged.</li>}
            </ul>
          </div>
          <div>
            <h3 className="dash-plus-subtitle">Quality Signals</h3>
            <div className="dash-plus-metrics">
              <div><span>Schedule Adherence</span><strong>{qualitySignals.scheduleAdherencePct}%</strong></div>
              <div><span>Estimate Accuracy</span><strong>{qualitySignals.estimateAccuracyPct}%</strong></div>
              <div><span>Completed Activities</span><strong>{qualitySignals.completedCount}</strong></div>
              <div><span>Blocked &gt; 7 Days</span><strong>{blockerAging.over7}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">Executive Brief And Alerts</h2>
        <div className="dash-plus-grid-2">
          <div className="dash-brief">
            <p>
              Confidence is {predictiveInsights.avgConfidence}%, with up to {predictiveInsights.predictedMaxSlip} days of projected slip.
              Vendor delay contribution is {vendorInsights.vendorDelayContributionPct}% and there are {blockerAging.over7} blockers older than 7 days.
            </p>
            <p>
              Estimate accuracy is {qualitySignals.estimateAccuracyPct}%, and schedule adherence for completed work is {qualitySignals.scheduleAdherencePct}%.
            </p>
          </div>
          <ul className="dash-alert-list">
            {passiveAlerts.map((alert, idx) => (
              <li key={`${alert.text}-${idx}`} className={`dash-alert-${alert.severity.toLowerCase()}`}>
                <strong>{alert.severity}:</strong> {alert.text}
              </li>
            ))}
            {passiveAlerts.length === 0 && <li className="dash-alert-low">Low: No alert thresholds are currently tripped.</li>}
          </ul>
        </div>
      </section>
    </div>
  )
}
