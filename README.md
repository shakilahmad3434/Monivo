# Monivo

Shared expense app. Phase 1 adds the development foundation only; accounts,
groups, expenses, payments, and product screens are not implemented yet.

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

The mobile starter screen is intentionally static. It does not yet call the API.
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
shutdown timeout. No expense data or user routes exist yet.

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
on a Unix deployment host. Phase 2 product UI has not started.

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
