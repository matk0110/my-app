/*!
 * React hook for Dataverse write operations (create, update, delete).
 * Provides type-safe mutations with error handling, loading states, and data refresh.
 */

import { useState, useCallback } from 'react';
import { Cr809_activitiesService } from '../generated/services/Cr809_activitiesService';
import { Cr809_assetsService } from '../generated/services/Cr809_assetsService';
import { Cr809_projectsService } from '../generated/services/Cr809_projectsService';
import type { Cr809_activities } from '../generated/models/Cr809_activitiesModel';
import type { Cr809_assets } from '../generated/models/Cr809_assetsModel';
import type { Cr809_projects } from '../generated/models/Cr809_projectsModel';
import {
  mapActivityToDataverse,
  mapAssetToDataverse,
  mapProjectToDataverse,
  type CreateActivityInput,
  type ActivityUpdateFields,
  type CreateAssetInput,
  type AssetUpdateFields,
  type ProjectUpdateFields,
} from './dataverseFieldMaps';

// ============================================================================
// TYPES
// ============================================================================

export interface MutationResult<T> {
  data?: T;
  error?: string;
  isLoading: boolean;
}

export interface DataverseMutations {
  // Activities
  createActivity: (record: CreateActivityInput) => Promise<MutationResult<Cr809_activities>>;
  updateActivity: (
    id: string,
    changes: ActivityUpdateFields
  ) => Promise<MutationResult<Cr809_activities>>;
  deleteActivity: (id: string) => Promise<MutationResult<void>>;

  // Assets
  createAsset: (record: CreateAssetInput) => Promise<MutationResult<Cr809_assets>>;
  updateAsset: (id: string, changes: AssetUpdateFields) => Promise<MutationResult<Cr809_assets>>;
  deleteAsset: (id: string) => Promise<MutationResult<void>>;

  // Projects
  updateProject: (
    id: string,
    changes: ProjectUpdateFields
  ) => Promise<MutationResult<Cr809_projects>>;

  // State
  isMutating: boolean;
  lastError: string | null;
}

interface UseDataverseMutationsOptions {
  onRefresh?: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useDataverseMutations(
  options: UseDataverseMutationsOptions = {}
): DataverseMutations {
  const { onRefresh } = options;
  const [isMutating, setIsMutating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // ========================================================================
  // ACTIVITIES
  // ========================================================================

  const createActivity = useCallback(
    async (record: CreateActivityInput): Promise<MutationResult<Cr809_activities>> => {
      setIsMutating(true);
      setLastError(null);

      try {
        const dataverseRecord = mapActivityToDataverse(record);
        const result = await Cr809_activitiesService.create(dataverseRecord);

        if (!result.success || !result.data) {
          const errorMsg =
            result.error?.message || 'Failed to create activity: Unknown error';
          setLastError(errorMsg);
          return { error: errorMsg, isLoading: false };
        }

        if (onRefresh) {
          onRefresh();
        }

        return { data: result.data, isLoading: false };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to create activity';
        setLastError(errorMsg);
        return { error: errorMsg, isLoading: false };
      } finally {
        setIsMutating(false);
      }
    },
    [onRefresh]
  );

  const updateActivity = useCallback(
    async (
      id: string,
      changes: ActivityUpdateFields
    ): Promise<MutationResult<Cr809_activities>> => {
      setIsMutating(true);
      setLastError(null);

      try {
        const dataverseChanges = mapActivityToDataverse(changes);
        const result = await Cr809_activitiesService.update(id, dataverseChanges);

        if (!result.success || !result.data) {
          const errorMsg =
            result.error?.message || 'Failed to update activity: Unknown error';
          setLastError(errorMsg);
          return { error: errorMsg, isLoading: false };
        }

        if (onRefresh) {
          onRefresh();
        }

        return { data: result.data, isLoading: false };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to update activity';
        setLastError(errorMsg);
        return { error: errorMsg, isLoading: false };
      } finally {
        setIsMutating(false);
      }
    },
    [onRefresh]
  );

  const deleteActivity = useCallback(
    async (id: string): Promise<MutationResult<void>> => {
      setIsMutating(true);
      setLastError(null);

      try {
        await Cr809_activitiesService.delete(id);

        if (onRefresh) {
          onRefresh();
        }

        return { isLoading: false };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to delete activity';
        setLastError(errorMsg);
        return { error: errorMsg, isLoading: false };
      } finally {
        setIsMutating(false);
      }
    },
    [onRefresh]
  );

  // ========================================================================
  // ASSETS
  // ========================================================================

  const createAsset = useCallback(
    async (record: CreateAssetInput): Promise<MutationResult<Cr809_assets>> => {
      setIsMutating(true);
      setLastError(null);

      try {
        const dataverseRecord = mapAssetToDataverse(record);
        const result = await Cr809_assetsService.create(dataverseRecord);

        if (!result.success || !result.data) {
          const errorMsg = result.error?.message || 'Failed to create asset: Unknown error';
          setLastError(errorMsg);
          return { error: errorMsg, isLoading: false };
        }

        if (onRefresh) {
          onRefresh();
        }

        return { data: result.data, isLoading: false };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to create asset';
        setLastError(errorMsg);
        return { error: errorMsg, isLoading: false };
      } finally {
        setIsMutating(false);
      }
    },
    [onRefresh]
  );

  const updateAsset = useCallback(
    async (id: string, changes: AssetUpdateFields): Promise<MutationResult<Cr809_assets>> => {
      setIsMutating(true);
      setLastError(null);

      try {
        const dataverseChanges = mapAssetToDataverse(changes);
        const result = await Cr809_assetsService.update(id, dataverseChanges);

        if (!result.success || !result.data) {
          const errorMsg = result.error?.message || 'Failed to update asset: Unknown error';
          setLastError(errorMsg);
          return { error: errorMsg, isLoading: false };
        }

        if (onRefresh) {
          onRefresh();
        }

        return { data: result.data, isLoading: false };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to update asset';
        setLastError(errorMsg);
        return { error: errorMsg, isLoading: false };
      } finally {
        setIsMutating(false);
      }
    },
    [onRefresh]
  );

  const deleteAsset = useCallback(
    async (id: string): Promise<MutationResult<void>> => {
      setIsMutating(true);
      setLastError(null);

      try {
        await Cr809_assetsService.delete(id);

        if (onRefresh) {
          onRefresh();
        }

        return { isLoading: false };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to delete asset';
        setLastError(errorMsg);
        return { error: errorMsg, isLoading: false };
      } finally {
        setIsMutating(false);
      }
    },
    [onRefresh]
  );

  // ========================================================================
  // PROJECTS
  // ========================================================================

  const updateProject = useCallback(
    async (id: string, changes: ProjectUpdateFields): Promise<MutationResult<Cr809_projects>> => {
      setIsMutating(true);
      setLastError(null);

      try {
        const dataverseChanges = mapProjectToDataverse(changes);
        const result = await Cr809_projectsService.update(id, dataverseChanges);

        if (!result.success || !result.data) {
          const errorMsg = result.error?.message || 'Failed to update project: Unknown error';
          setLastError(errorMsg);
          return { error: errorMsg, isLoading: false };
        }

        if (onRefresh) {
          onRefresh();
        }

        return { data: result.data, isLoading: false };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to update project';
        setLastError(errorMsg);
        return { error: errorMsg, isLoading: false };
      } finally {
        setIsMutating(false);
      }
    },
    [onRefresh]
  );

  // ========================================================================
  // RETURN
  // ========================================================================

  return {
    createActivity,
    updateActivity,
    deleteActivity,
    createAsset,
    updateAsset,
    deleteAsset,
    updateProject,
    isMutating,
    lastError,
  };
}
