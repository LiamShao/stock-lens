# Docker Development Environment

This setup starts a project-owned PostgreSQL container with pgvector installed in the image.

The database container is independent from any other local PostgreSQL container, such as `expense-postgres`.

## Services Managed Here

`compose.yaml` starts the local services StockLens AI needs for development:

- PostgreSQL 16 with pgvector
- Redis for BullMQ queues
- MinIO as local S3-compatible object storage for uploaded PDFs

## PostgreSQL and pgvector

PostgreSQL is built from:

```text
docker/postgres/Dockerfile
```

The image installs `postgresql-16-pgvector`, so pgvector survives `docker compose down` and future container recreation.

On first database initialization, this script enables the extension in `stocklens_ai`:

```text
docker/postgres/init/01-enable-pgvector.sql
```

Database data is persisted in the Docker volume:

```text
stocklens-ai_postgres-data
```

`docker compose down` removes containers but keeps this volume. `docker compose down -v` removes the volume and deletes the local database data.

## Start

```bash
docker compose up -d
```

## Stop

```bash
docker compose down
```

## Environment

Copy the example file:

```bash
cp .env.example .env
```

When the API or worker runs directly on the host, use:

```text
DATABASE_URL=postgresql://stocklens:stocklens-dev-password@localhost:15433/stocklens_ai?schema=public
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
```

When the API or worker later runs inside this Docker Compose network, use:

```text
DATABASE_URL=postgresql://stocklens:stocklens-dev-password@postgres:5432/stocklens_ai?schema=public
REDIS_URL=redis://redis:6379
S3_ENDPOINT=http://minio:9000
```

Adjust the PostgreSQL username, password, and database name through `.env` if needed.

## Ports

```text
Redis:        localhost:6379
MinIO API:    localhost:9000
MinIO Console localhost:9001
PostgreSQL:   localhost:15433
```

## Notes

- The initial MinIO bucket will be created later by application bootstrap, migration scripts, or a dedicated setup command.
- Redis and MinIO data are stored in Docker volumes: `stocklens-ai_redis-data` and `stocklens-ai_minio-data`.
- PostgreSQL data is stored in Docker volume: `stocklens-ai_postgres-data`.
