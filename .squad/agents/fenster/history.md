# Project Context

- **Owner:** Matthew
- **Project:** Power Apps Gantt Chart — project management app with hierarchical task visualization (Projects → Assets → Activities), Dataverse backend, Syncfusion Gantt UI, and analytics dashboard.
- **Stack:** React 19, TypeScript 5.9, Vite 7, Syncfusion EJ2 Gantt, Microsoft Power Apps SDK, Dataverse
- **Created:** 2026-03-11

## Learnings

- ✅ **Test utilities extracted (Hockney setup):** Pure logic has been moved to `src/utils/` (`buildTaskData.ts`, `dashboardCalcs.ts`, `detailPanelHelpers.ts`). When modifying Dashboard or App components, import from these utils for shared logic—this enables independent testing and reduces component complexity.

- ✅ **Gantt inline editing wired to Dataverse mutations (2026-03-11):** App.tsx now uses `useDataverseMutations` hook for all write operations. `handleActionComplete` handles save/delete for all entity types (Project, Asset, Activity). `cascadeActivityDates` uses mutation hook for error handling and refresh. User feedback shows saving state (`isMutating`) and errors (`lastError`). Columns are now editable: TaskName, StartDate (datepicker), EndDate (datepicker), Progress, Status. Entity-type-specific save logic routes to correct mutation based on `TaskRecord.ItemType`.

- ✅ **DetailPanel edit mode implemented (2026-03-11):** DetailPanel.tsx now supports full CRUD operations. Added Edit/Save/Cancel buttons in panel header with sticky positioning. All editable fields render as inputs (text, date, number, textarea, select, checkbox) in edit mode based on entity type. Project, Asset, and Activity each have their own field sets with proper status dropdowns (Planning/InProgress/etc). Delete button in footer for Activities and Assets (Projects excluded for safety). Integrated with `useDataverseMutations` hook for save/delete operations with loading states and error display. Form values initialized from raw Dataverse records when entering edit mode. Updated App.tsx to pass `onRefresh` callback for data refresh after mutations. Added comprehensive CSS for edit controls (`.dp-input`, `.dp-textarea`, `.dp-action-btn` variants, `.dp-header-actions`, `.dp-footer-actions`, `.dp-error-banner`) to App.css. Tests updated to include new `onRefresh` prop requirement.
