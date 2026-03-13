import { describe, it, expect } from 'vitest'
import {
  mapActivityToDataverse,
  mapAssetToDataverse,
  mapProjectToDataverse,
  type CreateActivityInput,
  type CreateAssetInput,
  type ProjectUpdateFields,
} from './dataverseFieldMaps'

// ── Tests ───────────────────────────────────────────────────────────

describe('dataverseFieldMaps', () => {
  describe('mapActivityToDataverse', () => {
    it('maps activity name correctly', () => {
      const input: CreateActivityInput = {
        name: 'Install HVAC System',
        status: 'NotStarted',
      }

      const result = mapActivityToDataverse(input)

      expect(result.cr809_activityname).toBe('Install HVAC System')
    })

    it('converts Date objects to ISO strings', () => {
      const input: CreateActivityInput = {
        name: 'Test Activity',
        startDate: new Date('2025-01-15T10:30:00.000Z'),
        endDate: new Date('2025-02-28T18:45:00.000Z'),
        status: 'InProgress',
      }

      const result = mapActivityToDataverse(input)

      expect(result.cr809_startdate).toBe('2025-01-15T10:30:00.000Z')
      expect(result.cr809_enddate).toBe('2025-02-28T18:45:00.000Z')
    })

    it('maps status NotStarted to 804270000', () => {
      const input: CreateActivityInput = {
        name: 'Activity',
        status: 'NotStarted',
      }

      const result = mapActivityToDataverse(input)

      expect(result.cr809_status).toBe(804270000)
    })

    it('maps status InProgress to 804270001', () => {
      const input: CreateActivityInput = {
        name: 'Activity',
        status: 'InProgress',
      }

      const result = mapActivityToDataverse(input)

      expect(result.cr809_status).toBe(804270001)
    })

    it('maps status Completed to 804270002', () => {
      const input: CreateActivityInput = {
        name: 'Activity',
        status: 'Completed',
      }

      const result = mapActivityToDataverse(input)

      expect(result.cr809_status).toBe(804270002)
    })

    it('maps status Blocked to 804270003', () => {
      const input: CreateActivityInput = {
        name: 'Activity',
        status: 'Blocked',
      }

      const result = mapActivityToDataverse(input)

      expect(result.cr809_status).toBe(804270003)
    })

    it('generates correct OData binding for asset relationship', () => {
      const input: CreateActivityInput = {
        name: 'Activity',
        status: 'NotStarted',
        assetId: 'abc-123-def-456',
      }

      const result = mapActivityToDataverse(input)

      expect(result['cr809_Asset@odata.bind']).toBe('/cr809_assets(abc-123-def-456)')
    })

    it('maps comments field correctly', () => {
      const input: CreateActivityInput = {
        name: 'Activity',
        status: 'NotStarted',
        comments: 'Test comment',
      }

      const result = mapActivityToDataverse(input)

      expect(result.cr809_comments).toBe('Test comment')
    })

    it('handles undefined optional fields gracefully', () => {
      const input: CreateActivityInput = {
        name: 'Minimal Activity',
        status: 'NotStarted',
      }

      const result = mapActivityToDataverse(input)

      expect(result.cr809_enddate).toBeUndefined()
      expect(result.cr809_progress).toBeUndefined()
      expect(result['cr809_Asset@odata.bind']).toBeUndefined()
      expect(result.cr809_comments).toBeUndefined()
    })

    it('handles midnight UTC boundary dates correctly', () => {
      const input: CreateActivityInput = {
        name: 'Midnight Task',
        startDate: new Date('2025-12-31T00:00:00.000Z'),
        endDate: new Date('2026-01-01T23:59:59.999Z'),
        status: 'NotStarted',
      }

      const result = mapActivityToDataverse(input)

      // Verify dates are preserved exactly as ISO strings
      expect(result.cr809_startdate).toBe('2025-12-31T00:00:00.000Z')
      expect(result.cr809_enddate).toBe('2026-01-01T23:59:59.999Z')
    })

    it('maps progress and comments when provided', () => {
      const input: CreateActivityInput = {
        name: 'Activity',
        status: 'InProgress',
        progress: 45,
        comments: 'Working on HVAC installation phase 2',
      }

      const result = mapActivityToDataverse(input)

      expect(result.cr809_progress).toBe(45)
      expect(result.cr809_comments).toBe('Working on HVAC installation phase 2')
    })
  })

  describe('mapAssetToDataverse', () => {
    it('maps asset name and type correctly', () => {
      const input: CreateAssetInput = {
        name: 'Forklift Model X',
        assetType: 'Equipment',
        status: 'Active',
      }

      const result = mapAssetToDataverse(input)

      expect(result.cr809_assetname).toBe('Forklift Model X')
      expect(result.cr809_assettype).toBe(804270000)
    })

    it('maps asset type Equipment to 804270000', () => {
      const result = mapAssetToDataverse({
        name: 'Asset',
        assetType: 'Equipment',
        status: 'Active',
      })
      expect(result.cr809_assettype).toBe(804270000)
    })

    it('maps asset type Vehicle to 804270001', () => {
      const result = mapAssetToDataverse({
        name: 'Asset',
        assetType: 'Vehicle',
        status: 'Active',
      })
      expect(result.cr809_assettype).toBe(804270001)
    })

    it('maps asset type Facility to 804270002', () => {
      const result = mapAssetToDataverse({
        name: 'Asset',
        assetType: 'Facility',
        status: 'Active',
      })
      expect(result.cr809_assettype).toBe(804270002)
    })

    it('maps asset type Software to 804270003', () => {
      const result = mapAssetToDataverse({
        name: 'Asset',
        assetType: 'Software',
        status: 'Active',
      })
      expect(result.cr809_assettype).toBe(804270003)
    })

    it('maps asset type Other to 804270004', () => {
      const result = mapAssetToDataverse({
        name: 'Asset',
        assetType: 'Other',
        status: 'Active',
      })
      expect(result.cr809_assettype).toBe(804270004)
    })

    it('maps asset status Active to 804270000', () => {
      const result = mapAssetToDataverse({
        name: 'Asset',
        assetType: 'Equipment',
        status: 'Active',
      })
      expect(result.cr809_status).toBe(804270000)
    })

    it('maps asset status Inactive to 804270001', () => {
      const result = mapAssetToDataverse({
        name: 'Asset',
        assetType: 'Equipment',
        status: 'Inactive',
      })
      expect(result.cr809_status).toBe(804270001)
    })

    it('maps asset status Retired to 804270002', () => {
      const result = mapAssetToDataverse({
        name: 'Asset',
        assetType: 'Equipment',
        status: 'Retired',
      })
      expect(result.cr809_status).toBe(804270002)
    })

    it('maps asset status Maintenance to 804270003', () => {
      const result = mapAssetToDataverse({
        name: 'Asset',
        assetType: 'Equipment',
        status: 'Maintenance',
      })
      expect(result.cr809_status).toBe(804270003)
    })

    it('generates correct OData binding for asset-to-project link', () => {
      const input: CreateAssetInput = {
        name: 'Asset',
        assetType: 'Equipment',
        status: 'Active',
        projectId: 'project-123',
      }

      const result = mapAssetToDataverse(input)

      expect(result['cr809_Project@odata.bind']).toBe('/cr809_projects(project-123)')
    })

    it('handles null optional fields gracefully', () => {
      const input: CreateAssetInput = {
        name: 'Minimal Asset',
        assetType: 'Vehicle',
        status: 'Active',
      }

      const result = mapAssetToDataverse(input)

      expect(result['cr809_Project@odata.bind']).toBeUndefined()
      expect(result.cr809_startdate).toBeUndefined()
      expect(result.cr809_enddate).toBeUndefined()
      expect(result.cr809_progress).toBeUndefined()
      expect(result.cr809_description).toBeUndefined()
    })

    it('converts asset dates to ISO strings', () => {
      const input: CreateAssetInput = {
        name: 'Asset',
        assetType: 'Facility',
        status: 'Active',
        startDate: new Date('2025-03-15T08:00:00.000Z'),
        endDate: new Date('2025-12-31T17:00:00.000Z'),
      }

      const result = mapAssetToDataverse(input)

      expect(result.cr809_startdate).toBe('2025-03-15T08:00:00.000Z')
      expect(result.cr809_enddate).toBe('2025-12-31T17:00:00.000Z')
    })
  })

  describe('mapProjectToDataverse', () => {
    it('maps project name when provided', () => {
      const input: UpdateProjectInput = {
        name: 'Factory Expansion Phase 2',
      }

      const result = mapProjectToDataverse(input)

      expect(result.cr809_projectname).toBe('Factory Expansion Phase 2')
    })

    it('maps project status Planning to 804270000', () => {
      const result = mapProjectToDataverse({ status: 'Planning' })
      expect(result.cr809_status).toBe(804270000)
    })

    it('maps project status InProgress to 804270001', () => {
      const result = mapProjectToDataverse({ status: 'InProgress' })
      expect(result.cr809_status).toBe(804270001)
    })

    it('maps project status OnHold to 804270002', () => {
      const result = mapProjectToDataverse({ status: 'OnHold' })
      expect(result.cr809_status).toBe(804270002)
    })

    it('maps project status Completed to 804270003', () => {
      const result = mapProjectToDataverse({ status: 'Completed' })
      expect(result.cr809_status).toBe(804270003)
    })

    it('maps project status Cancelled to 804270004', () => {
      const result = mapProjectToDataverse({ status: 'Cancelled' })
      expect(result.cr809_status).toBe(804270004)
    })

    it('converts project dates to ISO strings', () => {
      const input: UpdateProjectInput = {
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date('2025-12-31T23:59:59.000Z'),
      }

      const result = mapProjectToDataverse(input)

      expect(result.cr809_startdate).toBe('2025-01-01T00:00:00.000Z')
      expect(result.cr809_enddate).toBe('2025-12-31T23:59:59.000Z')
    })

    it('handles partial updates with only some fields', () => {
      const input: UpdateProjectInput = {
        status: 'InProgress',
        progress: 35,
      }

      const result = mapProjectToDataverse(input)

      expect(result.cr809_status).toBe(804270001)
      expect(result.cr809_progress).toBe(35)
      expect(result.cr809_projectname).toBeUndefined()
      expect(result.cr809_startdate).toBeUndefined()
      expect(result.cr809_enddate).toBeUndefined()
    })

    it('returns correct field names with cr809_ prefix', () => {
      const input: UpdateProjectInput = {
        name: 'Project',
        status: 'Planning',
        description: 'Test description',
      }

      const result = mapProjectToDataverse(input)

      expect(result).toHaveProperty('cr809_projectname')
      expect(result).toHaveProperty('cr809_status')
      expect(result).toHaveProperty('cr809_description')
    })
  })
})
