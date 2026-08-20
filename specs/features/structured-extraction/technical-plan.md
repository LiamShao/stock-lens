# Structured Extraction Technical Plan

## Metadata

| Field        | Value                                          |
| ------------ | ---------------------------------------------- |
| Related Spec | `specs/features/structured-extraction/spec.md` |
| Plan status  | `Implemented — residual verification gaps`     |
| Last updated | `2026-08-20`                                   |

## Approach

既存 Analysis Processing Queue と Durable `JobExecution` を拡張し、Phase 3 の `READY_FOR_EMBEDDING` から Phase 4 は Embedding を実行せず `CALCULATE_FINANCIAL_METRICS → EXTRACT → VALIDATE → READY_FOR_VIEW_GENERATION` へ進みます。各 Queue Payload は `jobExecutionId` だけを持ち、Worker は Owner、Analysis、Input、Prompt を Database から再解決します。

Long Document は Document/Chunk 順を維持した bounded batch に分割し、各 batch を Map Structured Extraction、結果を bounded Merge/Dedupe、最後に Server-side Evidence/Compliance Validation します。固定先頭 N 件だけを使う Silent Truncation は行いません。Batch、Finding、Evidence、Provider Call の上限超過は Stable Failure とします。

Provider-neutral Interface と Deterministic Test Provider を Worker の AI Boundary に置きます。OpenAI Adapter は Official JavaScript SDK の Responses API `responses.parse` と Zod `zodTextFormat` を利用し、parsed output、refusal、incomplete/length、usage を明示的に分類します。Model 名は Hard-code せず、Structured Outputs 対応 Model を Environment で必須指定します。Official Reference: `https://developers.openai.com/api/docs/guides/structured-outputs`。

## Affected Files

| Area       | Files / Directories                                            | Change                                                                 |
| ---------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Shared     | `packages/shared/src/structured-extraction*`, `analysis.ts`    | Strict Zod Output、Compliance、Status/Queue Contract                   |
| Prisma     | `prisma/schema.prisma`, append-only migration                  | Handoff Enum、Owner-consistent Finding/Evidence Relations/Checks       |
| Worker AI  | `apps/worker/src/ai/*`                                         | Provider Interface、Deterministic/OpenAI Adapter、Error Classification |
| Worker     | Metric/Map/Merge/Evidence/Validation Repository and Processors | Durable Phase 4 Pipeline と Atomic Publish                             |
| Prompt     | `prompts/structured-extraction/*`, explicit activation CLI     | Git-tracked Immutable Prompt Asset と DB Version                       |
| Config     | `.env.example`, Worker Config                                  | Provider、Model、Timeout、Context/Output/Call/Cost Limits              |
| Tests      | Shared/Worker/API Integration/Evaluation                       | Schema、Injection、Metric、Evidence、Retry、Race、Idempotency          |
| Docs/Specs | AI Pipeline、Evidence、Security、Database、Testing、Progress   | Approved Contract、Evidence、Residual Risk                             |

## API Changes

- Phase 4 は新 Public Endpoint を追加しません。
- `AnalysisResource.status` に `READY_FOR_VIEW_GENERATION` を追加します。
- Existing `POST /api/analyses/:analysisId/process` の一つの User Intent から後続 Durable Step を連鎖させます。
- Finding/Evidence Read Contract は Phase 5 で OpenAPI とともに追加します。

## Database Changes

- `AnalysisStatus.READY_FOR_VIEW_GENERATION` を `VALIDATING` と `COMPLETED` の間へ追加します。
- `AnalysisFinding` は `(ownerId, analysisId) → Analysis(ownerId, id)` Composite FK、`importance BETWEEN 1 AND 5` Check を追加します。
- `Evidence` は Owner/Analysis/Document/Page/Chunk の整合性を Composite FK または Transaction + Integration Test で強制します。Prisma/PostgreSQL が表現可能な Relation は Database Constraint を優先します。
- `FindingEvidence` は Finding/Evidence と同じ Owner/Analysis に属することを Database/Transaction Boundary で保証します。
- `PromptVersion` は Git Asset Hash、Schema Version、Name/Version を Immutable Reference とし、明示的 CLI が Transaction 内で Insert/Activate します。Worker Startup は Prompt を変更しません。
- `AiUsageLog` は Provider Call ごとに作成し、Token、Latency、Cost、Request ID、Operation を保存します。Content、API Key、Raw Error は保存しません。
- `Analysis.financialMetrics` は Versioned Zod Snapshot とし、四つの P0 Metric、Period、Unit、Raw/Normalized Value、Source Chunk/Page、Formula/Calculated Value を保持します。

## Structured Output and Provider Boundary

- Shared Schema は `.strict()`、bounded array/string、UUID/Enum/importance、Evidence Count を強制します。
- `generateStructured<T>` は Runtime Zod Schema、System Prompt、Untrusted User Context、Schema Name、Timeout/Output Budget を受け、Value と sanitized usage metadata を返します。
- OpenAI Adapter は SDK の Zod-backed Structured Output を使用しても Shared Schema を再 Parse します。
- Refusal、Incomplete/Length、Authentication/Configuration、Rate Limit、Timeout、5xx、Malformed Output を別 Error Code に分類します。
- Rate Limit/Timeout/5xx は最大 3 Durable Job Attempt、Schema/Evidence/Compliance Failure は同 Attempt 内で Initial 1 + Repair 2 Call までとし、exhaustion 後は Queue Retry しません。
- API Key は Worker Environment のみで読み、Log、Usage、Job Detail、Prompt Asset、Queue に含めません。

### Task 007 Map/Merge Boundary

- Worker は Active Chunk Repository が返す順序付き Source DTO だけを受け、Document ID/Name/Type、1-based Page、Section、Chunk ID、Text を strict parse します。Owner/Active 判定そのものは Task 009 の Repository 接続時に行います。
- Source DTO は Document Order、Page Number、Chunk Order の stable tuple で並べ直し、Chunk Count と Context Character/Estimated Token の双方を満たす greedy batch に分割します。1 Chunk でも上限を超える場合や、全 Batch を Map/Merge する Call Budget がない場合は Provider 呼び出し前に stable non-retryable failure とし、先頭 N Chunk への silent truncation は行いません。
- 1 Batch は 1 Map Call、複数 Batch は追加 1 Merge Call を消費します。Task 007 では最大 2 Map + 1 Merge を許容し、Merge Candidate 自体にも Character/Estimated Token 上限を適用します。
- PDF Text は `buildUntrustedPdfContext` が生成した単一の `role=user` Block のみに配置し、System Prompt へ補間しません。Map Result も Provider 由来の untrusted candidate block として Merge の User Context に置きます。
- Map/Merge の最終値は Shared strict schema で再 Parse し、`findingKey` を deterministic に一意化します。同一 Key の内容が競合する場合は黙って上書きせず stable failure とします。
- Task 007 は Pure Orchestrator と Security Evaluation までを対象とし、DB からの Owner-scoped Active Chunk 解決、Prompt/Usage 永続化、Durable Retry、Evidence Validation/Atomic Publish は Task 008〜009 で接続します。

### Task 009 Durable Runtime Boundary

- `CHUNK` 完了 Transaction は stable Chunk ID/SHA-256 Set から Input Hash を作り、`CALCULATE_FINANCIAL_METRICS` Execution を一度だけ `QUEUED` にします。Redis publish 失敗は既存 Dispatcher が Durable Row から回復します。
- Metrics Job は Active Owner/Parent/Chunk Set を再解決し deterministic parser を実行した後、Input/Prompt/Runtime Hash を束縛した `EXTRACT` Execution を作成します。Metric Snapshot は中間公開せず、Validation 成功 Transaction でだけ保存します。
- Strict Parsed Provider Candidate を `JobExecution.errorDetails` 等へ保存しません。`EXTRACT` BullMQ Attempt 内で Provider → Evidence/Compliance Validation → Atomic Publish を完結し、成功 Transaction 内で `VALIDATE` Execution/Attempt を `SUCCEEDED` として記録します。Crash/Retry は同じ EXTRACT Execution で全処理を再実行し、Partial Set を公開しません。
- Validation Repair は Provider 総 Call Count を Attempt 単位で数え、Initial を含め最大 3 Calls、Repair 最大 2 回です。Transient Provider Error だけを BullMQ 最大 3 Attempts へ返し、Validation Exhaustion は `FAILED_VALIDATION` + Unrecoverable とします。
- `AiUsageLog` は成功した Provider Call ごとに Content-free Metadata を記録し、Runtime Provider/Model が Execution に束縛した Identity と異なる場合は Fail closed とします。

## Metric Pipeline

- 対象は Revenue、Operating Profit、Net Income、Operating Cash Flow の四つです。
- Document Text から Label、Value、Unit、Period、Consolidated/Non-consolidated を deterministic parser で抽出します。
- Unit、Period、Scope が一致する Current/Previous 値だけを比較し、YoY Amount/Rate は Decimal-safe deterministic code で計算します。
- Ambiguous Label、Unit、Period、Sign、Scope は `unknown` とし、LLM 値で補完しません。
- Fixture は Japanese IR Table/Text の Known Values と Missing/Ambiguous Cases を含みます。

## Evidence and Compliance Validation

- Candidate `chunkId` は Owner/Analysis の Active Chunk Set からだけ解決します。
- Candidate Excerpt は Chunk Content の Exact Match を Default とし、Unicode/Whitespace Normalization を許可する場合も Original Offset/Excerpt を Server が再構築します。
- Page Number、Document ID/Name、Page/Chunk Relation は Database Record から投影し、Provider 値を信用しません。
- `SUPPORTED` Finding は Valid Evidence 1 件以上を必須とし、重要 Claim の無根拠 Publish を拒否します。
- Forbidden Phrase/Pattern と Semantic Field Rule を deterministic validator で確認し、Buy/Sell、Target Price、Prediction、Allocation、Trade Timing を拒否します。
- Finding/Evidence/Link/Metric Snapshot と Handoff Status は Parent/Input/Prompt Recheck 後の一 Transaction で置換します。

## Security and Failure Handling

- `buildUntrustedPdfContext` の返す User/Untrusted Block だけを Uploaded Text 入力に使用します。
- System Prompt と Repair Instruction に PDF Text を補間しません。
- Provider への Tool、Web、File Search、Code Interpreter は設定しません。
- Context Batch は Character/Estimated Token/Chunk Count、Output は Finding/Evidence/String Length、Execution は Call/Timeout/Estimated Cost を bounded にします。
- Log/Job/Usage Redaction は Full Prompt/Context/Response、Chunk/Page Text、Provider Error/Key/Endpoint を対象にします。
- Deleted Parent、Input Hash、Prompt Hash/Version の Race は Commit 前 Recheck で Fail closed とします。

## Test Strategy

| Requirement                          | Level                               | Evidence                                                          |
| ------------------------------------ | ----------------------------------- | ----------------------------------------------------------------- |
| `EXTRACT-AC-001`, `AC-011`, `AC-013` | PostgreSQL/Redis/BullMQ Integration | Durable Chain、Retry、Idempotency、Handoff                        |
| `EXTRACT-AC-002`, `AC-009`, `AC-010` | Unit + Integration                  | Deterministic Provider、Strict Schema、Repair Budget、Usage Audit |
| `EXTRACT-AC-003`, `AC-008`, `AC-014` | Security Unit/Evaluation            | Prompt Injection、Forbidden Output、Log/Job/Usage Redaction       |
| `EXTRACT-AC-004`, `AC-005`, `AC-012` | PostgreSQL Integration              | Exact Evidence、Cross-owner、Delete/Input Race、Atomicity         |
| `EXTRACT-AC-006`, `AC-007`           | Deterministic Unit/Golden Fixture   | Four Metrics、Unit/Period/YoY、Missing/Ambiguous Detection        |

CI は Deterministic Provider を使い、Schema/Evidence/Compliance/Retry を再現可能に検証します。OpenAI Live Smoke/Evaluation は明示的 Environment Flag と Credential を要求し、Result に Provider、Model、Prompt、Schema Version を記録します。Live Evidence がない間、OpenAI Integration Verification は `Partial` とします。

## Rollout and Rollback

1. Additive Enum/Constraint Migration と Shared Status Contract を先に適用します。
2. Prompt Activation CLI で approved Prompt Version を登録します。
3. Worker は Provider Config/Active Prompt がない場合 Fail-fast し、Phase 3 Result を壊しません。
4. Phase 4 Dispatch を有効化し、Metrics → Extract → Validate の順で監視します。
5. Rollback は Dispatch を停止して Worker を戻し、Enum、PromptVersion、AiUsageLog、成功済み Finding/Evidence を監査用に保持します。

## Risks and Decisions

- Map/Merge は Full Document の Cross-chunk Context を失う可能性があります。Golden Dataset で Evidence Coverage/Unsupported Claim を測定し、Phase 6 Embedding 導入時に比較します。
- OpenAI Model Capability/Availability は変化し得るため、Model は Config + Usage Audit に固定し、Provider Adapter Unit と Opt-in Live Smoke で検証します。
- Structured Outputs は Schema 適合を強化しますが、Evidence Truth/Compliance を保証しないため、Server-side Validation を省略しません。
- Financial Label/Unit 表記は企業ごとに異なります。P0 Parser は Ambiguous Case を unknown に倒し、Coverage を誇張しません。
