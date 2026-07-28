# アーキテクチャ

## 1. 目的と境界

StockLens AI は、User がアップロードした公開 IR PDF を非同期に解析し、原文 Page まで追跡できる Evidence 付き Company Research View を生成する Monorepo です。投資助言、売買推奨、目標株価、実時間 Market Data は扱いません。

この文書は現在の実装と承認済みの Target Architecture を区別します。未実装 Component を完成済みとして扱いません。

## 2. System Context

```text
Browser
  │ HTTPS / JSON / PDF upload
  ▼
Next.js Web ─────► NestJS + Fastify API ─────► PostgreSQL + pgvector
                           │                  ├► Private Object Storage
                           │ BullMQ           └► Redis
                           ▼
                     Independent Worker ─────► LLM / Embedding Provider
```

- `apps/web`: UI、TanStack Query、Form Validation、Evidence Drawer、PDF Page Navigation を担当します。現時点では Skeleton です。
- `apps/api`: HTTP、Authentication、Analysis Management、Authorization Boundary、Validation、OpenAPI、Job Enqueue を担当します。Controller は Prisma を直接呼びません。
- `apps/worker`: PDF Parse、Chunking、Embedding、Structured Extraction、Evidence Validation、View Generation を担当する予定です。現時点の Core Pipeline は未実装です。
- PostgreSQL: Transactional Data、Owner Scope、JSONB Output、Full Text Search、pgvector を一つの整合性境界で管理します。
- Redis/BullMQ: Retry 可能で冪等な非同期 Step を実行します。
- Object Storage: PDF を Private Bucket に保存し、短命 Presigned URL だけを発行する予定です。

## 3. Repository Architecture

```text
apps/       deployable applications
packages/   shared schema, types, UI, config, data tooling
prisma/     schema and append-only migrations
specs/      approved behavior, plan, tasks, verification, deviations
docs/       cross-cutting design and operational documentation
docker/     local infrastructure images and initialization
infra/      AWS/Terraform target; not implemented yet
```

Feature Delivery は `Spec → Technical Plan → Tasks → Code/Test → Verification` の順で進めます。Behavior、Security、Schema、API を変更する実装は Approved Spec に Requirement ID がない状態で開始しません。

## 4. API Layering

```text
Controller / Guard
  │ validated DTO + authenticated user
  ▼
Service
  │ business command/query
  ▼
Owner-scoped Repository
  │ Prisma transaction
  ▼
PostgreSQL constraint
```

- Controller は HTTP Status、Cookie、Header、OpenAPI、Input Validation だけを扱います。
- Service は Authentication、State Transition、Authorization Result、Failure Policy を扱います。
- Repository は `ownerId` / `userId` を必須 Query Condition とし、Cross-user と Not Found を区別しない Contract を返します。
- Database Constraint は Repository を迂回する Worker/Script に対する最後の Data Integrity Boundary です。
- `Analysis(ownerId, id)` と `Document(ownerId, analysisId)` は Composite FK で Owner Equality を強制します。Phase 3 以降の Child Entity にも同じ Pattern を適用します。

## 5. Authentication and Platform Boundary

- Password は Argon2id Hash のみ保存します。Unknown Email Login でも固定 Dummy Hash を Verify します。
- Access Token は短命 JWT で、Sign/Verify Algorithm は `HS256` に固定します。
- Refresh Token は Random Opaque Secret、DB には SHA-256 Hash のみを保存し、Rotation/Reuse Detection を行います。
- Refresh Cookie は `HttpOnly`、`SameSite=Strict`、Production `Secure` です。
- Credential CORS は設定済み Origin の完全一致だけを許可します。
- Request ID は 128 文字以内の限定文字種だけを受理し、それ以外は Server UUID に置換します。
- Structured Logger は Authorization、Cookie、Password、Token Field を Redact します。

## 6. Async Analysis Target

Analysis は Upload 前に `DRAFT` で作成し、最初の Document Finalize 後に `UPLOADED` へ遷移します。その後は `PARSING → CHUNKING → EMBEDDING → EXTRACTING → VALIDATING → COMPLETED` を基本経路とし、各 Step に専用 Failure Status を持ちます。

- Job は Idempotency Key を持ち、Retry で Chunk、Finding、Evidence、Output を重複作成しません。
- Page Text、Chunk、Page Number、検出可能な Section Metadata を保存します。
- Financial Calculation は Deterministic Code で行い、LLM に委譲しません。
- LLM Output は Versioned Prompt と Zod Schema で検証します。
- 重要 Finding は `Document → Page → Chunk → Excerpt` の Evidence を必須とします。
- Uploaded Text は命令ではなく Untrusted Data として明確に Delimit します。

S3-compatible Object Storage Interface と MinIO/AWS Adapter は `@stocklens/object-storage` に実装済みです。Upload API、Cleanup Queue と、この Adapter を接続する Pipeline は未実装です。PDF Upload Spec と Technical Plan に従って段階実装します。

## 7. Deployment Target

Target は AWS-oriented Architecture です。Web/API/Worker を独立 Deployable Unit とし、Managed PostgreSQL、Redis、Private S3、Secrets Manager、Centralized JSON Logs を利用します。Terraform と具体的な Network/Scaling/Backup Design は Phase 7 まで未実装です。

## 8. 現在の既知 Gap

- Analysis HTTP API の Cross-user Authorization は検証済みです。Document HTTP API は PDF Upload Feature まで未実装です。
- Object Storage Adapter は実装済みですが、PDF Upload API、Cleanup Queue、Parsing、LLM/RAG、Evidence UI は未実装です。
- Rate Limit Store は Process Local であり、Multi-instance 前に Redis-backed Store が必要です。
- Required ADR、AI Pipeline、Evidence、Evaluation、Deployment の詳細文書は段階的に追加します。
