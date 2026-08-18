# Structured Extraction Verification

## Metadata

| Field               | Value                                          |
| ------------------- | ---------------------------------------------- |
| Related Spec        | `specs/features/structured-extraction/spec.md` |
| Verification status | `Partial — implementation in progress`         |
| Last updated        | `2026-08-18`                                   |

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

## Remaining Gaps

- Prompt/Usage Audit、Deterministic Metric Library、Provider Interface、Deterministic/OpenAI Adapter、Pure Bounded Map/Merge Orchestrator は実装済みです。Owner-scoped Active Chunk Repository、Provider と Prompt/Usage Repository の Runtime 接続、Metric Snapshot の Database Atomic Persist は Durable Queue とともに後続 Task で接続します。Evidence Content Validation/Persistence と Golden/Live Evaluation は未実装です。
- Compliance Unit は検出 Contract を確認しましたが、Atomic Persist Reject と Repair Flow は未実装です。
- OpenAI Adapter の SDK Unit Evidence はありますが、Pipeline Runtime と Opt-in Live Evidence は未実装です。Approved `EXTRACT-Q-007` により Provider Integration は正確に `Partial` を維持します。

## Acceptance Status

| Acceptance Criterion | Status        | Evidence / Gap                                                |
| -------------------- | ------------- | ------------------------------------------------------------- |
| `EXTRACT-AC-001`     | `Not started` | Durable Phase 4 start pending                                 |
| `EXTRACT-AC-002`     | `Partial`     | Strict/Deterministic Provider passed、Persist pending         |
| `EXTRACT-AC-003`     | `Passed`      | Escaped single user block、system separation、no-tool adapter |
| `EXTRACT-AC-004`     | `Not started` | Evidence validation/persist pending                           |
| `EXTRACT-AC-005`     | `Partial`     | Cross-owner/lineage DB reject passed、excerpt pending         |
| `EXTRACT-AC-006`     | `Passed`      | Four Metric/Unit/Period/Scope/YoY Golden Fixtures             |
| `EXTRACT-AC-007`     | `Passed`      | Missing/Ambiguous/Conflict/Zero Previous Fixtures             |
| `EXTRACT-AC-008`     | `Partial`     | Compliance unit passed、persist rejection pending             |
| `EXTRACT-AC-009`     | `Not started` | Repair success flow pending                                   |
| `EXTRACT-AC-010`     | `Not started` | Repair exhaustion flow pending                                |
| `EXTRACT-AC-011`     | `Partial`     | Retryable Error Classification passed、Durable Retry pending  |
| `EXTRACT-AC-012`     | `Partial`     | Composite parent constraints passed、runtime race pending     |
| `EXTRACT-AC-013`     | `Partial`     | Enum/Migration/Shared Handoff passed、runtime pending         |
| `EXTRACT-AC-014`     | `Partial`     | Sanitized Provider Error/Usage Unit passed、Runtime pending   |

## Result

Approved Spec/Plan/Tasks、Shared/Database Audit Foundation、Deterministic P0 Metric Library、Provider Adapter Foundation、Bounded Map/Merge Security Boundary は完了しました。Evidence Validator、Atomic Publish、Durable Pipeline と Live Provider Evidence は未実装のため Feature は `Partial` です。
