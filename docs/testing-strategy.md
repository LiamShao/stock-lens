# テスト戦略

## 1. 目的

StockLens AI の Test は、Build が通ることだけでなく、Security Boundary、User Data Isolation、Database Constraint、非同期 Job の冪等性、AI Output と Evidence の追跡可能性を再現可能に証明します。Acceptance Criterion と Test Evidence は `specs/features/*/verification.md` と `specs/traceability.md` で結びます。

## 2. Test Pyramid

| Layer         | 主な対象                                                                     | Tool                                 | Database                    |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------ | --------------------------- |
| Unit          | Pure Rule、Config、Schema、Hasher、Token、Error Mapping、Repository Retry    | Jest / Vitest                        | Mock または不要             |
| Component     | Nest Controller/Guard、Fastify Cookie、OpenAPI Contract、React Component     | Jest、React Testing Library          | 原則 Mock                   |
| Integration   | HTTP Flow、Prisma Repository、Migration、Constraint、Transaction/Concurrency | Jest、Fastify Inject、Testcontainers | Suite ごとの隔離 PostgreSQL |
| E2E           | Browser Upload、Status Polling、View、Evidence Drawer、PDF Navigation        | Playwright                           | 隔離 Full Stack             |
| AI Evaluation | Schema、Evidence Coverage、Citation/Numeric Consistency、Unsupported Claim   | Repeatable Evaluation Script         | Golden Dataset              |

現時点では API Unit/Component と PostgreSQL Integration を実装済みです。Frontend E2E と AI Evaluation は対象 Feature 未実装のため未着手です。

## 3. PostgreSQL Integration Harness

`pnpm test:integration` は Testcontainers で `stocklens-postgres:16-pgvector` を起動し、空の `stocklens_test` Database に `prisma migrate deploy` を実行します。

- Shared Local Database や既存 User Data を使用しません。
- Suite 終了時に Container を停止し、Test Data 全体を破棄します。
- Migration が失敗した場合は Test を開始せず Fail します。
- CI は `docker/postgres` から同じ Image を Build してから Integration Test を実行します。
- Node 22 + Fastify Cookie の Dynamic Import を Jest で実行するため、Integration Script は `--experimental-vm-modules` を使用します。

現在の Integration Evidence:

- Authentication: Register、Duplicate、Login、Refresh Rotation、Reuse、Logout、Bearer Guard、Rate Limit、CORS
- Demo User: Create、Idempotent No-op、Password Rotation、Session Revoke
- Ownership: Cross-user Read/Create/Update/Delete、Composite FK、Parent/Child Soft Delete、Concurrent Create/Delete

## 4. Security Test Requirements

新しい Endpoint/Feature は該当する項目を追加します。

- Validation Error は統一 Error Format で Secret を返さない。
- Authentication Failure は Account 存在有無を Message で区別しない。
- Authorization Test は Owner と別 User の両方を用意し、Read/List/Create/Update/Delete を検証する。
- `ownerId` / `userId` は Request Body ではなく Authentication Context から取得する。
- Cookie Attribute、CORS、CSRF 前提、Rate Limit、Deleted User を検証する。
- Logger の実出力を Capture し、Password、Authorization、Cookie、Token が Redact されることを検証する。
- Upload は Extension、MIME、`%PDF-` Header、File Count、Size、Cross-user Object Access を検証する。
- Uploaded PDF 内の Prompt Injection Delimiter を Escape し、`role: user` / `trust: untrusted` の Context に固定する Unit Test を持つ。Provider 接続後に End-to-end Evaluation を追加する。

## 5. Async Job Tests

Phase 3 以降は各 Pipeline Step について次を必須にします。

- Status の開始/完了/Failure Timestamp と Failed Reason
- Retry 上限と Retryable/Non-retryable Error の分類
- 同じ Job を複数回実行しても Chunk、Finding、Evidence、Output が重複しないこと
- Crash 後の Resume または Manual Rerun
- Parent Resource が削除された場合の Fail-closed Behavior
- Queue と Database の一時的不整合からの収束

## 6. AI Evaluation

Phase 4 以降は少なくとも 5 Company、15 Public IR PDF の Golden Dataset を用意し、結果を JSON または Markdown で保存します。

- Schema Success Rate
- Evidence Coverage / Citation Accuracy
- Numeric Consistency
- Unsupported Claim Rate
- Missing Information Detection
- RAG Answer Citation Rate

Financial Metric の期待値は Deterministic Fixture から計算し、LLM の自由記述を正解値にしません。Provider、Model、Prompt Version、Schema Version を Evaluation Result に記録します。

## 7. Quality Gates

Local/CI の標準 Gate は次です。

```bash
pnpm format:check
pnpm spec:check
pnpm db:validate
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

新機能は Requirement ID、Acceptance Evidence、Test Result、Known Risk を Verification 文書に記録するまで `Verified` にしません。Blocked Criterion は削除せず、理由と解除条件を残します。
