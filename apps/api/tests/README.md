# API tests

- `unit/`: isolated logic, currently environment validation.
- `integration/`: Express HTTP behavior through Supertest. Current health tests
  simulate database connectivity; they do not connect to MongoDB.

From the repository root, run `pnpm test` to build shared code and run all API
tests. After building shared code, run a category individually:

```sh
pnpm --filter @monivo/api test:unit
pnpm --filter @monivo/api test:integration
```

Tests are type-checked but excluded from the production API build. Add backend
E2E tests when complete running-service flows exist. Mobile E2E tests will belong
to the mobile workspace rather than this folder.
