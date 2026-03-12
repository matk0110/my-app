# Project Context

- **Owner:** Matthew
- **Project:** Power Apps Gantt Chart — project management app with hierarchical task visualization (Projects → Assets → Activities), Dataverse backend, Syncfusion Gantt UI, and analytics dashboard.
- **Stack:** React 19, TypeScript 5.9, Vite 7, Syncfusion EJ2 Gantt, Microsoft Power Apps SDK, Dataverse
- **Created:** 2026-03-11

## Learnings

- ✅ **Test utilities extracted (Hockney setup):** Pure logic has been moved to `src/utils/` (`buildTaskData.ts`, `dashboardCalcs.ts`, `detailPanelHelpers.ts`). When modifying Dashboard or App components, import from these utils for shared logic—this enables independent testing and reduces component complexity.

