# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

It is preconfigured to work with Power Apps Code Apps.

## Syncfusion License Setup

This project reads the Syncfusion license key from `VITE_SYNCFUSION_LICENSE_KEY` and registers it at startup in `src/main.tsx`.

Use a local-only env file:

```env
VITE_SYNCFUSION_LICENSE_KEY="your-key-here"
```

Store this in `my-app/.env.local` (already ignored by `.gitignore` via `*.local`).

## Next Step: Connect to Dataverse

For Power Apps code apps, use PAC CLI to add Dataverse tables as data sources. This generates typed models/services under `generated/`.

1. Sign in and select the target environment:

```powershell
pac auth create
pac auth list
pac auth select --index <number>
```

2. Add your Dataverse task table and dependency table:

```powershell
pac code add-data-source -a dataverse -t <task-table-logical-name>
pac code add-data-source -a dataverse -t <dependency-table-logical-name>
```

3. Use generated services in app code (example shape):

```ts
import { <TaskTable>Service } from './generated/services/<TaskTable>Service'

const result = await <TaskTable>Service.getAll({
  select: ['<id>', '<name>', '<start>', '<end>', '<progress>', '<predecessor>'],
  top: 500,
})
```

4. Map generated records into Gantt fields (`TaskID`, `TaskName`, `StartDate`, `EndDate`, `Progress`, `Predecessor`) and pass to `GanttComponent`.

Reference: `https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-dataverse`

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
