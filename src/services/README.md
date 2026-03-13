# Dataverse Mutations Hook - Usage Guide

## Quick Start

```typescript
import { useDataverseMutations } from './services/useDataverseMutations';

function MyComponent() {
  const mutations = useDataverseMutations({
    onRefresh: () => loadData() // Called after successful mutations
  });

  async function handleSave() {
    const result = await mutations.updateActivity(activityId, {
      startDate: new Date('2026-03-15'),
      endDate: new Date('2026-03-20'),
      progress: 75,
      status: 'InProgress', // Human-friendly enum, not numeric code
    });

    if (result.error) {
      alert(result.error);
    }
    // On success, onRefresh() was already called
  }

  return (
    <button onClick={handleSave} disabled={mutations.isMutating}>
      Save Changes
    </button>
  );
}
```

## Available Mutations

### Activities
- `createActivity(record)` - Create new activity
- `updateActivity(id, changes)` - Update activity fields
- `deleteActivity(id)` - Delete activity

### Assets
- `createAsset(record)` - Create new asset
- `updateAsset(id, changes)` - Update asset fields
- `deleteAsset(id)` - Delete asset

### Projects
- `updateProject(id, changes)` - Update project fields (no create/delete for projects)

## Status Enums

Import from `dataverseFieldMaps.ts`:

```typescript
import { ActivityStatus, AssetStatus, ProjectStatus } from './services/dataverseFieldMaps';

// Activity statuses
status: 'NotStarted' | 'InProgress' | 'Completed' | 'Blocked'

// Asset statuses
status: 'Active' | 'Inactive' | 'Retired' | 'Maintenance'

// Project statuses
status: 'Planning' | 'InProgress' | 'OnHold' | 'Completed' | 'Cancelled'
```

## Date Handling

Pass `Date` objects, not strings. The hook converts them to ISO format automatically:

```typescript
updateActivity(id, {
  startDate: new Date('2026-03-15'), // ✅
  endDate: new Date(2026, 2, 20),    // ✅
})
```

## Error Handling

All mutations return `Promise<MutationResult<T>>`:

```typescript
interface MutationResult<T> {
  data?: T;          // Returned Dataverse record on success
  error?: string;    // Error message on failure
  isLoading: boolean; // Always false (mutation completed)
}
```

Check `result.error` to determine success:

```typescript
const result = await mutations.updateActivity(id, changes);
if (result.error) {
  console.error('Mutation failed:', result.error);
} else {
  console.log('Success:', result.data);
}
```

## Global State

The hook provides two state values:

- `isMutating: boolean` - True while ANY mutation is in progress
- `lastError: string | null` - Last error from any mutation

Use these for global UI feedback (e.g., showing a loading spinner or error toast).

## Migrating Existing Code

### Before (direct service calls, no error handling):
```typescript
await Cr809_activitiesService.update(activity.SourceId, {
  cr809_startdate: toDataverseDate(activity.StartDate),
  cr809_enddate: toDataverseDate(activity.EndDate),
  cr809_progress: activity.Progress,
});
```

### After (type-safe, with error handling):
```typescript
const result = await mutations.updateActivity(activity.SourceId, {
  startDate: activity.StartDate,
  endDate: activity.EndDate,
  progress: activity.Progress,
});

if (result.error) {
  showErrorToast(result.error);
}
```

## Linking Records

To link an Activity to an Asset, pass `assetId`:

```typescript
createActivity({
  name: 'Install Equipment',
  status: 'NotStarted',
  assetId: '12345-67890', // Links to cr809_assets(12345-67890)
});
```

To link an Asset to a Project, pass `projectId`:

```typescript
createAsset({
  name: 'Server Rack',
  assetType: 'Equipment',
  status: 'Active',
  projectId: '98765-43210', // Links to cr809_projects(98765-43210)
});
```
