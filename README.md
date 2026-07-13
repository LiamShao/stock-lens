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
pnpm db:generate
pnpm dev
```

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
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:validate
```

現在の Prisma スキーマには、意図的にドメインモデルを定義していません。Phase 2 のデータベース設計レビュー後にモデルと最初の Migration を追加します。

プロダクト制約とエンジニアリング規約は [AGENTS.md](./AGENTS.md)、現在の実装状況は [docs/progress.md](./docs/progress.md) を参照してください。
