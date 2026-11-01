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

The future API, running directly on your computer, can use the connection string
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
No mobile or API application code has been added.
