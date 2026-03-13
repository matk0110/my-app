import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailPanel } from './DetailPanel'
import type { DashTaskRecord } from './Dashboard'
import type { Cr809_projects } from '../generated/models/Cr809_projectsModel'
import type { Cr809_assets } from '../generated/models/Cr809_assetsModel'
import type { Cr809_activities } from '../generated/models/Cr809_activitiesModel'

// ── Helpers ─────────────────────────────────────────────────────────

function makeDashTask(overrides: Partial<DashTaskRecord> = {}): DashTaskRecord {
  return {
    TaskID: 'activity:act1',
    TaskName: 'Test Activity',
    StartDate: new Date('2025-01-01'),
    EndDate: new Date('2025-06-30'),
    ItemType: 'Activity',
    SourceId: 'act1',
    Progress: 50,
    ...overrides,
  }
}

function makeRawProject(overrides: Partial<Cr809_projects> = {}): Cr809_projects {
  return {
    cr809_projectid: 'p1',
    cr809_projectname: 'Test Project',
    cr809_createddate: '2025-01-01',
    cr809_startdate: '2025-01-01',
    cr809_enddate: '2025-12-31',
    cr809_projectnumber: 'PRJ-001',
    cr809_status: 804270001 as never,
    cr809_statusname: 'InProgress',
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

function makeRawAsset(overrides: Partial<Cr809_assets> = {}): Cr809_assets {
  return {
    cr809_assetid: 'a1',
    cr809_assetname: 'Test Asset',
    cr809_assettype: 804270000 as never,
    cr809_assettypename: 'Equipment',
    cr809_status: 804270000 as never,
    cr809_statusname: 'Active',
    cr809_location: 'Building A',
    cr809_serialnumber: 'SN-12345',
    cr809_startdate: '2025-02-01',
    cr809_enddate: '2025-06-30',
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
  } as Cr809_assets
}

function makeRawActivity(overrides: Partial<Cr809_activities> = {}): Cr809_activities {
  return {
    cr809_activityid: 'act1',
    cr809_activityname: 'Test Activity',
    cr809_startdate: '2025-03-01',
    cr809_enddate: '2025-04-01',
    cr809_duration: '10',
    cr809_sequence: '1',
    cr809_progress: 50,
    cr809_status: 804270001 as never,
    cr809_statusname: 'InProgress',
    cr809_assignedtoname: 'Jane Doe',
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
  } as Cr809_activities
}

function defaultProps() {
  return {
    rawProjectMap: new Map<string, Cr809_projects>(),
    rawAssetMap: new Map<string, Cr809_assets>(),
    rawActivityMap: new Map<string, Cr809_activities>(),
    allTasks: [] as DashTaskRecord[],
    rawAssets: [] as Cr809_assets[],
    rawActivities: [] as Cr809_activities[],
    onClose: vi.fn(),
    onRefresh: vi.fn(),
  }
}

// ── Rendering tests ─────────────────────────────────────────────────

describe('DetailPanel', () => {
  it('renders nothing when task is null', () => {
    const { container } = render(<DetailPanel task={null} {...defaultProps()} />)
    expect(container.innerHTML).toBe('')
  })

  describe('Activity type', () => {
    it('renders activity badge and title', () => {
      const rawActivity = makeRawActivity()
      const props = defaultProps()
      props.rawActivityMap.set('act1', rawActivity)

      const task = makeDashTask({ ItemType: 'Activity', SourceId: 'act1', TaskName: 'Deploy Backend' })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('Activity')).toBeInTheDocument()
      expect(screen.getByText('Deploy Backend')).toBeInTheDocument()
    })

    it('displays status, assigned to, and progress', () => {
      const rawActivity = makeRawActivity({
        cr809_statusname: 'InProgress',
        cr809_assignedtoname: 'Jane Doe',
      })
      const props = defaultProps()
      props.rawActivityMap.set('act1', rawActivity)

      const task = makeDashTask({ ItemType: 'Activity', SourceId: 'act1', Progress: 50 })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('InProgress')).toBeInTheDocument()
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()
    })

    it('displays duration with day(s) label', () => {
      const rawActivity = makeRawActivity({ cr809_duration: '15' })
      const props = defaultProps()
      props.rawActivityMap.set('act1', rawActivity)

      const task = makeDashTask({ ItemType: 'Activity', SourceId: 'act1' })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('15 day(s)')).toBeInTheDocument()
    })

    it('handles missing activity raw data gracefully', () => {
      const props = defaultProps()
      // Don't add anything to rawActivityMap — SourceId won't match
      const task = makeDashTask({ ItemType: 'Activity', SourceId: 'missing' })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('Activity')).toBeInTheDocument()
    })
  })

  describe('Asset type', () => {
    it('renders asset badge and title', () => {
      const rawAsset = makeRawAsset()
      const props = defaultProps()
      props.rawAssetMap.set('a1', rawAsset)

      const task = makeDashTask({
        TaskID: 'asset:a1',
        ItemType: 'Asset',
        SourceId: 'a1',
        TaskName: 'CNC Machine',
      })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('Asset')).toBeInTheDocument()
      expect(screen.getByText('CNC Machine')).toBeInTheDocument()
    })

    it('displays asset details: type, location, serial number', () => {
      const rawAsset = makeRawAsset({
        cr809_assettypename: 'Equipment',
        cr809_location: 'Building A',
        cr809_serialnumber: 'SN-12345',
      })
      const props = defaultProps()
      props.rawAssetMap.set('a1', rawAsset)

      const task = makeDashTask({ TaskID: 'asset:a1', ItemType: 'Asset', SourceId: 'a1' })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('Equipment')).toBeInTheDocument()
      expect(screen.getByText('Building A')).toBeInTheDocument()
      expect(screen.getByText('SN-12345')).toBeInTheDocument()
    })

    it('shows child activity count', () => {
      const rawAsset = makeRawAsset({ cr809_assetid: 'a1' })
      const childActivity = makeRawActivity({ _cr809_asset_value: 'a1' })
      const props = defaultProps()
      props.rawAssetMap.set('a1', rawAsset)
      props.rawActivities = [childActivity]

      const task = makeDashTask({ TaskID: 'asset:a1', ItemType: 'Asset', SourceId: 'a1' })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('shows "No activities found." for asset with no children', () => {
      const rawAsset = makeRawAsset({ cr809_assetid: 'a1' })
      const props = defaultProps()
      props.rawAssetMap.set('a1', rawAsset)
      props.rawActivities = []

      const task = makeDashTask({ TaskID: 'asset:a1', ItemType: 'Asset', SourceId: 'a1' })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('No activities found.')).toBeInTheDocument()
    })
  })

  describe('Project type', () => {
    it('renders project badge and title', () => {
      const rawProject = makeRawProject()
      const props = defaultProps()
      props.rawProjectMap.set('p1', rawProject)

      const task = makeDashTask({
        TaskID: 'project:p1',
        ItemType: 'Project',
        SourceId: 'p1',
        TaskName: 'ERP Migration',
      })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('Project')).toBeInTheDocument()
      expect(screen.getByText('ERP Migration')).toBeInTheDocument()
    })

    it('displays project number and status', () => {
      const rawProject = makeRawProject({
        cr809_projectnumber: 'PRJ-001',
        cr809_statusname: 'InProgress',
      })
      const props = defaultProps()
      props.rawProjectMap.set('p1', rawProject)

      const task = makeDashTask({ TaskID: 'project:p1', ItemType: 'Project', SourceId: 'p1' })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('PRJ-001')).toBeInTheDocument()
    })

    it('shows "No assets found." for project with no children', () => {
      const rawProject = makeRawProject()
      const props = defaultProps()
      props.rawProjectMap.set('p1', rawProject)
      props.rawAssets = []

      const task = makeDashTask({ TaskID: 'project:p1', ItemType: 'Project', SourceId: 'p1' })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('No assets found.')).toBeInTheDocument()
    })

    it('lists child assets', () => {
      const rawProject = makeRawProject({ cr809_projectid: 'p1' })
      const childAsset = makeRawAsset({ _cr809_project_value: 'p1', cr809_assetname: 'Excavator' })
      const props = defaultProps()
      props.rawProjectMap.set('p1', rawProject)
      props.rawAssets = [childAsset]

      const task = makeDashTask({ TaskID: 'project:p1', ItemType: 'Project', SourceId: 'p1' })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('Excavator')).toBeInTheDocument()
    })
  })

  describe('progress bar color logic', () => {
    it('renders progress bar with correct percentage', () => {
      const rawActivity = makeRawActivity()
      const props = defaultProps()
      props.rawActivityMap.set('act1', rawActivity)

      const task = makeDashTask({ ItemType: 'Activity', SourceId: 'act1', Progress: 75 })
      render(<DetailPanel task={task} {...props} />)

      expect(screen.getByText('75%')).toBeInTheDocument()
    })
  })

  describe('close button', () => {
    it('calls onClose when close button clicked', () => {
      const onClose = vi.fn()
      const rawActivity = makeRawActivity()
      const props = { ...defaultProps(), onClose }
      props.rawActivityMap.set('act1', rawActivity)

      const task = makeDashTask({ ItemType: 'Activity', SourceId: 'act1' })
      render(<DetailPanel task={task} {...props} />)

      const btn = screen.getByRole('button', { name: /close/i })
      fireEvent.click(btn)
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('calls onClose when overlay is clicked', () => {
      const onClose = vi.fn()
      const rawActivity = makeRawActivity()
      const props = { ...defaultProps(), onClose }
      props.rawActivityMap.set('act1', rawActivity)

      const task = makeDashTask({ ItemType: 'Activity', SourceId: 'act1' })
      const { container } = render(<DetailPanel task={task} {...props} />)

      const overlay = container.querySelector('.dp-overlay')!
      fireEvent.click(overlay)
      expect(onClose).toHaveBeenCalledOnce()
    })
  })
})
