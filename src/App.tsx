import { useEffect, useMemo, useRef, useState } from 'react'
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
import './App.css'

type TimelineMode = 'day' | 'week' | 'month'

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
      Progress: 0,
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
      Progress: 0,
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
        Progress: 0,
        Predecessor: previousTaskId ? `${previousTaskId}FS` : undefined,
      })

      previousTaskId = taskId
    }
  }

  const linkedAssets = assetTasks.filter((asset) => Boolean(asset.ParentID))
  const linkedActivities = activityTasks.filter((activity) => Boolean(activity.ParentID))

  return [...projectTasks, ...linkedAssets, ...linkedActivities]
}

function App() {
  const ganttRef = useRef<GanttComponent | null>(null)
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('week')
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string>('')

  const taskFields = useMemo<TaskFieldsModel>(
    () => ({
      id: 'TaskID',
      name: 'TaskName',
      startDate: 'StartDate',
      endDate: 'EndDate',
      progress: 'Progress',
      parentID: 'ParentID',
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

  useEffect(() => {
    void (async () => {
      setIsLoading(true)
      setLoadError(null)
      setDebugInfo('')
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

        const mapped = buildTaskData(
          projects,
          assets,
          activities,
        )

        const orphanAssets = mapped.filter((item) => item.ItemType === 'Asset' && !item.ParentID).length
        const orphanActivities = mapped.filter((item) => item.ItemType === 'Activity' && !item.ParentID).length

        setDebugInfo((prev) => `${prev} | mapped=${mapped.length} | orphanAssets=${orphanAssets} | orphanActivities=${orphanActivities}`)

        setTasks(mapped)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error loading Dataverse data.'
        setLoadError(message)
        setDebugInfo(`loader-exception=${message}`)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  async function cascadeActivityDates(edited: TaskRecord): Promise<void> {
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

    for (const activity of updatedActivities) {
      await Cr809_activitiesService.update(activity.SourceId, {
        cr809_startdate: toDataverseDate(activity.StartDate),
        cr809_enddate: toDataverseDate(activity.EndDate),
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
      Predecessor: row.Predecessor,
    }

    await cascadeActivityDates(edited)
  }

  function handleActionFailure(args: unknown): void {
    let message = 'Unknown Syncfusion action failure.'
    if (args && typeof args === 'object' && 'error' in args) {
      const maybeError = (args as { error?: unknown }).error
      if (Array.isArray(maybeError) && maybeError.length > 0) {
        message = String(maybeError[0])
      } else if (maybeError instanceof Error) {
        message = maybeError.message
      } else if (maybeError) {
        message = String(maybeError)
      }
    }
    setLoadError(`Gantt action failure: ${message}`)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Gantt MVP</h1>
        </div>
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
        </div>
      </header>

      {isLoading ? <p className="status-line">Loading Dataverse data...</p> : null}
      {loadError ? <p className="status-line error">Failed to load Dataverse data: {loadError}</p> : null}
      {!isLoading && !loadError && tasks.length === 0 ? <p className="status-line">No project/asset/activity rows found.</p> : null}
      {!isLoading && debugInfo ? <p className="status-line debug">{debugInfo}</p> : null}

      <section className="gantt-panel">
        <GanttComponent
          ref={ganttRef}
          id="GanttMvp"
          dataSource={tasks}
          taskFields={taskFields}
          height="72vh"
          allowFiltering={true}
          allowSorting={true}
          allowSelection={true}
          allowReordering={true}
          allowResizing={true}
          treeColumnIndex={2}
          splitterSettings={{ columnIndex: 3 }}
          editSettings={editSettings}
          toolbar={toolbar}
          timelineSettings={timelineSettings}
          highlightWeekends={true}
          actionComplete={(args) => {
            void handleActionComplete(args)
          }}
          actionFailure={handleActionFailure}
        >
          <ColumnsDirective>
            <ColumnDirective field="TaskID" headerText="ID" width="90" textAlign="Right" isPrimaryKey={true} />
            <ColumnDirective field="ItemType" headerText="Type" width="110" />
            <ColumnDirective field="TaskName" headerText="Task" width="280" />
            <ColumnDirective field="StartDate" width="140" />
            <ColumnDirective field="EndDate" width="140" />
            <ColumnDirective field="Sequence" width="110" />
            <ColumnDirective field="Progress" width="120" textAlign="Right" />
            <ColumnDirective field="Predecessor" headerText="Dependency" width="140" />
          </ColumnsDirective>
          <Inject services={[Edit, Filter, Sort, Toolbar, Selection, DayMarkers, Reorder, Resize]} />
        </GanttComponent>
      </section>
    </main>
  )
}

export default App
