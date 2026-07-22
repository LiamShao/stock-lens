# StockLens AI

StockLens AI は、日本の上場企業が公開する IR PDF を対象とした AI 支援型の企業調査アプリケーションです。ページ単位の根拠を伴う構造化分析を提供しますが、投資助言、売買推奨、目標株価は提供しません。

## リポジトリ構成

```text
apps/
  api/       Fastify アダプターを使用する NestJS API
  web/       Next.js Web アプリケーション
  worker/    独立した BullMQ Worker
packages/
  config/         共通 TypeScript 設定
  database/       Prisma データアクセスパッケージ
  eslint-config/  共通 ESLint Flat Config
  shared/         共通 Zod スキーマと TypeScript 型
  ui/             共通 React コンポーネント
prisma/            Prisma スキーマ
docker/            ローカルインフラストラクチャ
docs/              プロジェクト文書と進捗記録
```

## 必要環境

- Node.js `>=22 <24`
- pnpm `>=10 <11`
- Docker および Docker Compose

## ローカルセットアップ

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate:deploy
pnpm db:generate
pnpm demo:user:provision
pnpm dev
```

`demo:user:provision` は `.env` の `DEMO_USER_*` を検証し、Demo User を冪等に作成または更新します。通常 User と同じ Email が存在する場合や、対象 Demo User が Soft Delete 済みの場合は上書きしません。この Command は API 起動時には自動実行されません。

各サービスはデフォルトで次のポートを使用します。

- Web: `http://localhost:3000`
- API Liveness: `http://localhost:3001/api/health/live`
- API ドキュメント: `http://localhost:3001/api/docs`
- PostgreSQL: `localhost:15433`
- Redis: `localhost:6379`
- MinIO API: `localhost:9000`
- MinIO Console: `localhost:9001`

## 品質チェック

```bash
pnpm format:check
pnpm spec:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm db:validate
```

`test:integration` は Docker/Testcontainers で隔離した `stocklens-postgres:16-pgvector` を起動し、空 Database に全 Migration を適用します。共有 Local PostgreSQL や既存 Data は変更しません。Image が未 Build の場合は先に `docker compose build postgres` を実行してください。

Prisma Schema と Migration には、User、Analysis、Document、Evidence、Job などの Domain Model を定義しています。論理設計と Ownership Rule は [docs/database-design.md](./docs/database-design.md) を参照してください。

Feature Development は Spec-Driven Development で進めます。SDD Workflow、Feature Spec、Requirement Traceability、Deviation は [specs/README.md](./specs/README.md) を参照してください。既存実装から Backfill した Authentication/Demo User Spec は承認・検証済みで、Ownership は未実装 HTTP API の Criterion を明示して `Partial` としています。

Cross-cutting Design は [docs/architecture.md](./docs/architecture.md)、Test Layer と CI Gate は [docs/testing-strategy.md](./docs/testing-strategy.md) を参照してください。

Schema を変更して Development Migration を作成する場合は、Local PostgreSQL を起動してから次を実行します。

```bash
pnpm db:migrate:dev
```

既存 Migration の適用だけを行う Environment では `pnpm db:migrate:deploy` を使用します。

現在の実装状況は [docs/progress.md](./docs/progress.md) を参照してください。
