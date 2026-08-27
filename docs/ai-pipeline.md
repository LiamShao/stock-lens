# AI パイプライン

## 1. 目的と現在地

StockLens AI の AI Pipeline は、Owner-scoped な PDF Page/Chunk から、原文へ追跡できる Finding を生成します。出力は公開資料の整理に限定し、売買推奨、目標株価、株価・収益率予測、取引時期、個人向け資産配分を生成しません。

Phase 4 では `READY_FOR_EMBEDDING` から Embedding を一時的に Skip し、次の Durable Flow を実装済みです。

```text
READY_FOR_EMBEDDING
  → CALCULATE_FINANCIAL_METRICS
  → EXTRACT
  → VALIDATE
  → READY_FOR_VIEW_GENERATION
```

`READY_FOR_VIEW_GENERATION` は Finding/Evidence 検証済み、Phase 5 View 未生成を表します。Phase 6 では `READY_FOR_EMBEDDING → EMBEDDING → EXTRACTING` に拡張します。

## 2. Durable Execution

- Queue Payload は `jobExecutionId` だけを持ちます。
- Worker は Database から Owner、Analysis、Active Document/Page/Chunk、Prompt Version、Input Hash を再解決します。
- `JobExecution` は Step、Status、Attempt、開始/終了時刻、Stable/Sanitized Failure を保持します。
- Idempotency Key は Analysis、Step、Input/Prompt/Runtime Version から作り、Duplicate Delivery と Manual Re-run を同じ結果へ収束させます。
- `CALCULATE_FINANCIAL_METRICS` と `EXTRACT` の失敗は Guard 付き Operator CLI で再実行できます。内部 Commit Step の `VALIDATE` は手動実行できません。

## 3. Deterministic Financial Metrics

Revenue、Operating Profit、Net Income、Operating Cash Flow は LLM に計算させません。Worker の deterministic parser が Label、Value、Unit、Period、Consolidated Scope、Sign を解決し、`bigint` で JPY Normalization と YoY Amount/Rate を計算します。

Snapshot は Raw/Normalized Value、Formula、Document/Page/Chunk/Exact Row を保持します。単位、期間、Scope、値が Missing/Ambiguous/Conflicting の場合は `UNKNOWN` または `PARTIAL` とし、推測で補いません。

## 4. Structured Extraction

`LlmProvider` は Structured Generation と Embedding の Provider-neutral Interface です。CI は `DeterministicLlmProvider`、Production は `OpenAiLlmProvider` を使用します。

OpenAI Adapter は Responses API の Zod-backed Structured Output を使用し、Model を Environment で指定します。Request は `store: false`、`tools: []`、`tool_choice: none`、`parallel_tool_calls: false` に固定します。Provider Output は Shared Strict Zod Schema でも再検証します。

Long Document は stable Document/Page/Chunk order の bounded Map/Merge で処理します。Default Budget は最大 32 Chunks/Batch、48,000 Context Characters、48,000 Conservative Estimated Input Tokens、4,096 Output Tokens、3 Calls、60 Seconds/Call です。3 Calls では最大 2 Map + 1 Merge とし、全 Chunk を処理できない場合は Silent Truncation せず失敗します。

## 5. Trust Boundary と Validation

Uploaded Text は `source=uploaded-pdf`、`trust=untrusted`、`role=user`、`instructionsAllowed=false` の Escaped Block に限定します。PDF 内の命令、Role/Delimiter Override、Tool/URL/Secret Request は指示として扱いません。Map Candidate も Merge 時に Untrusted Block として再 Escape します。

Provider Result は次の順で検証します。

1. Strict Zod Schema、Count/Length/Enum Limit
2. Candidate Chunk が Owner-scoped Active Source に存在すること
3. Excerpt が Chunk Text と Original Page Text の双方に exact match すること
4. Finding と Evidence の Document/Page/Chunk Lineage
5. Evidence Coverage と `SUPPORTED` / `INSUFFICIENT_EVIDENCE`
6. Forbidden Investment Language の deterministic compliance check
7. Commit 直前の Owner、Parent、Input Hash、Prompt Hash 再確認

Schema/Evidence/Compliance Failure は同じ Attempt 内で最大 2 Repair、Provider Call は合計 3 回です。Validation Exhaustion は `FAILED_VALIDATION`、Rate Limit/Timeout/Unavailable は BullMQ の最大 3 Attempts で回復します。

## 6. Atomic Publish と Audit

Validation 成功時だけ、Financial Metric Snapshot、Finding、Evidence、FindingEvidence、`VALIDATE` Execution/Attempt、`READY_FOR_VIEW_GENERATION` Handoff を Serializable Transaction で一括置換します。再実行は Stable Key/Hash に収束し、旧成功 Set は新 Set の Commit 成功まで維持します。

`AiUsageLog` は Provider、Model、Operation、Prompt Version、Token、Latency、Estimated Cost、Provider Request ID の allowlist だけを保存します。Prompt、PDF/Chunk Text、Raw Request/Response/Error、Credential は保存・Log 出力しません。

## 7. Analysis Views Publish Foundation

Phase 5 は Finding、Finding-linked Evidence、Deterministic Financial Metrics を Strict Owner-scoped Source として再解決し、Just Tell Me、Analyst View、Buffett-Munger Lens の三 View を一回の bounded Structured Generation Candidate として扱います。Evidence は View JSONB に複製せず、Direct Evidence ID だけを保存します。

Publish 前に Active Parent、Exact Source Input Hash、Active Prompt ID/SHA-256/Schema Version、FindingEvidence と Original Document/Page/Chunk/Excerpt を Serializable Transaction 内で再確認します。Schema、Citation、Compliance がすべて成功した場合だけ、三 View JSONB、`COMPLETED`、`completedAt` を原子的に保存します。Unknown、Unlinked、Cross-owner Citation と Input/Prompt/Delete Race は Partial Output を残さず拒否します。

## 8. 未完了範囲

- OpenAI opt-in Live Harness は実装済みですが、Live Passed Artifact は未取得です。
- 5 Company / 15 Public IR PDF の Golden Dataset Evaluation は未実装です。
- Phase 5 View Contract、One-call Orchestrator、Owner-scoped Citation/Atomic Publish Foundation は実装済みです。Durable `GENERATE_VIEWS` Queue、Repair/Retry/Usage Persist、Read API、Evidence UI は未実装です。
- Production Secrets Manager/IAM Evidence は Phase 7 Deployment Scope です。

Feature-level Source of Truth は `specs/features/structured-extraction/`、検証結果は `verification.md` と `specs/traceability.md` を参照してください。
