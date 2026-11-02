# Monivo

Shared expense app. Phase 1 provides the development foundation, Phase 2 the
interactive sample UI, and Phase 3 Google sign-in, profiles, and persistent groups
with invitations. Phase 4 adds persistent expenses, equal/custom splits, editing,
deletion, and group balances. Google sign-in and the Phase 3 phone flows have been
verified by the project owner. Real OAuth requires an Android development build.
Phase 5 adds partial/full payment records, recipient confirmation, rejection,
cancellation, payment history, and expense protection during settlement.
Phase 6 adds optional UPI IDs, recipient review, and an Android UPI-app handoff
with a manual payment-recording fallback.

See [Phase 6 scope and manual verification](docs/phase-6.md).

```text
apps/
  mobile/       React Native / Expo Router app
    src/
  api/          Node.js / Express API
    src/
packages/
  shared/       Shared validation schemas and API types
    src/
```

## Development

Use Node.js 24 LTS and pnpm 11.25.0 (pinned in package.json).
Run all commands below from the repository root.

```powershell
pnpm install
Copy-Item apps/api/.env.example apps/api/.env
docker compose up -d --wait
pnpm dev:api
```

Do not overwrite an existing .env file. The API reads apps/api/.env when launched
with the workspace scripts. It fails startup if configuration or the initial
database connection is invalid. Development binds to 127.0.0.1:3000 by default.

In a second terminal:

```powershell
pnpm dev:mobile
```

Scan the Expo QR code using a compatible Expo Go installation, or press `a` for
a configured Android emulator. Expo Go and the project's SDK must match. If Expo
Go does not support this SDK on your device, use an Expo development build. Native
Android builds require the Android SDK; local iOS builds require macOS.

The login screen offers an explicitly marked sample app that runs independently
with in-memory data. Configured Google sign-in uses the API for real groups.
For future physical-device API calls, localhost points to the phone; use your
computer's LAN address and configure API HOST/firewall accordingly. Never expose
MongoDB to the phone. No backend credentials belong in the mobile environment.

### API checks

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health/live
Invoke-RestMethod http://127.0.0.1:3000/health/ready
```

Liveness returns 200 while the process serves requests. Readiness (also available
at /health) returns 200 when Mongoose is connected and 503 when disconnected.
SIGINT/SIGTERM closes the HTTP listener and database connection, with a bounded
shutdown timeout. Real users, groups, and expenses use /api.

### Quality and build commands

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build:api
pnpm --filter @monivo/api start
```

Use `pnpm format` to apply formatting. Root development, test, typecheck, and API
build scripts first build the shared package. If editing shared runtime schemas,
restart the API via the root command to rebuild them. Mobile resolves shared
TypeScript source through the react-native export condition; Node uses compiled
ES modules and declarations. Keep one root pnpm-lock.yaml.

### Phase 1 verification

Verified locally: workspace type checks, lint, formatting, API tests and build,
compiled API startup against Docker MongoDB, health endpoints, invalid startup
configuration rejection, Android JavaScript export, Expo dependency checks, and
Expo Doctor (20/20 checks). Build exports are ignored by Git.

Still pending: opening the app on a physical Android device or emulator and
visually checking the starter screen. Android bundling is not a native-device
launch test. Graceful signal shutdown is implemented but has not been verified
on a Unix deployment host.

### Phase 2 mobile preview

- Groups, Balances, and Activity tabs, with group and expense detail screens.
- Sample group creation and expense entry with equal or custom-amount splits.
- User-recorded partial/full payment previews. Pending payments preserve balances;
  only the sample recipient can confirm receipt. No money is transferred.
- Empty states, route error handling, a loading fallback, and form validation.
- NativeWind 4 with neutral surfaces, ink headings, cobalt actions, and pastel
  blue, peach, lavender, and yellow accents inspired by https://vibrant.design/.
  Text, Button, and Input are adapted
  from React Native Reusables, with its license retained beside the components.
- TanStack Form handles sample expense form state. Phase 3 uses TanStack Query
  for real group/profile data and mutations.

Sample members are fictional fixtures, separate from the real registered accounts
used in Phase 3. Demo changes disappear on reload/restart. The
calculation helpers in src/demo are UI fixtures, not authoritative backend logic.
The fixed light palette is centralized in src/lib/colors.json and consumed by
tailwind.config.js and src/lib/theme.ts. The Reusables
CLI doctor expects its default CSS-variable theme and will flag this custom setup;
use TypeScript, Expo Doctor, and the runtime preview to validate it instead.

Use `pnpm --filter @monivo/mobile web` for the web preview, or
`pnpm --filter @monivo/mobile exec expo start --port 8092` to choose a free port.
NativeWind requires a Metro restart after Babel/Metro configuration changes;
restart with `pnpm dev:mobile --clear` when needed. New native dependencies require
a new development build if using a custom development client.

Verified in the browser preview: required expense fields, custom split total
validation, creating a sample expense and updating its group, incoming payment
confirmation, outgoing partial payment pending status, and empty group display.
Android bundle export, calculation tests, and Expo Doctor also pass. Actual Android
keyboard behavior, larger system font sizes, and native screen layout remain
device checks; browser validation does not replace them.

## Local MongoDB

Start Docker Desktop with Linux containers, then run from the repository root:

```sh
docker compose up -d --wait
docker compose ps
```

This starts MongoDB 8.0 and automatically initializes the single-node `rs0`
replica set for transaction support. The health check waits for a writable primary.
MongoDB is published only on this computer's loopback address and has no
authentication; this configuration is for local development only.

The API, running directly on your computer, uses the connection string
in `apps/api/.env.example`:

```text
mongodb://127.0.0.1:27017/monivo?replicaSet=rs0&directConnection=true
```

The replica set advertises `localhost` for this local setup. Containerized API
services would need a different connection configuration.

Stop MongoDB while preserving its data:

```sh
docker compose down
```

Data is stored in the named `monivo_mongodb_data` volume and survives container
recreation. Avoid `docker compose down -v` unless you intend to delete that data.
