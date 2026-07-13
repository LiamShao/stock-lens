# StockLens AI 開発進捗

## 2026-07-13

### Phase 1 基盤

- Git リポジトリを初期化し、デフォルト Branch を `main` に設定しました。
- pnpm と Turborepo による Monorepo 構成を追加しました。
- Next.js、NestJS/Fastify、BullMQ Worker の初期アプリケーションを追加しました。
- 共通 TypeScript、ESLint、Zod Schema、Database Tooling、UI Package を追加しました。
- Prisma 6 の Tooling と、意図的に Model を持たない初期 Schema を追加しました。
- API Liveness Endpoint `/api/health/live` を追加しました。
- OpenAPI ドキュメント `/api/docs` を追加しました。
- API、Worker、Frontend の初期テストを追加しました。
- Format、Lint、Typecheck、Test、Build を実行する GitHub Actions Workflow をローカルに用意しました。GitHub Credential に Workflow 更新権限を設定するまでは、Git の追跡対象から除外しています。
- Root の開発用 README を追加しました。

### 意図的に延期している項目

- Domain Database Model と Migration は、Database Design のレビュー後に追加します。
- Phase 3 の Pipeline 実装までは、Worker が Analysis Job を明示的に失敗させます。
- Authentication、Object Storage Integration、Upload、Analysis API は Phase 2 で実装します。

### 検証済み

- Prisma Schema の検証と Client 生成が成功します。
- Format、Lint、TypeScript Strict Check、初期テスト 5 件がすべて成功します。
- Web、API、Worker、Internal Package の Production Build が成功します。
- 起動した API の `/api/health/live` が HTTP 200 を返し、構造化 JSON Log に Request ID が記録されます。

## 2026-07-10

### 完了

- プロジェクト目標、Engineering Standard、Security Rule、AI Pipeline 制約、Evidence Citation Rule、Development Phase、Agent Workflow を定義した `AGENTS.md` を作成しました。
- StockLens AI 用の Docker ベース Local Infrastructure を追加しました。
- 外部の `expense-postgres` Container を再利用しない構成に変更しました。
- プロジェクト専用 PostgreSQL Service を追加しました。
  - Container: `stocklens-postgres`
  - Image: `stocklens-postgres:16-pgvector`
  - Host Port: `15433`
  - Database: `stocklens_ai`
  - User: `stocklens`
  - Data Volume: `stocklens-ai_postgres-data`
- `docker/postgres/Dockerfile` を使用し、pgvector をプロジェクトの PostgreSQL Image に組み込みました。
- 初期 Database Script を追加しました。
  - `docker/postgres/init/01-enable-pgvector.sql`
  - Database の初回初期化時に `CREATE EXTENSION IF NOT EXISTS vector;` を実行します。
- BullMQ 用 Redis を追加しました。
  - Container: `stocklens-redis`
  - Host Port: `6379`
  - Volume: `stocklens-ai_redis-data`
- Local S3 Compatible Storage として MinIO を追加しました。
  - Container: `stocklens-minio`
  - API: `localhost:9000`
  - Console: `localhost:9001`
  - Volume: `stocklens-ai_minio-data`
- Local Development 用 Connection String を含む `.env.example` を追加しました。
- Local Environment の手順を記載した `docker/README.md` を追加しました。
- `.gitignore` を追加しました。

### 検証済み

- `docker compose config` が成功します。
- `stocklens-postgres` が Healthy です。
- `stocklens_ai` に接続できます。
- `stocklens_ai` で pgvector が有効です。
- pgvector Version は `0.8.4` です。
- 次の Vector Distance Query が成功します。
  - `SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance;`
- `stocklens-redis` が Healthy です。
- `stocklens-minio` が Healthy です。
- Local Node Tooling が利用できます。
  - Node.js `v23.9.0`
  - npm `10.9.2`
  - Corepack `0.31.0`
  - pnpm `10.5.2`

### 現在のローカルサービス

```text
PostgreSQL:   localhost:15433
Redis:        localhost:6379
MinIO API:    localhost:9000
MinIO Console localhost:9001
```

ホスト上で使用する Connection String:

```text
DATABASE_URL=postgresql://stocklens:stocklens-dev-password@localhost:15433/stocklens_ai?schema=public
```

Docker Compose Network 内で使用する Connection String:

```text
DATABASE_URL=postgresql://stocklens:stocklens-dev-password@postgres:5432/stocklens_ai?schema=public
```

### 重要事項

- `docker compose down` は Container を削除しますが、Named Volume は保持します。
- `docker compose down -v` は Local Database、Redis、MinIO のデータを削除します。
- pgvector はプロジェクトの PostgreSQL Image に含まれているため、Container を再作成しても利用できます。
- 以前の外部 `expense-postgres` Container は StockLens の構成に含まれません。
- Local では Node `v23.9.0` を利用できますが、Ecosystem の安定性を考慮し、プロジェクトの対応範囲は Node `>=22 <24` とします。

### 当時の次のステップ

Phase 1 の Engineering Initialization を開始する計画でした。

1. pnpm Monorepo を初期化する。
2. Root の `package.json`、`pnpm-workspace.yaml`、`turbo.json` を追加する。
3. 次の Application Skeleton を作成する。
   - `apps/web`
   - `apps/api`
   - `apps/worker`
4. `packages/shared` を作成する。
5. TypeScript Strict の Base Config を追加する。
6. PostgreSQL Connection を使用する Prisma を追加する。
7. 最小限の Health Check Endpoint を追加する。
8. ESLint、Prettier、初期 GitHub Actions Workflow を追加する。
