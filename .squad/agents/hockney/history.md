# Project Context

- **Owner:** Matthew
- **Project:** Power Apps Gantt Chart — project management app with hierarchical task visualization (Projects → Assets → Activities), Dataverse backend, Syncfusion Gantt UI, and analytics dashboard.
- **Stack:** React 19, TypeScript 5.9, Vite 7, Syncfusion EJ2 Gantt, Microsoft Power Apps SDK, Dataverse
- **Created:** 2026-03-11

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
- **Test framework:** Vitest + @testing-library/react + jsdom. Config lives in `vitest.config.ts` (separate from vite.config.ts to avoid loading powerApps plugin in tests). Run via `npm test` or `npm run test:watch`.
- **Extracted utility files for testability:** Pure logic extracted to `src/utils/buildTaskData.ts`, `src/utils/dashboardCalcs.ts`, and `src/utils/detailPanelHelpers.ts`. App.tsx now imports from these. This avoids testing component internals.
- **Test files live adjacent to source:** `*.test.ts` / `*.test.tsx` next to the file they test.
- **Timezone gotcha:** Date assertions must use UTC methods (`getUTCDate()`) or local `Date` constructors (`new Date(2025, 0, 1)`) — never `new Date('..T00:00:00.000Z')` with `.getDate()`. The test environment runs in a non-UTC timezone.
- **Dataverse model types** require many mandatory fields for construction — test factories (`makeProject`, `makeAsset`, `makeActivity`) use `as Cr809_X` casts with sensible defaults.
- **105 tests across 4 files** at initial setup: buildTaskData (41), dashboardCalcs (17), detailPanelHelpers (31), DetailPanel component (16).
