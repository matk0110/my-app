import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDataverseMutations } from './useDataverseMutations'
import { Cr809_activitiesService } from '../generated/services/Cr809_activitiesService'
import { Cr809_assetsService } from '../generated/services/Cr809_assetsService'
import { Cr809_projectsService } from '../generated/services/Cr809_projectsService'

// ── Mock the services ───────────────────────────────────────────────

vi.mock('../generated/services/Cr809_activitiesService', () => ({
  Cr809_activitiesService: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../generated/services/Cr809_assetsService', () => ({
  Cr809_assetsService: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../generated/services/Cr809_projectsService', () => ({
  Cr809_projectsService: {
    update: vi.fn(),
  },
}))

// ── Tests ───────────────────────────────────────────────────────────

describe('useDataverseMutations', () => {
  const mockOnRefresh = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all expected functions and state properties', () => {
    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    expect(result.current).toHaveProperty('createActivity')
    expect(result.current).toHaveProperty('updateActivity')
    expect(result.current).toHaveProperty('deleteActivity')
    expect(result.current).toHaveProperty('createAsset')
    expect(result.current).toHaveProperty('updateAsset')
    expect(result.current).toHaveProperty('deleteAsset')
    expect(result.current).toHaveProperty('updateProject')
    expect(result.current).toHaveProperty('isMutating')
    expect(result.current).toHaveProperty('lastError')
  })

  it('isMutating starts as false', () => {
    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    expect(result.current.isMutating).toBe(false)
  })

  it('lastError starts as null', () => {
    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    expect(result.current.lastError).toBeNull()
  })

  it('createActivity calls the service with mapped fields', async () => {
    vi.mocked(Cr809_activitiesService.create).mockResolvedValue({
      success: true,
      data: { cr809_activityid: 'activity-123' } as any,
    })

    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    const input = {
      name: 'Install Plumbing',
      status: 'NotStarted' as const,
    }

    await result.current.createActivity(input)

    expect(Cr809_activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cr809_activityname: 'Install Plumbing',
        cr809_status: 804270000,
      })
    )
  })

  it('updateActivity calls update with partial mapped fields', async () => {
    vi.mocked(Cr809_activitiesService.update).mockResolvedValue({
      success: true,
      data: { cr809_activityid: 'activity-123' } as any,
    })

    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    const changes = { name: 'Updated Name', status: 'InProgress' as const }

    await result.current.updateActivity('activity-123', changes)

    expect(Cr809_activitiesService.update).toHaveBeenCalledWith(
      'activity-123',
      expect.objectContaining({
        cr809_activityname: 'Updated Name',
        cr809_status: 804270001,
      })
    )
  })

  it('deleteActivity calls delete with correct ID', async () => {
    vi.mocked(Cr809_activitiesService.delete).mockResolvedValue(undefined)

    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    await result.current.deleteActivity('activity-456')

    expect(Cr809_activitiesService.delete).toHaveBeenCalledWith('activity-456')
  })

  it('successful mutation calls onRefresh callback', async () => {
    vi.mocked(Cr809_activitiesService.create).mockResolvedValue({
      success: true,
      data: { cr809_activityid: 'new-activity' } as any,
    })

    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    await result.current.createActivity({
      name: 'Test',
      status: 'NotStarted',
    })

    await waitFor(() => {
      expect(mockOnRefresh).toHaveBeenCalledTimes(1)
    })
  })

  it('failed mutation sets lastError with user-friendly message', async () => {
    vi.mocked(Cr809_activitiesService.create).mockResolvedValue({
      success: false,
      error: { message: 'Network error' },
    } as any)

    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    const mutationResult = await result.current.createActivity({
      name: 'Test',
      status: 'NotStarted',
    })

    await waitFor(() => {
      expect(result.current.lastError).toBe('Network error')
      expect(mutationResult.error).toBe('Network error')
    })
  })

  it('isMutating is true during async operation and false after', async () => {
    let resolveCreate: any
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve
    })

    vi.mocked(Cr809_activitiesService.create).mockReturnValue(createPromise as any)

    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    const mutationPromise = result.current.createActivity({
      name: 'Test',
      status: 'NotStarted',
    })

    // isMutating should be true during operation
    await waitFor(() => {
      expect(result.current.isMutating).toBe(true)
    })

    // Resolve the promise
    resolveCreate({ success: true, data: {} })
    await mutationPromise

    // isMutating should be false after completion
    await waitFor(() => {
      expect(result.current.isMutating).toBe(false)
    })
  })

  it('error in service call does not throw and returns error in result', async () => {
    const testError = new Error('Network failure')
    vi.mocked(Cr809_assetsService.create).mockRejectedValue(testError)

    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    const mutationResult = await result.current.createAsset({
      name: 'Asset',
      assetType: 'Equipment',
      status: 'Active',
    })

    expect(mutationResult.error).toBe('Network failure')
    expect(mockOnRefresh).not.toHaveBeenCalled()
  })

  it('updateProject calls project service with mapped fields', async () => {
    vi.mocked(Cr809_projectsService.update).mockResolvedValue({
      success: true,
      data: { cr809_projectid: 'proj-789' } as any,
    })

    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    await result.current.updateProject('proj-789', {
      name: 'Updated Project',
      status: 'InProgress',
    })

    expect(Cr809_projectsService.update).toHaveBeenCalledWith(
      'proj-789',
      expect.objectContaining({
        cr809_projectname: 'Updated Project',
        cr809_status: 804270001,
      })
    )
  })

  it('createAsset calls asset service with mapped fields', async () => {
    vi.mocked(Cr809_assetsService.create).mockResolvedValue({
      success: true,
      data: { cr809_assetid: 'asset-999' } as any,
    })

    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    const input = {
      name: 'Bulldozer',
      assetType: 'Equipment' as const,
      status: 'Active' as const,
    }

    await result.current.createAsset(input)

    expect(Cr809_assetsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cr809_assetname: 'Bulldozer',
        cr809_assettype: 804270000,
        cr809_status: 804270000,
      })
    )
  })

  it('deleteAsset calls delete and triggers refresh', async () => {
    vi.mocked(Cr809_assetsService.delete).mockResolvedValue(undefined)

    const { result } = renderHook(() => useDataverseMutations({ onRefresh: mockOnRefresh }))

    const mutationResult = await result.current.deleteAsset('asset-to-delete')

    expect(Cr809_assetsService.delete).toHaveBeenCalledWith('asset-to-delete')
    expect(mutationResult.error).toBeUndefined()
    await waitFor(() => {
      expect(mockOnRefresh).toHaveBeenCalledTimes(1)
    })
  })
})
