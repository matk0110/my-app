import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ColumnDirective,
  ColumnsDirective,
  DayMarkers,
  Edit,
  Filter,
  GanttComponent,
  Inject,
  Reorder,
  Resize,
  Selection,
  Sort,
  Toolbar,
} from '@syncfusion/ej2-react-gantt'
import type { EditSettingsModel, TaskFieldsModel, TimelineSettingsModel } from '@syncfusion/ej2-react-gantt'
import { Cr809_projectsService } from './generated/services/Cr809_projectsService'
import { Cr809_assetsService } from './generated/services/Cr809_assetsService'
import { Cr809_activitiesService } from './generated/services/Cr809_activitiesService'
import type { Cr809_projects } from './generated/models/Cr809_projectsModel'
import type { Cr809_assets } from './generated/models/Cr809_assetsModel'
import type { Cr809_activities } from './generated/models/Cr809_activitiesModel'
import { Cr809_activitiescr809_status } from './generated/models/Cr809_activitiesModel'
import { Dashboard } from './components/Dashboard'
import type { DashTaskRecord } from './components/Dashboard'
import { DetailPanel } from './components/DetailPanel'
import logoUrl from './assets/logo.png'
import './App.css'

type TimelineMode = 'day' | 'week' | 'month'
type AppTab = 'gantt' | 'insights'

type ActivityStatus = 'NotStarted' | 'InProgress' | 'Completed' | 'Blocked'

type TaskRecord = {
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

function normalizeGuid(value?: string): string | undefined {
  if (!value) return undefined
  return value.replace(/[{}]/g, '').trim().toLowerCase()
}

function parseDate(value?: string): Date {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function toDataverseDate(date: Date): string {
  return date.toISOString()
}

function getDurationDays(activity: Cr809_activities): number {
  const raw = Number(activity.cr809_duration)
  if (Number.isNaN(raw) || raw <= 0) return 1
  return Math.max(1, Math.round(raw))
}

function buildTaskData(
  projects: Cr809_projects[],
  assets: Cr809_assets[],
  activities: Cr809_activities[],
): TaskRecord[] {
  const projectIdSet = new Set<string>()

  const projectTasks: TaskRecord[] = projects.map((project) => {
    const projectId = normalizeGuid(project.cr809_projectid) ?? project.cr809_projectid
    projectIdSet.add(projectId)
    const start = parseDate(project.cr809_startdate)
    const end = parseDate(project.cr809_enddate)
    return {
      TaskID: `project:${projectId}`,
      SourceId: projectId,
      ItemType: 'Project',
      TaskName: project.cr809_projectname,
      StartDate: start,
      EndDate: end,
      Progress: Math.min(100, Math.max(0, Number(project.cr809_progress ?? 0))),
    }
  })

  const linkedAssetSourceIds = new Set<string>()

  const assetTasks: TaskRecord[] = assets.map((asset) => {
    const assetId = normalizeGuid(asset.cr809_assetid) ?? asset.cr809_assetid
    const parentProjectId = normalizeGuid(asset._cr809_project_value)
    const start = parseDate(asset.cr809_startdate)
    const end = parseDate(asset.cr809_enddate)
    const parentId = parentProjectId && projectIdSet.has(parentProjectId) ? `project:${parentProjectId}` : undefined

    if (parentId) linkedAssetSourceIds.add(assetId)

    return {
      TaskID: `asset:${assetId}`,
      SourceId: assetId,
      ItemType: 'Asset',
      ParentID: parentId,
      TaskName: asset.cr809_assetname,
      StartDate: start,
      EndDate: end,
      Progress: Math.min(100, Math.max(0, Number(asset.cr809_progress ?? 0))),
    }
  })

  const byAsset = new Map<string, Cr809_activities[]>()
  for (const activity of activities) {
    const assetId = normalizeGuid(activity._cr809_asset_value ?? activity.cr809_assetid)
    if (!assetId) continue
    const list = byAsset.get(assetId) ?? []
    list.push(activity)
    byAsset.set(assetId, list)
  }

  const activityTasks: TaskRecord[] = []
  for (const [assetId, list] of byAsset.entries()) {
    const sorted = [...list].sort((a, b) => {
      const aSeq = Number(a.cr809_sequence ?? Number.MAX_SAFE_INTEGER)
      const bSeq = Number(b.cr809_sequence ?? Number.MAX_SAFE_INTEGER)
      return aSeq - bSeq
    })

    let previousTaskId: string | undefined
    for (const activity of sorted) {
      const durationDays = getDurationDays(activity)
      const start = parseDate(activity.cr809_startdate)
      const end = activity.cr809_enddate ? parseDate(activity.cr809_enddate) : addDays(start, durationDays - 1)
      const activityId = normalizeGuid(activity.cr809_activityid) ?? activity.cr809_activityid
      const parentAssetExists = linkedAssetSourceIds.has(assetId)
      const taskId = `activity:${activityId}`

      activityTasks.push({
        TaskID: taskId,
        SourceId: activityId,
        AssetId: assetId,
        ItemType: 'Activity',
        ParentID: parentAssetExists ? `asset:${assetId}` : undefined,
        TaskName: activity.cr809_activityname,
        StartDate: start,
        EndDate: end,
        Sequence: Number(activity.cr809_sequence ?? 0),
        DurationDays: durationDays,
        Progress: Math.min(100, Math.max(0, Number(activity.cr809_progress ?? 0))),
        Status: activity.cr809_status !== undefined
          ? Cr809_activitiescr809_status[activity.cr809_status as keyof typeof Cr809_activitiescr809_status] as ActivityStatus
          : undefined,
        IsVendorActivity: Number(activity.cr809_isvendoractivity ?? 0) === 1,
        Predecessor: previousTaskId ? `${previousTaskId}FS` : undefined,
      })

      previousTaskId = taskId
    }
  }

  const linkedAssets = assetTasks.filter((asset) => Boolean(asset.ParentID))
  const linkedActivities = activityTasks.filter((activity) => Boolean(activity.ParentID))

  const allRows = [...projectTasks, ...linkedAssets, ...linkedActivities]

  return allRows
    .filter((row) => !!row.TaskName)
    .map((row) => {
      const start = parseDate(row.StartDate.toISOString())
      const end = parseDate(row.EndDate.toISOString())
      if (end < start) {
        return { ...row, StartDate: start, EndDate: start }
      }
      return { ...row, StartDate: start, EndDate: end }
    })
}

// ===== Gantt grid column templates =====

function gcTypeIndicatorTemplate(args: Record<string, unknown>) {
  const taskData = args['taskData'] as Partial<TaskRecord> | undefined
  const type = String(args['ItemType'] ?? taskData?.ItemType ?? 'Activity') as 'Project' | 'Asset' | 'Activity'
  const dotColor: Record<string, string> = { Project: '#7c3aed', Asset: '#0f6cbd', Activity: '#64748b' }
  return (
    <span className="gc-type-cell">
      <span className="gc-type-dot" style={{ background: dotColor[type] ?? '#64748b' }} />
    </span>
  )
}

function gcStatusTemplate(args: Record<string, unknown>) {
  const taskData = (args['taskData'] as Partial<TaskRecord> | undefined) ?? (args as unknown as Partial<TaskRecord>)
  if (taskData.ItemType !== 'Activity' || !taskData.Status) {
    return <span className="gc-status-none">—</span>
  }
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    NotStarted: { label: 'Not Started', bg: '#f1f5f9', color: '#475569' },
    InProgress:  { label: 'In Progress', bg: '#dbeafe', color: '#1e40af' },
    Completed:   { label: 'Completed',   bg: '#dcfce7', color: '#15803d' },
    Blocked:     { label: 'Blocked',     bg: '#fef9c3', color: '#a16207' },
  }
  const s = cfg[String(taskData.Status)] ?? cfg.NotStarted
  return (
    <span className="gc-status-chip" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function gcStartDateTemplate(args: Record<string, unknown>) {
  const ganttProps = args['ganttProperties'] as { startDate?: Date } | undefined
  const taskData = args['taskData'] as Partial<TaskRecord> | undefined
  const raw = ganttProps?.startDate ?? taskData?.StartDate
  const d = raw instanceof Date ? raw : new Date(String(raw ?? ''))
  if (Number.isNaN(d.getTime())) return <span className="gc-date">—</span>
  return <span className="gc-date">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
}

function gcEndDateTemplate(args: Record<string, unknown>) {
  const ganttProps = args['ganttProperties'] as { endDate?: Date } | undefined
  const taskData = args['taskData'] as Partial<TaskRecord> | undefined
  const raw = ganttProps?.endDate ?? taskData?.EndDate
  const d = raw instanceof Date ? raw : new Date(String(raw ?? ''))
  if (Number.isNaN(d.getTime())) return <span className="gc-date">—</span>
  return <span className="gc-date">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
}

function gcProgressTemplate(args: Record<string, unknown>) {
  const ganttProps = args['ganttProperties'] as { progress?: number } | undefined
  const taskData = args['taskData'] as Partial<TaskRecord> | undefined
  const pct = Math.min(100, Math.max(0, ganttProps?.progress ?? Number(taskData?.Progress ?? 0)))
  const fill = pct >= 100 ? '#16a34a' : pct > 0 ? '#2563eb' : '#e5e7eb'
  return (
    <div className="gc-progress">
      <div className="gc-progress-track">
        <div className="gc-progress-fill" style={{ width: `${pct}%`, background: fill }} />
      </div>
      <span className="gc-progress-label">{pct}%</span>
    </div>
  )
}

function App() {
  const ganttRef = useRef<GanttComponent | null>(null)
  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const topScrollInnerRef = useRef<HTMLDivElement | null>(null)

  const [timelineMode, setTimelineMode] = useState<TimelineMode>('week')
  const [activeTab, setActiveTab] = useState<AppTab>('gantt')
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [rawProjects, setRawProjects] = useState<Cr809_projects[]>([])
  const [rawAssets, setRawAssets] = useState<Cr809_assets[]>([])
  const [rawActivities, setRawActivities] = useState<Cr809_activities[]>([])
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string>('')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // Maps for DetailPanel lookups
  const rawProjectMap = useMemo(
    () => new Map(rawProjects.map((p) => [normalizeGuid(p.cr809_projectid) ?? '', p])),
    [rawProjects],
  )
  const rawAssetMap = useMemo(
    () => new Map(rawAssets.map((a) => [normalizeGuid(a.cr809_assetid) ?? '', a])),
    [rawAssets],
  )
  const rawActivityMap = useMemo(
    () => new Map(rawActivities.map((a) => [normalizeGuid(a.cr809_activityid) ?? '', a])),
    [rawActivities],
  )

  const taskFields = useMemo<TaskFieldsModel>(
    () => ({
      id: 'TaskID',
      name: 'TaskName',
      startDate: 'StartDate',
      endDate: 'EndDate',
      progress: 'Progress',
      parentID: 'ParentID',
      dependency: 'Predecessor',
    }),
    [],
  )

  const editSettings = useMemo<EditSettingsModel>(
    () => ({
      allowAdding: true,
      allowEditing: true,
      allowDeleting: true,
      allowTaskbarEditing: true,
      mode: 'Dialog',
    }),
    [],
  )

  const toolbar = useMemo(
    () => ['Add', 'Edit', 'Delete', 'Update', 'Cancel', 'ExpandAll', 'CollapseAll', 'Search'],
    [],
  )

  const timelineSettings = useMemo<TimelineSettingsModel>(() => {
    if (timelineMode === 'day') {
      return {
        timelineViewMode: 'Day',
        topTier: { unit: 'Day' },
        bottomTier: { unit: 'Hour', count: 6 },
      }
    }
    if (timelineMode === 'month') {
      return {
        timelineViewMode: 'Month',
        topTier: { unit: 'Month', format: 'MMM yyyy' },
        bottomTier: { unit: 'Week', format: 'dd MMM' },
      }
    }
    return {
      timelineViewMode: 'Week',
      topTier: { unit: 'Week', format: 'dd MMM' },
      bottomTier: { unit: 'Day', format: 'EEE' },
    }
  }, [timelineMode])

  const loadDataverseData = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setIsLoading(true)
      setLoadError(null)
      setDebugInfo('')
    } else {
      setIsRefreshing(true)
    }

    try {
      const projectLoad = await Cr809_projectsService.getAll({ top: 5000 })
      const assetLoad = await Cr809_assetsService.getAll({ top: 5000 })
      const activityLoad = await Cr809_activitiesService.getAll({ top: 5000 })

      const projects = projectLoad.success ? projectLoad.data ?? [] : []
      const assets = assetLoad.success ? assetLoad.data ?? [] : []
      const activities = activityLoad.success ? activityLoad.data ?? [] : []

      const loadMessages: string[] = [
        `projects=${projects.length}`,
        `assets=${assets.length}`,
        `activities=${activities.length}`,
      ]

      if (!projectLoad.success && projectLoad.error) loadMessages.push(`project-error=${projectLoad.error.message}`)
      if (!assetLoad.success && assetLoad.error) loadMessages.push(`asset-error=${assetLoad.error.message}`)
      if (!activityLoad.success && activityLoad.error) loadMessages.push(`activity-error=${activityLoad.error.message}`)

      setDebugInfo(loadMessages.join(' | '))
      setRawProjects(projects)
      setRawAssets(assets)
      setRawActivities(activities)

      const mapped = buildTaskData(projects, assets, activities)

      const orphanAssets = mapped.filter((item) => item.ItemType === 'Asset' && !item.ParentID).length
      const orphanActivities = mapped.filter((item) => item.ItemType === 'Activity' && !item.ParentID).length

      setDebugInfo((prev) => `${prev} | mapped=${mapped.length} | orphanAssets=${orphanAssets} | orphanActivities=${orphanActivities}`)

      setTasks(mapped)
      setDataVersion((value) => value + 1)
      setLastSyncedAt(new Date())
      setLoadError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error loading Dataverse data.'
      setLoadError(message)
      setDebugInfo(`loader-exception=${message}`)
    } finally {
      if (mode === 'initial') setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadDataverseData('initial')
  }, [loadDataverseData])

  useEffect(() => {
    const refreshMs = 60_000
    const intervalId = globalThis.setInterval(() => {
      void loadDataverseData('refresh')
    }, refreshMs)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadDataverseData('refresh')
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      globalThis.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadDataverseData])

  useEffect(() => {
    if (dataVersion === 0) return

    let cleanup: (() => void) | undefined

    const timer = setTimeout(() => {
      const ganttEl = document.getElementById('GanttMvp')
      const chartScroll = ganttEl?.querySelector('.e-chart-scroll-container') as HTMLElement | null
      const topScroll = topScrollRef.current
      const topScrollInner = topScrollInnerRef.current
      if (!chartScroll || !topScroll || !topScrollInner) return

      const ganttRect = ganttEl!.getBoundingClientRect()
      const chartRect = chartScroll.getBoundingClientRect()
      topScroll.style.marginLeft = `${Math.max(0, chartRect.left - ganttRect.left)}px`

      chartScroll.classList.add('hide-scrollbar')

      const syncInnerWidth = () => {
        topScrollInner.style.width = `${chartScroll.scrollWidth}px`
      }
      syncInnerWidth()

      let syncing = false
      const onTopScroll = () => {
        if (syncing) return
        syncing = true
        chartScroll.scrollLeft = topScroll.scrollLeft
        syncing = false
      }
      const onChartScroll = () => {
        if (syncing) return
        syncing = true
        topScroll.scrollLeft = chartScroll.scrollLeft
        syncing = false
      }

      topScroll.addEventListener('scroll', onTopScroll)
      chartScroll.addEventListener('scroll', onChartScroll)

      const observer = new ResizeObserver(syncInnerWidth)
      observer.observe(chartScroll)

      cleanup = () => {
        topScroll.removeEventListener('scroll', onTopScroll)
        chartScroll.removeEventListener('scroll', onChartScroll)
        observer.disconnect()
        chartScroll.classList.remove('hide-scrollbar')
        topScroll.style.marginLeft = ''
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      cleanup?.()
    }
  }, [dataVersion])

  async function cascadeActivityDates(edited: TaskRecord, remountGantt = false): Promise<void> {
    if (!edited.AssetId) return

    const related = tasks
      .filter((task) => task.ItemType === 'Activity' && task.AssetId === edited.AssetId)
      .sort((a, b) => (a.Sequence ?? 0) - (b.Sequence ?? 0))

    const startIndex = related.findIndex((task) => task.SourceId === edited.SourceId)
    if (startIndex < 0) return

    const updatedActivities = [...related]
    updatedActivities[startIndex] = {
      ...updatedActivities[startIndex],
      StartDate: edited.StartDate,
      EndDate: edited.EndDate,
      Progress: edited.Progress,
    }

    for (let i = startIndex + 1; i < updatedActivities.length; i += 1) {
      const previous = updatedActivities[i - 1]
      const current = updatedActivities[i]
      const durationDays = current.DurationDays ?? 1
      const nextStart = addDays(previous.EndDate, 1)
      updatedActivities[i] = {
        ...current,
        StartDate: nextStart,
        EndDate: addDays(nextStart, durationDays - 1),
      }
    }

    const activityById = new Map(updatedActivities.map((item) => [item.SourceId, item]))
    const allUpdated = tasks.map((task) => activityById.get(task.SourceId) ?? task)
    setTasks(allUpdated)

    // When called from a taskbar drag, force a clean Gantt remount so React state
    // and Syncfusion's internal model stay in sync. Calling updateRecordByID while
    // Syncfusion is mid-drag causes the chart to lock up.
    if (remountGantt) {
      setDataVersion((v) => v + 1)
    }

    for (const activity of updatedActivities) {
      await Cr809_activitiesService.update(activity.SourceId, {
        cr809_startdate: toDataverseDate(activity.StartDate),
        cr809_enddate: toDataverseDate(activity.EndDate),
        cr809_progress: activity.Progress,
      })
    }
  }

  async function handleActionComplete(args: { requestType?: string; data?: unknown }): Promise<void> {
    if (args.requestType !== 'save' || !args.data) return

    const row = args.data as Partial<TaskRecord>
    if (!row.SourceId || row.ItemType !== 'Activity' || !row.StartDate || !row.EndDate) return

    const edited: TaskRecord = {
      TaskID: row.TaskID ?? `activity:${row.SourceId}`,
      SourceId: row.SourceId,
      ItemType: 'Activity',
      ParentID: row.ParentID,
      AssetId: row.AssetId,
      TaskName: row.TaskName ?? 'Activity',
      StartDate: new Date(row.StartDate),
      EndDate: new Date(row.EndDate),
      Sequence: row.Sequence,
      DurationDays: row.DurationDays,
      Progress: row.Progress ?? 0,
      Status: row.Status,
      Predecessor: row.Predecessor,
    }

    await cascadeActivityDates(edited)
  }

  // Prevent taskbar dragging for non-activity rows
  function handleTaskbarEditing(args: { data: { taskData: TaskRecord }; cancel: boolean }): void {
    const task = args.data?.taskData
    if (task && task.ItemType !== 'Activity') {
      args.cancel = true
    }
  }

  // After drag: cascade subsequent activities
  async function handleTaskbarEdited(args: {
    data: { taskData: TaskRecord; StartDate?: Date; EndDate?: Date; Progress?: number }
  }): Promise<void> {
    const raw = args.data
    const task = raw?.taskData
    if (!task || task.ItemType !== 'Activity') return

    const edited: TaskRecord = {
      ...task,
      StartDate: raw.StartDate instanceof Date ? raw.StartDate : task.StartDate,
      EndDate: raw.EndDate instanceof Date ? raw.EndDate : task.EndDate,
      Progress: raw.Progress ?? task.Progress,
    }

    await cascadeActivityDates(edited, true)
  }

  function handleActionFailure(args: unknown): void {
    // Log to console for debugging but do not surface as a load error —
    // Syncfusion action failures (validation, sort, etc.) are not Dataverse failures.
    if (import.meta.env.DEV) {
      console.warn('[Gantt] actionFailure:', args)
    }
  }

  function handleQueryTaskbarInfo(args: {
    data: { taskData: TaskRecord }
    taskbarBgColor: string
    progressBarBgColor: string
    taskbarBorderColor: string
  }): void {
    const task = args.data?.taskData
    if (!task) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const now = today.getTime()

    let bg: string
    let progress: string

    if (task.ItemType === 'Activity') {
      if (task.IsVendorActivity) {
        bg = '#fbcfe8'
        progress = '#be185d'
      } else {
      switch (task.Status) {
        case 'NotStarted':
          bg = '#d1d5db'
          progress = '#6b7280'
          break
        case 'Completed':
          bg = '#bbf7d0'
          progress = '#16a34a'
          break
        case 'Blocked':
          bg = '#fde68a'
          progress = '#d97706'
          break
        case 'InProgress': {
          const start = task.StartDate.getTime()
          const end = task.EndDate.getTime()
          const totalDuration = end - start
          const timeElapsedRatio = totalDuration > 0
            ? Math.min(1, Math.max(0, (now - start) / totalDuration))
            : 0
          const progressRatio = (task.Progress ?? 0) / 100
          if (progressRatio >= timeElapsedRatio) {
            bg = '#bfdbfe'
            progress = '#2563eb'
          } else {
            bg = '#fecaca'
            progress = '#dc2626'
          }
          break
        }
        default:
          return
      }
      }
    } else {
      const pct = task.Progress ?? 0
      if (pct === 0) {
        bg = '#d1d5db'
        progress = '#6b7280'
      } else if (pct >= 100) {
        bg = '#bbf7d0'
        progress = '#16a34a'
      } else {
        const start = task.StartDate.getTime()
        const end = task.EndDate.getTime()
        const totalDuration = end - start
        const timeElapsedRatio = totalDuration > 0
          ? Math.min(1, Math.max(0, (now - start) / totalDuration))
          : 0
        const progressRatio = pct / 100
        if (progressRatio >= timeElapsedRatio) {
          bg = '#bfdbfe'
          progress = '#2563eb'
        } else {
          bg = '#fecaca'
          progress = '#dc2626'
        }
      }
    }

    args.taskbarBgColor = bg
    args.progressBarBgColor = progress
    args.taskbarBorderColor = progress
  }

  function handleRecordClick(args: { data: unknown }): void {
    const data = args?.data
    let task: TaskRecord | null = null
    if (data && typeof data === 'object') {
      if ('taskData' in data) {
        task = (data as { taskData: TaskRecord }).taskData
      } else if ('TaskID' in data) {
        task = data as TaskRecord
      }
    }
    if (task) setSelectedTask(task)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <img src={logoUrl} alt="Contoso Motors" className="app-logo-img" />
          <h1>Gantt MVP</h1>
          <nav className="app-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'gantt'}
              className={`app-tab ${activeTab === 'gantt' ? 'active' : ''}`}
              onClick={() => setActiveTab('gantt')}
            >
              Timeline
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'insights'}
              className={`app-tab ${activeTab === 'insights' ? 'active' : ''}`}
              onClick={() => setActiveTab('insights')}
            >
              Insights
            </button>
          </nav>
        </div>

        {activeTab === 'gantt' && (
          <div className="view-controls" role="group" aria-label="Timeline modes">
            <button type="button" onClick={() => setTimelineMode('day')} className={timelineMode === 'day' ? 'active' : ''}>
              Day
            </button>
            <button type="button" onClick={() => setTimelineMode('week')} className={timelineMode === 'week' ? 'active' : ''}>
              Week
            </button>
            <button type="button" onClick={() => setTimelineMode('month')} className={timelineMode === 'month' ? 'active' : ''}>
              Month
            </button>
            <button type="button" onClick={() => ganttRef.current?.zoomIn()}>
              Zoom In
            </button>
            <button type="button" onClick={() => ganttRef.current?.zoomOut()}>
              Zoom Out
            </button>
            <button type="button" onClick={() => ganttRef.current?.fitToProject()}>
              Fit
            </button>
            <button type="button" onClick={() => { void loadDataverseData('refresh') }} disabled={isLoading || isRefreshing}>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        )}
      </header>

      {isLoading ? <p className="status-line">Loading Dataverse data...</p> : null}
      {!isLoading && lastSyncedAt ? (
        <p className="status-line">Live sync active. Last updated {lastSyncedAt.toLocaleTimeString('en-US')}.</p>
      ) : null}
      {loadError ? <p className="status-line error">Failed to load Dataverse data: {loadError}</p> : null}
      {!isLoading && !loadError && tasks.length === 0 ? <p className="status-line">No project/asset/activity rows found.</p> : null}
      {!isLoading && debugInfo ? <p className="status-line debug">{debugInfo}</p> : null}

      {activeTab === 'insights' ? (
        <Dashboard
          tasks={tasks as DashTaskRecord[]}
          rawProjects={rawProjects}
          onActivityClick={(t) => setSelectedTask(t as TaskRecord)}
        />
      ) : (
        <>
          <div className="gantt-legend">
            <span className="gantt-legend-title">Legend</span>
            {([
              { bg: '#fbcfe8', border: '#be185d', label: 'Vendor Activity' },
              { bg: '#bbf7d0', border: '#16a34a', label: 'Completed' },
              { bg: '#bfdbfe', border: '#2563eb', label: 'On Track' },
              { bg: '#fecaca', border: '#dc2626', label: 'Behind Schedule' },
              { bg: '#fde68a', border: '#d97706', label: 'Blocked' },
              { bg: '#d1d5db', border: '#6b7280', label: 'Not Started' },
            ] as { bg: string; border: string; label: string }[]).map((item) => (
              <span key={item.label} className="gantt-legend-item">
                <span className="gantt-legend-swatch" style={{ background: item.bg, borderColor: item.border }} />
                {item.label}
              </span>
            ))}
            <span className="gantt-legend-hint">Drag activity bars to shift dates</span>
          </div>
          <section className="gantt-panel">
            <div ref={topScrollRef} className="gantt-top-scroll">
              <div ref={topScrollInnerRef} style={{ height: 1 }} />
            </div>
            <GanttComponent
              key={`gantt-${dataVersion}`}
              ref={ganttRef}
              id="GanttMvp"
              dataSource={tasks}
              taskFields={taskFields}
              height="auto"
              allowFiltering={true}
              allowSorting={true}
              allowSelection={true}
              allowReordering={true}
              allowResizing={true}
              treeColumnIndex={1}
              splitterSettings={{ columnIndex: 6 }}
              editSettings={editSettings}
              toolbar={toolbar}
              timelineSettings={timelineSettings}
              highlightWeekends={true}
              actionComplete={(args) => {
                void handleActionComplete(args)
              }}
              actionFailure={handleActionFailure}
              queryTaskbarInfo={(args) => {
                handleQueryTaskbarInfo(args as Parameters<typeof handleQueryTaskbarInfo>[0])
              }}
              taskbarEditing={(args) => {
                handleTaskbarEditing(args as Parameters<typeof handleTaskbarEditing>[0])
              }}
              taskbarEdited={(args) => {
                void handleTaskbarEdited(args as Parameters<typeof handleTaskbarEdited>[0])
              }}
              rowSelected={(args) => {
                handleRecordClick(args as Parameters<typeof handleRecordClick>[0])
              }}
            >
              <ColumnsDirective>
                <ColumnDirective
                  field="ItemType"
                  headerText=""
                  width="42"
                  template={gcTypeIndicatorTemplate as unknown as Function}
                  allowEditing={false}
                  allowSorting={false}
                  allowResizing={false}
                  textAlign="Center"
                />
                <ColumnDirective
                  field="TaskName"
                  headerText="Task"
                  width="230"
                />
                <ColumnDirective
                  field="Status"
                  headerText="Status"
                  width="115"
                  template={gcStatusTemplate as unknown as Function}
                  allowEditing={false}
                  allowSorting={false}
                />
                <ColumnDirective
                  field="StartDate"
                  headerText="Start"
                  width="95"
                  template={gcStartDateTemplate as unknown as Function}
                  allowEditing={false}
                  allowSorting={false}
                />
                <ColumnDirective
                  field="EndDate"
                  headerText="End"
                  width="95"
                  template={gcEndDateTemplate as unknown as Function}
                  allowEditing={false}
                  allowSorting={false}
                />
                <ColumnDirective
                  field="Progress"
                  headerText="Progress"
                  width="130"
                  template={gcProgressTemplate as unknown as Function}
                />
              </ColumnsDirective>
              <Inject services={[Edit, Filter, Sort, Toolbar, Selection, DayMarkers, Reorder, Resize]} />
            </GanttComponent>
          </section>
        </>
      )}

      <DetailPanel
        task={selectedTask as DashTaskRecord}
        rawProjectMap={rawProjectMap}
        rawAssetMap={rawAssetMap}
        rawActivityMap={rawActivityMap}
        allTasks={tasks as DashTaskRecord[]}
        rawAssets={rawAssets}
        rawActivities={rawActivities}
        onClose={() => setSelectedTask(null)}
      />
    </main>
  )
}

export default App
