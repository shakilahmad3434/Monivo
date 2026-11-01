# Monivo

pnpm workspace skeleton. Application code and dependencies have not been added.

```text
apps/
  mobile/       React Native / Expo app (to be initialized)
    src/
  api/          Node.js / Express API (to be initialized)
    src/
packages/
  shared/       Shared validation schemas and API types (to be added)
    src/
```

Use pnpm 11.25.0, as pinned in the root package.json. Run `pnpm install`
from the repository root to install workspace dependencies when they are added.

Each workspace currently contains only a private package manifest and an empty
source folder. Development scripts, framework configuration, and shared package
exports will be added when the corresponding workspace is initialized.
