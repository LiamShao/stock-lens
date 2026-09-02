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
  object-storage/ AWS S3 / MinIO 共通 Private Object Storage Adapter
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
docker compose up -d --wait
docker exec stocklens-minio mc alias set local http://127.0.0.1:9000 stocklens stocklens-dev-password
docker exec stocklens-minio mc mb --ignore-existing local/stocklens-dev
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

Web は `NEXT_PUBLIC_API_BASE_URL`（Local Default は `http://localhost:3001/api`）へ接続します。Access Token は Browser Memory だけに保持し、Reload 時は API の `HttpOnly` Refresh Cookie を Rotate して Session を回復します。Registration は `/register`、Login は `/login`、Owner-scoped Analysis History は `/analyses`、新規作成は `/analyses/new`、PDF Intake は `/analyses/:analysisId/intake`、Detail は `/analyses/:analysisId` です。

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

`test:integration` は最初に `docker/postgres` から `stocklens-postgres:16-pgvector` を自動 Build または Docker Layer Cache から再 Tag し、その後 Testcontainers で隔離 Database を起動して空 Database に全 Migration を適用します。共有 Local PostgreSQL や既存 Data は変更せず、事前の手動 Image Build も不要です。

Structured Extraction Prompt は Git 管理 Asset から明示的に登録します。Worker 起動時の暗黙 Mutation はありません。Activation 時は `.env` で `ALLOW_PROMPT_ACTIVATION=true` を設定し、次のように Asset と Operator、Version を確認します。

```bash
pnpm prompt:activate -- \
  --asset prompts/structured-extraction/v1.json \
  --operator-id local-developer \
  --confirm structured-extraction@1
```

Structured Extraction の OpenAI Adapter は Worker だけで使用します。`OPENAI_API_KEY` と Structured Outputs 対応の `OPENAI_MODEL` を Environment / Secrets Manager から明示的に設定してください。Model は Repository に Hard-code せず、Request は Response Storage と全 Tool を無効化します。Live Provider Test は CI の必須条件ではなく、別の明示的 Opt-in Evaluation として扱います。

Live Smoke は `ALLOW_OPENAI_LIVE_EVALUATION=true` を追加で設定し、次を実行します。Responses API を 1 回呼び出すため Cost が発生します。Result は Content-free JSON だけを出力し、Passed Artifact がない状態は `Partial` と扱います。

```bash
pnpm openai:live-evaluation
pnpm openai:live-analysis-views
```

前者は Structured Extraction、後者は Analysis Views の Versioned Prompt/Structured Output を 1 Call で確認します。どちらも Prompt、Source、生成本文を含まない Content-free JSON だけを出力します。

Long Document の抽出は全 Chunk を stable order の bounded Map/Merge で処理します。Default は最大 2 Map + 1 Merge とし、Context/Estimated Token/Call Budget を超える場合は先頭だけを採用せず Stable Failure とします。PDF Text と Intermediate Candidate は Escaped Untrusted User Context に限定します。

Prisma Schema と Migration には、User、Analysis、Document、Evidence、Job などの Domain Model を定義しています。論理設計と Ownership Rule は [docs/database-design.md](./docs/database-design.md) を参照してください。

`@stocklens/object-storage` は AWS S3 と Local MinIO を共通 Interface で扱います。S3 Operation には `@aws-sdk/client-s3`、短命 Presigned PUT には `@aws-sdk/s3-request-presigner` のみを追加し、API/Worker から Provider 固有処理を分離しています。詳細は [packages/object-storage/README.md](./packages/object-storage/README.md) を参照してください。

PDF Upload は `DRAFT` Analysis に対して Session を作成し、Browser から MinIO/S3 の Private Bucket へ Presigned PUT した後、API の Finalize を呼ぶ二段階方式です。1 File は 1 byte〜20 MB、1 Analysis は Active Document と未期限 Session の合計 3 件までです。未 Finalize Session は 24 時間で期限切れとなり、Worker が起動時と 60 秒ごとに Cleanup を登録します。

Intake UI は最大 3 PDF の Extension、MIME、Size、`%PDF-` Header を早期確認し、Web Crypto SHA-256、Upload Start、Credential-free Presigned PUT、Finalize の順で処理します。Client 判定は UX Boundary であり、Finalize の Trusted Streaming Validation を置き換えません。Processing は Finalized Document を確認した User の明示操作でのみ開始します。

主要な Storage/Queue 環境変数は次のとおりです。

| Key                              | Host Local                   | Compose Network / AWS                         |
| -------------------------------- | ---------------------------- | --------------------------------------------- |
| `REDIS_URL`                      | `redis://localhost:6379`     | `redis://redis:6379` / Managed Redis endpoint |
| `S3_ENDPOINT`                    | `http://localhost:9000`      | `http://minio:9000` / AWS では省略            |
| `S3_BUCKET`                      | 事前作成した `stocklens-dev` | 事前作成した Private Bucket                   |
| `S3_FORCE_PATH_STYLE`            | `true`                       | MinIO は `true`、AWS は `false` または省略    |
| `S3_ACCESS_KEY_ID` / `SECRET...` | Local MinIO Credential       | AWS では省略し IAM Role を使用                |
| `S3_PRESIGN_EXPIRES_IN_SECONDS`  | `300`                        | 1〜300                                        |
| `WORKER_CONCURRENCY`             | `2`                          | 1 以上の整数                                  |

`.env.example` の Credential は Local Development 専用です。Production では Commit/転用せず、Private Bucket、Browser PUT CORS、API/Worker の最小権限 IAM を Deployment 側で設定します。

Feature Development は Spec-Driven Development で進めます。SDD Workflow、Feature Spec、Requirement Traceability、Deviation は [specs/README.md](./specs/README.md) を参照してください。Authentication、Demo User、Analysis Management、Ownership は承認・検証済みです。

Cross-cutting Design は [docs/architecture.md](./docs/architecture.md)、AI Runtime は [docs/ai-pipeline.md](./docs/ai-pipeline.md)、Citation Lineage は [docs/evidence-model.md](./docs/evidence-model.md)、評価方針は [docs/evaluation.md](./docs/evaluation.md)、Test Layer と CI Gate は [docs/testing-strategy.md](./docs/testing-strategy.md) を参照してください。

Schema を変更して Development Migration を作成する場合は、Local PostgreSQL を起動してから次を実行します。

```bash
pnpm db:migrate:dev
```

既存 Migration の適用だけを行う Environment では `pnpm db:migrate:deploy` を使用します。

現在の実装状況は [docs/progress.md](./docs/progress.md) を参照してください。
