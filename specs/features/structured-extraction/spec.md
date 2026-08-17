# Structured Extraction Specification

## Metadata

| Field                 | Value                                     |
| --------------------- | ----------------------------------------- |
| Spec status           | `Approved`                                |
| Implementation status | `Implementing`                            |
| Verification status   | `Partial`                                 |
| Owner                 | `TBD`                                     |
| Approval              | `2026-08-14; EXTRACT-Q-001〜007 Option A` |
| Last updated          | `2026-08-17`                              |

## Goal

Phase 3 で生成した Owner-isolated `DocumentChunk` から、Provider 抽象化、Versioned Prompt、Zod Structured Output を通して Company Analysis Finding を抽出します。重要 Finding は Original Document、1-based Page、Chunk、Exact Excerpt まで追跡できる Evidence を必須とし、Server-side Validation に成功した Set だけを原子的に保存します。

出力は Upload 資料に基づく事実整理と不確実性の明示に限定し、投資助言、売買推奨、目標株価、株価予測を生成しません。

## Non-goals

- Just Tell Me、Analyst View、Buffett-Munger Lens の最終文章生成と UI
- PDF Viewer、Evidence Drawer、Presigned Download URL
- Embedding、pgvector、Hybrid Retrieval、RAG Q&A
- Full DCF、WACC、Target Price、Return/Stock Price Prediction
- OCR、External News、Real-time Market Data
- LLM による重要 Financial Calculation
- Provider Fine-tuning、Agentic Web Browsing、Uploaded PDF 内 Link の取得

## Actors and Preconditions

- Phase 3 Processing が成功し、Analysis は `READY_FOR_EMBEDDING`、Active Document/Page/Chunk Set を持ちます。
- Independent Worker だけが LLM Provider Credential を保持し、Queue Payload は `jobExecutionId` のみです。
- Worker は Database から Owner、Analysis、Chunk、Prompt Version、Input Version を再解決します。
- Uploaded PDF Text は `@stocklens/shared` の Untrusted PDF Context Boundary だけを通して Provider へ渡します。

## Functional Requirements

| ID               | Requirement                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXTRACT-FR-001` | Phase 3 の成功済み Analysis を Durable Extraction Pipeline へ一度だけ引き渡し、現在 Step、Attempt、開始/終了時刻、Sanitized Failure を追跡する                                         |
| `EXTRACT-FR-002` | `LlmProvider.generateStructured<T>` を Provider-neutral Interface とし、Runtime Provider と Deterministic Test Provider を交換可能にする                                               |
| `EXTRACT-FR-003` | Extraction Input は Owner-scoped Active Chunk、Document Name/Type、Page Number、Section、Chunk ID に限定し、明示的な Context Budget 内で処理する                                       |
| `EXTRACT-FR-004` | Provider Input は Versioned Prompt と Zod Schema Version を固定し、利用した Prompt/Provider/Model を `PromptVersion` と `AiUsageLog` に記録する                                        |
| `EXTRACT-FR-005` | Structured Output は Finding Key、Category、Japanese Title/Body、Importance、Evidence Candidate、Missing/Uncertainty を表現し、Unknown/Missing を捏造で補完しない                      |
| `EXTRACT-FR-006` | Important Financial Metric の抽出、単位正規化、期間比較、増減率などの Calculation は deterministic code で行い、入力値、式、単位、Source を監査可能に保存する                          |
| `EXTRACT-FR-007` | Evidence Candidate の Document/Chunk/Page/Excerpt を Server-side で再解決し、Exact Excerpt または明示的に定義した Normalized Match が Original Text に存在する場合だけ Evidence にする |
| `EXTRACT-FR-008` | `SUPPORTED` Finding は 1 件以上の Valid Evidence を必須とし、Evidence 不足は `INSUFFICIENT_EVIDENCE` または Missing Information へ降格する                                             |
| `EXTRACT-FR-009` | Finding、Evidence、FindingEvidence、Financial Metric Snapshot は Validation 成功時に Analysis 単位で原子的に置換し、Retry/Re-run で重複を作らない                                      |
| `EXTRACT-FR-010` | Schema/Evidence/Compliance Validation Failure は bounded repair を行い、上限後は `FAILED_VALIDATION` と Stable/Sanitized Reason を保存する                                             |
| `EXTRACT-FR-011` | Provider Timeout、Rate Limit、Temporary Failure は Durable Job Retry から回復し、成功済み Output と Evidence Set を壊さない                                                            |
| `EXTRACT-FR-012` | Validation 成功後は Phase 5 View Generation が二重処理なく開始できる明確な Handoff Status を保存する                                                                                   |
| `EXTRACT-FR-013` | AI Usage は Token、Latency、Estimated Cost、Operation、Prompt Version、Provider Request ID を可能な範囲で保存し、PDF/Prompt/Provider Response 本文は保存しない                         |

## Security and Compliance Requirements

| ID                | Requirement                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXTRACT-SEC-001` | Analysis、Chunk、Finding、Evidence、Usage Log の全 Data Access は Owner Scope と Composite Ownership Constraint を維持する                                 |
| `EXTRACT-SEC-002` | Uploaded Text は `role=user`、`trust=untrusted`、`instructionsAllowed=false` とし、System/Developer Prompt へ連結または昇格させない                        |
| `EXTRACT-SEC-003` | PDF 内の Instruction、Tool Request、URL、Secret Extraction Request、Role/Delimiter Override を無視し、Network/Tool/System Mutation を許可しない            |
| `EXTRACT-SEC-004` | Provider API Key、Full Context、Full PDF/Page/Chunk Text、Prompt 本文、Raw Provider Request/Response/Error を Log、Job Detail、AiUsageLog に保存しない     |
| `EXTRACT-SEC-005` | Provider Response は Untrusted External Input として Zod Strict Parse、Length/Count/Enum Limit、Unknown Field Reject を適用する                            |
| `EXTRACT-SEC-006` | Forbidden Investment Advice、Target Price、Price/Return Prediction、Personalized Allocation、Trade Timing を deterministic compliance validator で拒否する |
| `EXTRACT-SEC-007` | Context/Output Token、Chunk Count、Provider Call Count、Timeout、Automatic Retry/Repair、Estimated Cost に明示的上限を設ける                               |
| `EXTRACT-SEC-008` | Analysis/Document が削除済み、Owner/Input Hash/Prompt Version が変化した場合は Commit 前に Fail closed とし、派生 Data を公開しない                        |

## API and Data Contract

Draft Baseline では新しい Public HTTP Endpoint を追加しません。既存 Process Flow と Analysis Detail Status を利用し、Finding/View Read API は Phase 5 Specification で定義します。

Provider Interface の Target Shape:

```typescript
export interface LlmProvider {
  generateStructured<T>(input: StructuredGenerationInput<T>): Promise<T>;
  embedTexts(texts: string[]): Promise<number[][]>;
}
```

Draft Structured Finding Shape:

```typescript
interface StructuredFindingCandidate {
  findingKey: string;
  category:
    | 'BUSINESS_OVERVIEW'
    | 'FINANCIAL_HIGHLIGHT'
    | 'MANAGEMENT_GUIDANCE'
    | 'POSITIVE'
    | 'RISK'
    | 'UNCERTAINTY'
    | 'WATCH_ITEM'
    | 'MISSING_INFORMATION';
  titleJa: string;
  bodyJa: string;
  importance: 1 | 2 | 3 | 4 | 5;
  evidence: Array<{
    chunkId: string;
    excerpt: string;
  }>;
}
```

Evidence API Projection は既存 Product Contract に合わせ、`id`、`documentId`、`documentName`、`pageNumber`、`excerpt`、`chunkId` を含みます。`documentName` は保存せず Active Document から Join します。

Database Candidate Changes:

- `AnalysisStatus.READY_FOR_VIEW_GENERATION` を Phase 5 の Durable Handoff として追加します。
- Existing `AnalysisFinding`、`Evidence`、`FindingEvidence`、`PromptVersion`、`AiUsageLog` を使用し、不足する Owner-consistent Composite FK / Check Constraint を Migration で追加します。
- `Analysis.financialMetrics JSONB` は Zod-validated deterministic snapshot に限定します。
- Durable `JobExecution` は少なくとも `CALCULATE_FINANCIAL_METRICS`、`EXTRACT`、`VALIDATE` を使用します。Evidence Selection を独立 Step にするかは Technical Plan で Input/Transaction Boundary を確認します。

## Error and Edge Cases

| Case                                        | Expected behavior                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Active Chunk なし                           | Non-retryable `FAILED_EXTRACTION`、既存成功 Output は維持                                   |
| Provider Timeout / 429 / 5xx                | Retryable、最大 Job Attempt 内で回復                                                        |
| Provider Authentication / Invalid Config    | Non-retryable Configuration Failure、Credential Detail は保存しない                         |
| Malformed / Unknown-field Output            | Strict Zod Failure、bounded repair 後 `FAILED_VALIDATION`                                   |
| Unknown Chunk / Cross-owner Chunk ID        | Evidence Validation Failure、Record を保存しない                                            |
| Excerpt が Chunk/Page Text に存在しない     | Evidence Reject、Finding を降格または Validation Failure                                    |
| Important Finding に Evidence がない        | `SUPPORTED` を拒否し、Missing/Insufficient Evidence として明示                              |
| Forbidden Investment Language               | Compliance Validation Failure。Provider Repair 上限後は `FAILED_VALIDATION`                 |
| Document Delete / Reprocess during LLM Call | Commit 前 Input Version/Active Parent Recheck で Fail closed                                |
| Duplicate Delivery / Manual Re-run          | Stable Input/Prompt/Schema/Provider Version Key で同じ Set に収束                           |
| Token/Context/Cost Limit 超過               | Bounded Candidate Selection または Stable Non-retryable Failure。Silent Truncation はしない |
| Missing Financial Value / Unit / Period     | `null` / `unknown` とし、LLM で推測しない                                                   |

## Acceptance Criteria

| ID               | Given / When / Then                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EXTRACT-AC-001` | Given Phase 3 Completed Chunks、When Pipeline が開始、Then Durable Step/Attempt と一意な Input Version を作り Extraction 状態へ進む                                            |
| `EXTRACT-AC-002` | Given Deterministic Provider Fixture、When Structured Extraction、Then Strict Zod-valid Japanese Finding Set と Prompt/Usage Audit を保存する                                  |
| `EXTRACT-AC-003` | Given Prompt Injection を含む Chunk、When Provider Context を生成、Then Uploaded Text は一つの Escaped Untrusted User Block 内に留まり System Instruction/Tool Call にならない |
| `EXTRACT-AC-004` | Given Valid Chunk Excerpt、When Evidence Validation、Then Document/Page/Chunk/Exact Text へ追跡可能な Evidence と Finding Link を保存する                                      |
| `EXTRACT-AC-005` | Given Unknown/Cross-owner Chunk または Unsupported Excerpt、When Validation、Then Finding/Evidence/Output を部分保存せず Stable Failure/Insufficient 状態にする                |
| `EXTRACT-AC-006` | Given Revenue/Profit/Cash Flow Fixture、When Metric Pipeline、Then deterministic Expected Value/Unit/Period/Calculation/Source が一致する                                      |
| `EXTRACT-AC-007` | Given Missing/Ambiguous Metric、When Extract、Then `null` / `unknown` となり値を捏造しない                                                                                     |
| `EXTRACT-AC-008` | Given Buy/Sell、Target Price、Return Prediction、Personal Advice を含む Provider Output、When Compliance Validation、Then Persist を拒否する                                   |
| `EXTRACT-AC-009` | Given Schema/Evidence/Compliance Failure、When bounded repair が成功、Then同じ Execution/Usage Audit 内で Valid Set に収束する                                                 |
| `EXTRACT-AC-010` | Given Repair 上限超過、When Job 終了、Then `FAILED_VALIDATION`、Sanitized Attempt History、No Partial Set を保存する                                                           |
| `EXTRACT-AC-011` | Given Provider Temporary Failure、When Retry 内に回復、Then重複 Finding/Evidence/Usage Completion を作らず成功する                                                             |
| `EXTRACT-AC-012` | Given Document Delete/Input Change の Race、When Commit、Then Owner/Parent/Input Recheck が拒否し旧派生 Set を公開しない                                                       |
| `EXTRACT-AC-013` | Given Validation Success、When Phase 4 Boundary に到達、Then Phase 5 が Status と Durable Output から二重処理なく継続できる                                                    |
| `EXTRACT-AC-014` | Given malicious context/provider error、When Log/Job/Usage を調査、Then Full Content、Credential、Raw Provider Detail を含まない                                               |

## Open Questions

| ID              | Question                                                     | Impact                                       | Status                                                |
| --------------- | ------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| `EXTRACT-Q-001` | Phase 4 完了後の Handoff Status                              | Public Status / DB Enum / Phase 5            | `Resolved A: READY_FOR_VIEW_GENERATION`               |
| `EXTRACT-Q-002` | Embedding 前に大量 Chunk から Evidence Candidate を得る方法  | Quality / Cost / Phase 6 Scope               | `Resolved A: bounded Map/Merge/Validate`              |
| `EXTRACT-Q-003` | 最初の Production LLM Provider と Test Boundary              | Dependency / Secret / Structured Output      | `Resolved A: interface + OpenAI + deterministic`      |
| `EXTRACT-Q-004` | Deterministic Financial Metric の Phase 4 Scope              | Accuracy / Schedule / Data Contract          | `Resolved A: four P0 metrics + YoY`                   |
| `EXTRACT-Q-005` | Prompt Version の作成・Activation 方法                       | Audit / Deploy / Rollback                    | `Resolved A: tracked asset + explicit CLI`            |
| `EXTRACT-Q-006` | Schema/Evidence/Compliance Repair と Job Retry の上限        | Cost / Failure Semantics / Idempotency       | `Resolved A: 1 initial + 2 repair; transient retry 3` |
| `EXTRACT-Q-007` | Live Provider Evaluation を CI/Definition of Done に含めるか | Repeatability / Cost / Core Completion Claim | `Resolved A: deterministic CI + opt-in live`          |

## Dependencies

- Approved/Implemented Document Processing Specification
- Approved Job Re-run Specification
- Existing `AnalysisFinding`、`Evidence`、`PromptVersion`、`AiUsageLog` Schema
- Existing Untrusted PDF Context Boundary
- `docs/architecture.md`、`docs/database-design.md`、`docs/security.md`、`docs/testing-strategy.md`
- User Approval of `specs/features/structured-extraction/decision-request.md`
