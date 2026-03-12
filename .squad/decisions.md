# Squad Decisions

## Active Decisions

### Test Infrastructure (Vitest)
**Author:** Hockney  
**Date:** 2025-07-17  
**Status:** ACTIVE

**Decision:** Adopted **Vitest** as the test framework with `@testing-library/react` for component tests and `jsdom` for DOM simulation. Config lives in `vitest.config.ts` (separate from vite.config.ts to avoid loading powerApps plugin in tests).

**Key Choices:**
1. **Pure logic extracted to `src/utils/`** — `buildTaskData.ts`, `dashboardCalcs.ts`, `detailPanelHelpers.ts` — for testable data pipelines
2. **App.tsx imports from utils** — no code duplication; extraction improves both testability and architecture
3. **Test files adjacent to source** — `*.test.ts` / `*.test.tsx` co-located with tested file
4. **Test scripts:** `npm test` (single), `npm run test:watch` (watch mode)

**Impact & Guidance:**
- **McManus/Fenster:** When adding logic to Dashboard/DetailPanel/App, keep pure computation in `src/utils/` files
- **All agents:** Run `npm test` before closing work
- **Testing pattern:** Pure functions testable independently; React components tested with @testing-library/react
- **Timezone gotcha:** Date assertions must use UTC methods (`getUTCDate()`) or local constructors—never `new Date('...T00:00:00.000Z')` with `.getDate()` (env is non-UTC)

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
