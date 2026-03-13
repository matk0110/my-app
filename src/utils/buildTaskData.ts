import type { Cr809_projects } from '../generated/models/Cr809_projectsModel'
import type { Cr809_assets } from '../generated/models/Cr809_assetsModel'
import type { Cr809_activities } from '../generated/models/Cr809_activitiesModel'
import { Cr809_activitiescr809_status } from '../generated/models/Cr809_activitiesModel'

export type ActivityStatus = 'NotStarted' | 'InProgress' | 'Completed' | 'Blocked'

export type TaskRecord = {
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

export function normalizeGuid(value?: string): string | undefined {
  if (!value) return undefined
  return value.replace(/[{}]/g, '').trim().toLowerCase()
}

export function parseDate(value?: string): Date {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

export function getDurationDays(activity: Cr809_activities): number {
  const raw = Number(activity.cr809_duration)
  if (Number.isNaN(raw) || raw <= 0) return 1
  return Math.max(1, Math.round(raw))
}

export function buildTaskData(
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
