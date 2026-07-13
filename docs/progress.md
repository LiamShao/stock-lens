# StockLens AI Progress

## 2026-07-10

### Completed

- Created `AGENTS.md` with project goals, engineering standards, security rules, AI pipeline constraints, evidence citation rules, development phases, and agent workflow.
- Added Docker-based local infrastructure for StockLens AI.
- Switched away from reusing the external `expense-postgres` container.
- Added a project-owned PostgreSQL service:
  - Container: `stocklens-postgres`
  - Image: `stocklens-postgres:16-pgvector`
  - Host port: `15433`
  - Database: `stocklens_ai`
  - User: `stocklens`
  - Data volume: `stocklens-ai_postgres-data`
- Persisted pgvector in the project PostgreSQL image using `docker/postgres/Dockerfile`.
- Added initial database script:
  - `docker/postgres/init/01-enable-pgvector.sql`
  - Runs `CREATE EXTENSION IF NOT EXISTS vector;` on first database initialization.
- Added Redis for BullMQ:
  - Container: `stocklens-redis`
  - Host port: `6379`
  - Volume: `stocklens-ai_redis-data`
- Added MinIO as local S3-compatible storage:
  - Container: `stocklens-minio`
  - API: `localhost:9000`
  - Console: `localhost:9001`
  - Volume: `stocklens-ai_minio-data`
- Added `.env.example` with local development connection strings.
- Added `docker/README.md` with local environment instructions.
- Added `.gitignore`.

### Verified

- `docker compose config` passes.
- `stocklens-postgres` is healthy.
- `stocklens_ai` is reachable.
- pgvector is enabled in `stocklens_ai`.
- pgvector version is `0.8.4`.
- Vector distance query works:
  - `SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance;`
- `stocklens-redis` is healthy.
- `stocklens-minio` is healthy.
- Local Node tooling exists:
  - Node.js `v23.9.0`
  - npm `10.9.2`
  - Corepack `0.31.0`
  - pnpm `10.5.2`

### Current Local Services

```text
PostgreSQL:   localhost:15433
Redis:        localhost:6379
MinIO API:    localhost:9000
MinIO Console localhost:9001
```

Primary local connection string:

```text
DATABASE_URL=postgresql://stocklens:stocklens-dev-password@localhost:15433/stocklens_ai?schema=public
```

Inside the Docker Compose network:

```text
DATABASE_URL=postgresql://stocklens:stocklens-dev-password@postgres:5432/stocklens_ai?schema=public
```

### Important Notes

- `docker compose down` removes containers but keeps named volumes.
- `docker compose down -v` deletes local database, Redis, and MinIO data.
- pgvector is now part of the project PostgreSQL image, so it survives container recreation.
- The old external `expense-postgres` container is no longer part of the StockLens setup.
- Node `v23.9.0` is available locally, but the project should document support around Node `>=22 <24` for better ecosystem stability.

### Next Step

Start Phase 1 engineering initialization:

1. Initialize pnpm monorepo.
2. Add root `package.json`, `pnpm-workspace.yaml`, and `turbo.json`.
3. Create app skeletons:
   - `apps/web`
   - `apps/api`
   - `apps/worker`
4. Create `packages/shared`.
5. Add strict TypeScript base config.
6. Add Prisma with PostgreSQL connection.
7. Add minimal health check endpoint.
8. Add ESLint, Prettier, and initial GitHub Actions workflow.

