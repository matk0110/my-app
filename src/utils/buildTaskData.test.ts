import { describe, it, expect } from 'vitest'
import {
  buildTaskData,
  normalizeGuid,
  parseDate,
  addDays,
  getDurationDays,
} from './buildTaskData'
import type { Cr809_projects } from '../generated/models/Cr809_projectsModel'
import type { Cr809_assets } from '../generated/models/Cr809_assetsModel'
import type { Cr809_activities } from '../generated/models/Cr809_activitiesModel'

// ── Helpers to build minimal Dataverse records ──────────────────────

function makeProject(overrides: Partial<Cr809_projects> = {}): Cr809_projects {
  return {
    cr809_projectid: 'p1',
    cr809_projectname: 'Test Project',
    cr809_createddate: '2025-01-01',
    cr809_startdate: '2025-01-01',
    cr809_enddate: '2025-12-31',
    cr809_progress: 50,
    cr809_status: 804270001 as never,
    'cr809_ProjectRequest@odata.bind': '',
    ownerid: 'owner',
    owneridtype: 'systemusers',
    statecode: 0 as never,
    owneridname: '',
    owneridyominame: '',
    owningbusinessunitname: '',
    createdbyyominame: '',
    createdonbehalfbyyominame: '',
    modifiedbyyominame: '',
    modifiedonbehalfbyyominame: '',
    ...overrides,
  } as Cr809_projects
}

function makeAsset(overrides: Partial<Cr809_assets> = {}): Cr809_assets {
  return {
    cr809_assetid: 'a1',
    cr809_assetname: 'Test Asset',
    cr809_startdate: '2025-02-01',
    cr809_enddate: '2025-06-30',
    cr809_progress: 30,
    cr809_assettype: 804270000 as never,
    cr809_status: 804270000 as never,
    ownerid: 'owner',
    owneridtype: 'systemusers',
    statecode: 0 as never,
    _cr809_project_value: 'p1',
    owneridname: '',
    owneridyominame: '',
    owningbusinessunitname: '',
    createdbyyominame: '',
    createdonbehalfbyyominame: '',
    modifiedbyyominame: '',
    modifiedonbehalfbyyominame: '',
    ...overrides,
  } as Cr809_assets
}

function makeActivity(overrides: Partial<Cr809_activities> = {}): Cr809_activities {
  return {
    cr809_activityid: 'act1',
    cr809_activityname: 'Test Activity',
    cr809_startdate: '2025-03-01',
    cr809_enddate: '2025-04-01',
    cr809_duration: '10',
    cr809_sequence: '1',
    cr809_progress: 0,
    cr809_status: 804270000 as never,
    ownerid: 'owner',
    owneridtype: 'systemusers',
    statecode: 0 as never,
    _cr809_asset_value: 'a1',
    owneridname: '',
    owneridyominame: '',
    owningbusinessunitname: '',
    createdbyyominame: '',
    createdonbehalfbyyominame: '',
    modifiedbyyominame: '',
    modifiedonbehalfbyyominame: '',
    ...overrides,
  } as Cr809_activities
}

// ── normalizeGuid ───────────────────────────────────────────────────

describe('normalizeGuid', () => {
  it('returns undefined for falsy input', () => {
    expect(normalizeGuid(undefined)).toBeUndefined()
    expect(normalizeGuid('')).toBeUndefined()
  })

  it('strips curly braces and lowercases', () => {
    expect(normalizeGuid('{ABC-123}')).toBe('abc-123')
  })

  it('trims whitespace', () => {
    expect(normalizeGuid('  abc  ')).toBe('abc')
  })

  it('handles already-clean GUIDs', () => {
    expect(normalizeGuid('abc-def-123')).toBe('abc-def-123')
  })
})

// ── parseDate ───────────────────────────────────────────────────────

describe('parseDate', () => {
  it('returns current date for undefined input', () => {
    const result = parseDate(undefined)
    expect(result).toBeInstanceOf(Date)
    expect(Number.isNaN(result.getTime())).toBe(false)
  })

  it('returns current date for empty string', () => {
    const result = parseDate('')
    expect(Number.isNaN(result.getTime())).toBe(false)
  })

  it('parses valid ISO date string', () => {
    const result = parseDate('2025-06-15T12:00:00.000Z')
    expect(result.getUTCFullYear()).toBe(2025)
    expect(result.getUTCMonth()).toBe(5) // 0-indexed
    expect(result.getUTCDate()).toBe(15)
  })

  it('returns current date for garbage input', () => {
    const result = parseDate('not-a-date-at-all')
    expect(Number.isNaN(result.getTime())).toBe(false)
  })
})

// ── addDays ─────────────────────────────────────────────────────────

describe('addDays', () => {
  it('adds positive days', () => {
    const base = new Date(2025, 0, 1) // Jan 1, 2025 local
    const result = addDays(base, 10)
    expect(result.getDate()).toBe(11)
  })

  it('does not mutate the original date', () => {
    const base = new Date(2025, 0, 1)
    addDays(base, 5)
    expect(base.getDate()).toBe(1)
  })

  it('handles zero days', () => {
    const base = new Date(2025, 5, 15)
    const result = addDays(base, 0)
    expect(result.getTime()).toBe(base.getTime())
  })

  it('handles negative days', () => {
    const base = new Date(2025, 0, 10)
    const result = addDays(base, -3)
    expect(result.getDate()).toBe(7)
  })
})

// ── getDurationDays ─────────────────────────────────────────────────

describe('getDurationDays', () => {
  it('returns parsed integer for valid duration', () => {
    const activity = makeActivity({ cr809_duration: '10' })
    expect(getDurationDays(activity)).toBe(10)
  })

  it('returns 1 for undefined duration', () => {
    const activity = makeActivity({ cr809_duration: undefined })
    expect(getDurationDays(activity)).toBe(1)
  })

  it('returns 1 for zero duration', () => {
    const activity = makeActivity({ cr809_duration: '0' })
    expect(getDurationDays(activity)).toBe(1)
  })

  it('returns 1 for negative duration', () => {
    const activity = makeActivity({ cr809_duration: '-5' })
    expect(getDurationDays(activity)).toBe(1)
  })

  it('returns 1 for NaN duration', () => {
    const activity = makeActivity({ cr809_duration: 'abc' })
    expect(getDurationDays(activity)).toBe(1)
  })

  it('rounds fractional durations', () => {
    const activity = makeActivity({ cr809_duration: '3.7' })
    expect(getDurationDays(activity)).toBe(4)
  })
})

// ── buildTaskData ───────────────────────────────────────────────────

describe('buildTaskData', () => {
  describe('empty inputs', () => {
    it('returns empty array when all inputs are empty', () => {
      const result = buildTaskData([], [], [])
      expect(result).toEqual([])
    })

    it('returns projects only when no assets or activities', () => {
      const result = buildTaskData([makeProject()], [], [])
      expect(result).toHaveLength(1)
      expect(result[0].ItemType).toBe('Project')
      expect(result[0].TaskID).toBe('project:p1')
    })
  })

  describe('project tasks', () => {
    it('creates project TaskRecord with correct fields', () => {
      const project = makeProject({
        cr809_projectid: '{PROJ-ABC}',
        cr809_projectname: 'Alpha',
        cr809_startdate: '2025-01-01',
        cr809_enddate: '2025-12-31',
        cr809_progress: 75,
      })
      const result = buildTaskData([project], [], [])

      expect(result).toHaveLength(1)
      expect(result[0].TaskID).toBe('project:proj-abc')
      expect(result[0].SourceId).toBe('proj-abc')
      expect(result[0].ItemType).toBe('Project')
      expect(result[0].TaskName).toBe('Alpha')
      expect(result[0].Progress).toBe(75)
    })

    it('clamps progress between 0 and 100', () => {
      const over = buildTaskData([makeProject({ cr809_progress: 150 })], [], [])
      expect(over[0].Progress).toBe(100)

      const under = buildTaskData([makeProject({ cr809_progress: -10 })], [], [])
      expect(under[0].Progress).toBe(0)
    })
  })

  describe('asset linkage', () => {
    it('links asset to parent project when project exists', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const result = buildTaskData([project], [asset], [])

      const assetTask = result.find((t) => t.ItemType === 'Asset')
      expect(assetTask).toBeDefined()
      expect(assetTask!.ParentID).toBe('project:p1')
    })

    it('excludes orphan assets (no matching project)', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const orphanAsset = makeAsset({ cr809_assetid: 'a-orphan', _cr809_project_value: 'no-such-project' })
      const result = buildTaskData([project], [orphanAsset], [])

      // Orphan assets are excluded from final output (linkedAssets filter)
      const assetTasks = result.filter((t) => t.ItemType === 'Asset')
      expect(assetTasks).toHaveLength(0)
    })

    it('projects with no linked assets still appear', () => {
      const result = buildTaskData([makeProject()], [makeAsset({ _cr809_project_value: 'other-project' })], [])
      expect(result.filter((t) => t.ItemType === 'Project')).toHaveLength(1)
    })
  })

  describe('activity linkage', () => {
    it('links activity to parent asset when asset is linked to project', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const activity = makeActivity({ cr809_activityid: 'act1', _cr809_asset_value: 'a1' })
      const result = buildTaskData([project], [asset], [activity])

      const actTask = result.find((t) => t.ItemType === 'Activity')
      expect(actTask).toBeDefined()
      expect(actTask!.ParentID).toBe('asset:a1')
    })

    it('excludes orphan activities (asset not linked to any project)', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const orphanAsset = makeAsset({ cr809_assetid: 'a-orphan', _cr809_project_value: 'no-project' })
      const activity = makeActivity({ cr809_activityid: 'act1', _cr809_asset_value: 'a-orphan' })
      const result = buildTaskData([project], [orphanAsset], [activity])

      const actTasks = result.filter((t) => t.ItemType === 'Activity')
      expect(actTasks).toHaveLength(0)
    })

    it('uses cr809_assetid when _cr809_asset_value is missing', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const activity = makeActivity({
        cr809_activityid: 'act1',
        _cr809_asset_value: undefined,
        cr809_assetid: 'a1',
      })
      const result = buildTaskData([project], [asset], [activity])
      const actTask = result.find((t) => t.ItemType === 'Activity')
      expect(actTask).toBeDefined()
      expect(actTask!.AssetId).toBe('a1')
    })
  })

  describe('predecessor chain generation', () => {
    it('builds FS predecessor chain for activities within same asset, sorted by sequence', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const act1 = makeActivity({ cr809_activityid: 'act1', cr809_sequence: '1', _cr809_asset_value: 'a1' })
      const act2 = makeActivity({ cr809_activityid: 'act2', cr809_sequence: '2', _cr809_asset_value: 'a1' })
      const act3 = makeActivity({ cr809_activityid: 'act3', cr809_sequence: '3', _cr809_asset_value: 'a1' })
      const result = buildTaskData([project], [asset], [act1, act2, act3])

      const activities = result.filter((t) => t.ItemType === 'Activity')
      expect(activities).toHaveLength(3)

      const first = activities.find((a) => a.SourceId === 'act1')!
      const second = activities.find((a) => a.SourceId === 'act2')!
      const third = activities.find((a) => a.SourceId === 'act3')!

      expect(first.Predecessor).toBeUndefined()
      expect(second.Predecessor).toBe('activity:act1FS')
      expect(third.Predecessor).toBe('activity:act2FS')
    })

    it('sorts activities by sequence number before chaining', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      // Provide out-of-order
      const act3 = makeActivity({ cr809_activityid: 'act3', cr809_sequence: '3', _cr809_asset_value: 'a1' })
      const act1 = makeActivity({ cr809_activityid: 'act1', cr809_sequence: '1', _cr809_asset_value: 'a1' })
      const result = buildTaskData([project], [asset], [act3, act1])

      const activities = result.filter((t) => t.ItemType === 'Activity')
      expect(activities[0].Sequence).toBeLessThan(activities[1].Sequence!)
    })
  })

  describe('status enum mapping', () => {
    it('maps 804270000 to NotStarted', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const activity = makeActivity({ cr809_status: 804270000 as never, _cr809_asset_value: 'a1' })
      const result = buildTaskData([project], [asset], [activity])
      const actTask = result.find((t) => t.ItemType === 'Activity')
      expect(actTask!.Status).toBe('NotStarted')
    })

    it('maps 804270001 to InProgress', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const activity = makeActivity({ cr809_status: 804270001 as never, _cr809_asset_value: 'a1' })
      const result = buildTaskData([project], [asset], [activity])
      expect(result.find((t) => t.ItemType === 'Activity')!.Status).toBe('InProgress')
    })

    it('maps 804270002 to Completed', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const activity = makeActivity({ cr809_status: 804270002 as never, _cr809_asset_value: 'a1' })
      const result = buildTaskData([project], [asset], [activity])
      expect(result.find((t) => t.ItemType === 'Activity')!.Status).toBe('Completed')
    })

    it('maps 804270003 to Blocked', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const activity = makeActivity({ cr809_status: 804270003 as never, _cr809_asset_value: 'a1' })
      const result = buildTaskData([project], [asset], [activity])
      expect(result.find((t) => t.ItemType === 'Activity')!.Status).toBe('Blocked')
    })
  })

  describe('duration calculation', () => {
    it('computes EndDate from StartDate + duration when no EndDate provided', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const activity = makeActivity({
        cr809_activityid: 'act-dur',
        _cr809_asset_value: 'a1',
        cr809_startdate: '2025-06-01',
        cr809_enddate: undefined,
        cr809_duration: '5',
      })
      const result = buildTaskData([project], [asset], [activity])
      const actTask = result.find((t) => t.SourceId === 'act-dur')!
      expect(actTask.DurationDays).toBe(5)
      // End = Start + (5 - 1) days
      const expectedEnd = addDays(actTask.StartDate, 4)
      expect(actTask.EndDate.getDate()).toBe(expectedEnd.getDate())
    })
  })

  describe('vendor activity flag', () => {
    it('maps cr809_isvendoractivity=1 to true', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const activity = makeActivity({
        _cr809_asset_value: 'a1',
        cr809_isvendoractivity: 1 as never,
      })
      const result = buildTaskData([project], [asset], [activity])
      expect(result.find((t) => t.ItemType === 'Activity')!.IsVendorActivity).toBe(true)
    })

    it('maps cr809_isvendoractivity=0 to false', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const activity = makeActivity({
        _cr809_asset_value: 'a1',
        cr809_isvendoractivity: 0 as never,
      })
      const result = buildTaskData([project], [asset], [activity])
      expect(result.find((t) => t.ItemType === 'Activity')!.IsVendorActivity).toBe(false)
    })

    it('defaults to false when vendor flag is undefined', () => {
      const project = makeProject({ cr809_projectid: 'p1' })
      const asset = makeAsset({ cr809_assetid: 'a1', _cr809_project_value: 'p1' })
      const activity = makeActivity({
        _cr809_asset_value: 'a1',
        cr809_isvendoractivity: undefined,
      })
      const result = buildTaskData([project], [asset], [activity])
      expect(result.find((t) => t.ItemType === 'Activity')!.IsVendorActivity).toBe(false)
    })
  })

  describe('date normalization edge cases', () => {
    it('corrects EndDate < StartDate by setting EndDate = StartDate', () => {
      const project = makeProject({
        cr809_projectid: 'p-flip',
        cr809_startdate: '2025-06-15',
        cr809_enddate: '2025-01-01',
      })
      const result = buildTaskData([project], [], [])
      const task = result[0]
      expect(task.EndDate.getTime()).toBe(task.StartDate.getTime())
    })

    it('filters out tasks with no TaskName', () => {
      const project = makeProject({ cr809_projectname: '' })
      const result = buildTaskData([project], [], [])
      expect(result).toHaveLength(0)
    })
  })

  describe('GUID normalization in linkage', () => {
    it('matches GUIDs with curly braces to clean GUIDs', () => {
      const project = makeProject({ cr809_projectid: '{P-UPPER}' })
      const asset = makeAsset({
        cr809_assetid: '{A-UPPER}',
        _cr809_project_value: '{P-UPPER}',
      })
      const result = buildTaskData([project], [asset], [])
      const assetTask = result.find((t) => t.ItemType === 'Asset')
      expect(assetTask).toBeDefined()
      expect(assetTask!.ParentID).toBe('project:p-upper')
    })
  })
})
