# Structured Extraction Verification

## Metadata

| Field               | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| Related Spec        | `specs/features/structured-extraction/spec.md`        |
| Verification status | `Partial — implementation complete; live/golden gaps` |
| Last updated        | `2026-08-20`                                          |

## Implemented Evidence

- Shared `structuredExtractionOutputSchema` は Finding/Evidence Candidate の UUID、Category、Stable Key、Importance、String/Array Length、Unknown Field Reject を Strict Zod Contract として固定します。
- `DEFAULT_STRUCTURED_EXTRACTION_BUDGET` は 32 Chunks、48,000 Characters、48,000 Conservative Estimated Input Tokens、4,096 Output Tokens、最大 3 Provider Calls、60 Seconds/Call を上限内 Default とします。
- Deterministic Compliance Validator は Model-authored Title/Body の Buy/Sell Recommendation、Target Price、Price/Return Prediction、Personalized Allocation、Trade Timing を Stable Violation Code に分類します。
- Evidence Excerpt は Original Source Data のため Compliance Scan 対象外とし、Provider-authored Prose と混同しません。
- `AnalysisStatus.READY_FOR_VIEW_GENERATION` は Prisma Enum、Migration、Shared Zod/API Projection に追加し、`completedAt = null` の Phase 5 Handoff として表現します。
- `AnalysisFinding`、`Evidence`、`FindingEvidence` と Document/Page/Chunk Lineage は Owner/Analysis/Document/Page を含む Composite FK で結び、Finding Importance は Database Check でも 1〜5 に限定します。
- Migration は Existing Finding/Evidence/Link の Owner/Lineage 不整合を Fail-fast Check し、`FindingEvidence.analysisId` を Backfill 後に `NOT NULL` とします。
- Git-tracked `structured-extraction` Prompt Asset は Name/Version/Schema Version と Template SHA-256 を固定し、Worker 起動から独立した明示的 CLI だけが登録・Activation します。
- Prompt Activation は Name 単位の Transaction Advisory Lock、Active Partial Unique Index、Immutable-content Trigger により、Concurrent/Repeated Run を一つの Active Version へ収束させます。
- `AiUsageRepository` は Strict Content-free Contract だけを受け、Token、Latency、Cost、Operation、Prompt Version、Provider/Model/Request ID を記録します。Owner/Analysis/Job は Composite FK で同一 Lineage に限定します。
- Versioned `financialMetricSnapshotSchema` は Revenue、Operating Profit、Net Income、Operating Cash Flow を常に一つずつ保持し、Period、Scope、Raw/Normalized Value、Unit、Formula、Document/Page/Chunk Source、Unknown Reason を Strict JSON Contract として固定します。
- Deterministic Metric Parser は Japanese Annual/Quarterly Label、円/千円/百万円/億円、連結/個別、Profit/Loss Sign を明示的に解決し、`bigint` で JPY Normalization、YoY Amount、2 Decimal Rate を計算します。Missing/Ambiguous/Conflict/Zero Previous は推測せず `UNKNOWN` または `PARTIAL` にします。
- Worker `LlmProvider` は Runtime Zod Schema、System Prompt、User Context、Schema Name、Output/Timeout Budget を受け、Strict Value と Content-free Provider/Model/Token/Latency/Request ID Metadata を返します。Deterministic/OpenAI 実装を同じ Interface で交換できます。
- OpenAI Adapter は Official SDK `responses.parse` + `zodTextFormat` を使用し、Model を Environment で必須指定します。Request は `store: false`、`tools: []`、`tool_choice: none`、`parallel_tool_calls: false` とし、Refusal、Incomplete、Malformed、Auth/Permission、Rate Limit、Timeout、5xx を Stable Sanitized Error に分類します。
- `StructuredExtractionOrchestrator` は Document ID/Name/Type、Page、Section、Chunk ID/Text だけの Strict Source DTO を stable order で処理し、Chunk Count、Context Character、Conservative Estimated Token、Provider Call、Output、Timeout Budget を Map/Merge の両方に適用します。
- Default 3 Call Budget では最大 2 Map + 1 Merge とし、全 Source Chunk を処理できない Call Plan、単一 Chunk 超過、Merge Candidate 超過は Provider Call 前または Merge 前に Stable Non-retryable Failure とします。先頭 N Chunk への Silent Truncation は行いません。
- Uploaded PDF Text は Metadata 付きの Escaped Single Untrusted User Block だけに置き、Versioned System Prompt へ補間しません。Provider 由来 Map Candidate も Merge 時に Escaped Untrusted Block とし、同一 `findingKey` の競合は黙って上書きしません。
- Evidence Validator は Candidate `chunkId` を owner-scoped Active Source Set からだけ解決し、Excerpt が Chunk と Original Page Text の双方に exact match する場合だけ Server-side Document/Page/Offset/SHA-256 Lineage を構築します。Unknown Chunk、Unsupported Excerpt、Page 不一致は Stable Non-retryable Validation Error です。
- Evidence 0 件の Finding は `INSUFFICIENT_EVIDENCE` へ降格し、1 件以上の Valid Evidence を持つ Finding だけを `SUPPORTED` とします。Model-authored Title/Body の Forbidden Advice は deterministic に拒否し、Original Excerpt は Compliance Scan 対象外です。
- `ExtractionPublishRepository` は Analysis `VALIDATING`、Owner、Active Chunk ID/Hash Set、Active Prompt ID/Hash を Serializable Transaction 内で再確認し、Finding/Evidence/Link/Metric Snapshot/Handoff Status を一括置換します。
- Phase 3 `CHUNK` Success は Chunk ID/SHA-256 Input Hash に一意な `CALCULATE_FINANCIAL_METRICS` Execution を同一 Transaction で作成し、Metrics Success は Input/Prompt/Runtime Hash に一意な `EXTRACT` Execution を作成します。Queue Payload は `jobExecutionId` のみです。
- `StructuredExtractionProcessor` は Owner-scoped Active Source、Bound Prompt、Deterministic Metrics、Bounded Map/Merge、Content-free Usage、Evidence/Compliance Validation、Atomic Publish を Runtime 接続します。成功 Publish Transaction は EXTRACT Attempt/Execution、VALIDATE Attempt/Execution、Finding/Evidence/Link/Metric/Handoff を一緒に確定します。
- Validation Failure は同じ EXTRACT Attempt 内で最大 2 Repair、全 Provider Call は最大 3 です。Exhaustion は `FAILED_VALIDATION` の Non-retryable、Rate Limit/Timeout/Unavailable は最大 3 BullMQ Attempts の Retryable として分類します。
- Pending Dispatcher は `PARSE`、`CHUNK`、`CALCULATE_FINANCIAL_METRICS`、`EXTRACT` の Durable `QUEUED` Row を stable BullMQ Job ID で回復します。
- OpenAI Live Evaluation CLI は `ALLOW_OPENAI_LIVE_EVALUATION=true`、API Key、Model の三つを明示した場合だけ Production Adapter と Git-tracked Prompt を使って Responses API を 1 回呼びます。Result は Schema/Japanese/Evidence Coverage/Exact Source Lineage/Compliance/Prompt Injection Check と Content-free Usage/Version Metadata だけの JSON です。

## Automated Evidence

- `packages/shared/src/structured-extraction.spec.ts`: Strict Valid Output、Unknown Field、Importance/Length/Finding Count、Budget Ceiling、6 Compliance Categories、Evidence Excerpt Boundary。
- Targeted Shared Gate: 5 Suites / 29 Tests、Lint、Typecheck が成功しました。
- Targeted Migration/Database Gate: Fresh PostgreSQL Migration と Owner-scoped Repository Suite 17 Tests が成功し、Valid Finding/Evidence/Link、Handoff Status、Cross-owner Finding/Evidence、Cross-document Page/Chunk、Importance Check を確認しました。
- Full Workspace Gate: Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、154 Unit/Component Tests、Build、Docker Integration 6 Suites / 52 Tests が成功しました。
- `prompt-usage-audit.integration-spec.ts`: Fresh Migration、Real CLI、Repeated/Concurrent Activation、Version Switch、Immutable Trigger、Content-free Usage、Cross-owner Reject の 4 Tests が成功しました。
- Task 004 Targeted Gate: Shared 6 Suites / 31 Tests、Worker 10 Suites / 25 Tests、Shared/Worker/API Typecheck、API Lint、PostgreSQL Integration 1 Suite / 4 Tests が成功しました。
- Task 004 Full Gate: Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、158 Unit/Component Tests、Build、Docker Integration 7 Suites / 56 Tests が成功しました。Jest Full-run の Terminal Summary 非表示時は Suite ごとの Exit 0 / Passed Summary と document-storage JSON (`15/15`, `wasInterrupted=false`) で確認しました。
- `financial-metric-parser.spec.ts`: 四つの P0 Metric、Annual/Quarterly Period、Header Reverse Order、四 Unit、Consolidated/Non-consolidated、Loss/Negative、YoY Amount/Rate、Zero Previous、Missing/Ambiguous/Conflict を 7 Tests で検証しました。
- `financial-metrics.spec.ts`: Versioned Strict Snapshot、四 Metric Completeness、Unknown-field/Duplicate-key Reject を 2 Tests で検証しました。
- Task 005 Full Gate: Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、167 Unit/Component Tests、Build、Docker Integration 7 Suites / 56 Tests が成功しました。
- `deterministic-llm-provider.spec.ts` / `openai-llm-provider.spec.ts`: Exchangeable Strict Fixture、Input Budget、Content-free Usage、Responses Zod Request、No-tool/No-store、Timeout、Refusal/Incomplete/Malformed、HTTP Retry Classification、Sanitized Error、Optional Embedding Boundary を 17 Tests で検証しました。
- `config.spec.ts`: Explicit API Key/Model、Optional Embedding Model、Invalid Identifier、Secret-free Error を 3 Tests で検証しました。
- Task 006 Full Gate: Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、187 Unit/Component Tests、Build、Docker Integration 7 Suites / 56 Tests が成功しました。
- `structured-extraction-orchestrator.spec.ts`: Stable Source Order、2 Map + 1 Merge、全 Chunk Coverage、PDF/Map Candidate Delimiter Escape、System/User Separation、Call/Character/Estimated Token/Merge Budget、Strict Source Allowlist、Duplicate/Conflicting Key を 8 Tests で検証しました。
- Task 007 Full Gate: Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、195 Unit/Component Tests、Build、Docker Integration 7 Suites / 56 Tests が成功しました。
- `evidence-validator.spec.ts`: Exact Chunk/Page Excerpt、Server-side Lineage/Offset、Evidence 0 件 Downgrade、Empty Source、Unknown Chunk、Unsupported Excerpt、Page 不一致、Compliance Pre-persist Reject を 7 Tests で検証しました。
- `extraction-publish.integration-spec.ts`: Fresh PostgreSQL Migration、2 Findings/1 Evidence/1 Link の Repeat Convergence、Cross-owner/Input/Prompt Change Reject、Unique Failure 時の旧 Set Rollback を 3 Tests で検証しました。
- Task 008 Targeted Gate: Worker 15 Suites / 67 Tests、Shared 7 Suites / 34 Tests、Worker/Shared/API Lint と Typecheck、PostgreSQL Integration 1 Suite / 3 Tests が成功しました。
- `structured-extraction.processor.spec.ts`: Metrics Handoff、Compliance Repair Success、3 Call Exhaustion、Transient Provider Retry、Duplicate Delivery No-op を 5 Tests で検証しました。
- `pending-analysis.dispatcher.spec.ts` / `analysis-processing.spec.ts`: Four-step Durable Dispatch、Redis Failure Recovery、Versioned Metrics/Extract/Validate Idempotency Key を 4 Tests で検証しました。
- `structured-extraction-pipeline.integration-spec.ts`: Phase 3 Chunk → Metrics Handoff、Metrics/Extract/Validate Execution/Attempt、Atomic Output/Handoff、Duplicate Delivery を Fresh PostgreSQL の 2 Tests で検証しました。
- Task 009 Targeted Gate: Shared 8 Suites / 36 Tests、Worker 17 Suites / 74 Tests、Shared/Worker/API Lint と Typecheck、Workspace Build、Phase 3 PostgreSQL/Redis/BullMQ/MinIO 15 Tests、Task 008/009 PostgreSQL 5 Tests が成功しました。
- `structured-extraction-worker.integration-spec.ts`: Fresh PostgreSQL + Real Redis/BullMQ で Metrics → Extract → Validate/Handoff、同一 Attempt の Compliance Repair、2nd BullMQ Attempt の Rate-limit Recovery、3 Provider Call Validation Exhaustion、Provider Call 中の Source Change Fail-closed、Content-free Usage/Sanitized Failure を 4 Tests で検証しました。
- `job-operations.integration-spec.ts` / `job-operation-dispatch.spec.ts`: `EXTRACT-Q-008` Option `A` に従い Metrics/Extract の同一 Execution `FAILED → QUEUED` + Audit、Stable Analysis Queue Job Name、VALIDATE Reject を PostgreSQL 5 Tests / Unit 5 Tests の一部として検証し、`EXTRACT-DEV-002` を解消しました。
- Task 010 Full Gate: Format、Spec Check 8 Features / 119 Requirements、Workspace Lint/Typecheck、217 Unit/Component Tests、7-package Build、Phase 4 PostgreSQL/Redis/BullMQ 5 Suites / 18 Tests が成功しました。
- `openai-live-evaluation.spec.ts`: Live-shaped Strict Result の Passed Report、Unsafe/Unsupported Result の Failed Checks、Prompt/Fixture/Generated Text を Report に含めないことを 2 Tests で検証しました。
- Task 011 Targeted Gate: Worker Lint、Typecheck、19 Suites / 81 Tests が成功しました。Opt-in なしの Real CLI は Provider Call 前に Sanitized `OPENAI_LIVE_EVALUATION_NOT_ALLOWED` で Fail closed しました。
- Task 012 Full Gate: Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Workspace Lint/Typecheck、219 Unit/Component Tests、7-package Build、PostgreSQL/Redis/BullMQ/MinIO Integration 10 Suites / 66 Tests が成功しました。
- Documentation Audit: Root README、Architecture、Security、Testing Strategy を現行 Runtime に更新し、`docs/ai-pipeline.md`、`docs/evidence-model.md`、`docs/evaluation.md` を追加しました。Phase 7 Deployment/ADR と Phase 5/6 Scope は未実装として明示しています。

## Remaining Gaps

- OpenAI Adapter と Opt-in Live Harness は実装済みですが、Credential/Cost を伴う Live Call は実行しておらず Passed Artifact はありません。Approved `EXTRACT-Q-007` により Provider Integration は正確に `Partial` を維持します。
- Production Workload IAM/Secrets Manager の実体は Phase 7 Deployment Scope です。Phase 4 Manual Re-run は既存 CLI Guard/Audit/5 回上限の範囲で検証済みです。

## Acceptance Status

| Acceptance Criterion | Status   | Evidence / Gap                                                 |
| -------------------- | -------- | -------------------------------------------------------------- |
| `EXTRACT-AC-001`     | `Passed` | Real Redis/BullMQ Metrics→Extract→Validate/Handoff             |
| `EXTRACT-AC-002`     | `Passed` | Deterministic Runtime + Atomic Persist + Usage DB E2E          |
| `EXTRACT-AC-003`     | `Passed` | Escaped single user block、system separation、no-tool adapter  |
| `EXTRACT-AC-004`     | `Passed` | Exact Chunk/Page/Excerpt/Offset Unit + PostgreSQL publish      |
| `EXTRACT-AC-005`     | `Passed` | Unknown/excerpt/page/owner/input reject、no partial PostgreSQL |
| `EXTRACT-AC-006`     | `Passed` | Four Metric/Unit/Period/Scope/YoY Golden Fixtures              |
| `EXTRACT-AC-007`     | `Passed` | Missing/Ambiguous/Conflict/Zero Previous Fixtures              |
| `EXTRACT-AC-008`     | `Passed` | Six advice categories + source boundary + pre-persist reject   |
| `EXTRACT-AC-009`     | `Passed` | Same-attempt repair、2 usage rows、atomic publish BullMQ E2E   |
| `EXTRACT-AC-010`     | `Passed` | Exactly 3 calls、FAILED_VALIDATION、sanitized DB state         |
| `EXTRACT-AC-011`     | `Passed` | Rate-limit → 2nd BullMQ Attempt success + durable attempts     |
| `EXTRACT-AC-012`     | `Passed` | Provider-call source race → commit recheck fail-closed         |
| `EXTRACT-AC-013`     | `Passed` | Atomic Metrics/Finding/Evidence + VALIDATE/Handoff PostgreSQL  |
| `EXTRACT-AC-014`     | `Passed` | Content-free usage + candidate/raw-error absence in DB E2E     |

## Result

Approved Task 001〜012 の Durable Runtime、Bounded Repair/Retry、Atomic Handoff、Full Infrastructure/Race/Security Matrix、Manual Re-run、Opt-in Live Harness、Documentation/Full Gate が完了しました。Implementation は `Implemented` ですが、Live Passed Artifact と Golden Dataset Evidence がないため Verification は `Partial` です。
