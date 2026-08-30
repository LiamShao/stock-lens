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

`pnpm test:integration` は `docker/postgres` から `stocklens-postgres:16-pgvector` を自動 Build/再 Tag してから Testcontainers で起動し、空の `stocklens_test` Database に `prisma migrate deploy` を実行します。Local Image Tag を事前条件としません。

- Shared Local Database や既存 User Data を使用しません。
- Suite 終了時に Container を停止し、Test Data 全体を破棄します。
- Migration が失敗した場合は Test を開始せず Fail します。
- Local と CI は同じ Root Command 内で `docker/postgres` から Image を準備し、Docker Layer Cache が利用可能なら再利用します。
- Node 22 + Fastify Cookie の Dynamic Import を Jest で実行するため、Integration Script は `--experimental-vm-modules` を使用します。

現在の Integration Evidence:

- Authentication: Register、Duplicate、Login、Refresh Rotation、Reuse、Logout、Bearer Guard、Rate Limit、CORS
- Demo User: Create、Idempotent No-op、Password Rotation、Session Revoke
- Ownership: Cross-user Read/Create/Update/Delete、Composite FK、Parent/Child Soft Delete、Concurrent Create/Delete
- PDF Upload: Start Validation、3 File Limit、Production S3 Adapter による Real MinIO Presigned PUT、Valid/Invalid Header Finalize、Bearer User A/B Start/Re-presign/Finalize/List/Delete、Real Redis/BullMQ Worker Cleanup
- Structured Extraction Audit: Fresh Migration、Real Prompt Activation CLI、Repeated/Concurrent Activation、Immutable Prompt、Content-free AI Usage、Cross-owner Usage Reject
- Provider Boundary: Deterministic Strict Fixture、OpenAI Responses Zod Format、No-tool/No-store、Output/Timeout Budget、Refusal/Incomplete/Malformed、HTTP/Connection Retry Classification、Secret-free Error
- Analysis Views Read: Completed-only Strict Aggregate、Owner A/B 404、Not-ready 409、Active FindingEvidence/Document/Page/Chunk Projection、OpenAPI

## 4. Security Test Requirements

新しい Endpoint/Feature は該当する項目を追加します。

- Validation Error は統一 Error Format で Secret を返さない。
- Authentication Failure は Account 存在有無を Message で区別しない。
- Authorization Test は Owner と別 User の両方を用意し、Read/List/Create/Update/Delete を検証する。
- `ownerId` / `userId` は Request Body ではなく Authentication Context から取得する。
- Cookie Attribute、CORS、CSRF 前提、Rate Limit、Deleted User を検証する。
- Logger の実出力を Capture し、Password、Authorization、Cookie、Token が Redact されることを検証する。
- Upload は Extension、MIME、`%PDF-` Header、File Count、Size、Cross-user Object Access を検証する。
- Uploaded PDF 内の Prompt Injection Delimiter を Escape し、`role: user` / `trust: untrusted` の Context に固定する Unit Test を持つ。Pure Map/Merge Orchestrator では System/User Separation、全 Chunk Coverage、No Silent Truncation、Map Candidate Re-escape、Call/Character/Estimated Token Limit を検証済みです。Durable Runtime 接続後に Golden/Live Evaluation を追加します。

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

Phase 4 P0 Metric Fixture は Revenue、Operating Profit、Net Income、Operating Cash Flow、Annual/Quarterly Period、円/千円/百万円/億円、連結/個別、Loss/Negative、Header Order、YoY、Zero Previous、Missing/Ambiguous/Conflict を Unit Test で固定します。

### OpenAI Live Structured Extraction Smoke

Production Adapter の Live Smoke は CI では実行せず、Operator が明示的に opt-in した場合だけ Responses API を 1 回呼び出します。`.env` に `OPENAI_API_KEY`、Structured Outputs 対応の `OPENAI_MODEL`、`ALLOW_OPENAI_LIVE_EVALUATION=true` を設定し、次を実行します。

```bash
pnpm openai:live-evaluation
```

Harness は Git-tracked Prompt と Production `OpenAiLlmProvider` を使用し、Strict Schema、Japanese Output、Evidence Coverage、Exact Source Lineage、Compliance、Prompt Injection Defense を確認します。標準出力は Provider、Model、Prompt Name/Version/SHA-256、Schema Version、Token、Latency、Provider Request ID、Check Result だけの JSON で、Prompt、Fixture、生成本文を含みません。Opt-in がない場合は API Call 前に `OPENAI_LIVE_EVALUATION_NOT_ALLOWED` で終了します。

`status: PASSED` の Result Artifact が保存・Review されるまでは OpenAI Provider Integration を `Partial` と報告します。Live Smoke は 5 Company / 15 Public IR PDF の Golden Dataset Evaluation を置き換えません。

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
