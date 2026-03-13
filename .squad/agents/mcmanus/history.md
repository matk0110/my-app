# Project Context

- **Owner:** Matthew
- **Project:** Power Apps Gantt Chart — project management app with hierarchical task visualization (Projects → Assets → Activities), Dataverse backend, Syncfusion Gantt UI, and analytics dashboard.
- **Stack:** React 19, TypeScript 5.9, Vite 7, Syncfusion EJ2 Gantt, Microsoft Power Apps SDK, Dataverse
- **Created:** 2026-03-11

## Learnings

- ✅ **Test utilities extracted (Hockney setup):** Pure logic has been moved to `src/utils/` (`buildTaskData.ts`, `dashboardCalcs.ts`, `detailPanelHelpers.ts`). When modifying DetailPanel or data pipelines, import from these utils for shared logic—this enables independent testing and reduces component complexity.

- ✅ **Dataverse write service layer created (2026-03-12):** Built `src/services/useDataverseMutations.ts` and `src/services/dataverseFieldMaps.ts` to provide type-safe CRUD operations with error handling, loading states, and refresh callbacks. The hook accepts human-friendly input types (e.g., `{ name, startDate, status: 'InProgress' }`) and maps them to Dataverse field names and numeric codes. All mutations wrap the generated services (`Cr809_activitiesService`, `Cr809_assetsService`, `Cr809_projectsService`) and check `IOperationResult.success` before returning. Date objects are converted to ISO strings automatically. The pattern: App.tsx can now call `updateActivity(id, { startDate, endDate, progress })` instead of directly manipulating Dataverse field names.

