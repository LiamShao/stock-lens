# StockLens AI

StockLens AI is an AI-assisted research application for Japanese public company
IR PDFs. It is designed to produce structured analysis with page-level evidence
and does not provide investment advice, buy/sell recommendations, or target
prices.

## Repository structure

```text
apps/
  api/       NestJS API using the Fastify adapter
  web/       Next.js web application
  worker/    Independent BullMQ worker
packages/
  config/         Shared TypeScript configuration
  database/       Prisma tooling package
  eslint-config/  Shared ESLint flat configuration
  shared/         Shared Zod schemas and TypeScript types
  ui/             Shared React components
prisma/            Prisma schema
docker/            Local infrastructure assets
docs/              Project documentation and progress
```

## Requirements

- Node.js `>=22 <24`
- pnpm `>=10 <11`
- Docker with Docker Compose

## Local setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm dev
```

Services run on these default ports:

- Web: `http://localhost:3000`
- API liveness: `http://localhost:3001/api/health/live`
- API documentation: `http://localhost:3001/api/docs`
- PostgreSQL: `localhost:15433`
- Redis: `localhost:6379`
- MinIO API: `localhost:9000`
- MinIO console: `localhost:9001`

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:validate
```

The Prisma schema intentionally contains no domain models yet. Models and the
first migration will be added after the database design is reviewed in Phase 2.

See [AGENTS.md](./AGENTS.md) for product constraints and engineering standards,
and [docs/progress.md](./docs/progress.md) for the current implementation status.
