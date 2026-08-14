# Document Processing Verification

## Metadata

| Field               | Value                                        |
| ------------------- | -------------------------------------------- |
| Related Spec        | `specs/features/document-processing/spec.md` |
| Verification status | `Partial`                                    |
| Last updated        | `2026-08-14`                                 |

## Implemented Evidence

- Owner-scoped `POST /api/analyses/:analysisId/process` は `UPLOADED` と Active Document を Serializable Transaction で確認し、Stable Parse Idempotency Key の `JobExecution` を作成します。
- Queue Payload は `jobExecutionId` のみで、Dispatch Failure 後も Worker Pending Scan が Durable `QUEUED` Execution を再送します。
- `pdfjs-dist` は Byte Input だけを受け、500 Pages、2 MiB/Page、50 MiB/Document、120 Seconds、20 MB Object Read Limit を適用します。OCR、URL Fetch、Form/Attachment/Script Execution は行いません。
- Page は 1-based Number、Text、SHA-256、deterministic Heading Metadata とともに保存します。空 Page も保持します。
- Chunk は Page Boundary を越えず、1,200 Unicode Characters、150 Character Overlap、Whitespace-aware Boundary と Stable Hash を使用します。
- Parse/Chunk は Attempt History、Sanitized Failure、最大 3 Automatic Attempts、Atomic Set Replacement、`READY_FOR_EMBEDDING` Handoff を実装しています。
- `DocumentPage` / `DocumentChunk` は `(ownerId, documentId)` Composite FK で Parent Ownership を強制します。

## Automated Evidence

- API Unit: Process Accepted/No Documents、Durable Execution Projection。
- Worker Unit: Valid one-page PDF Text/Hash、Malformed PDF Non-retryable、Page-bounded Chunk/Overlap、Empty Page。
- Real IR Direct Parser Probe: ignored local `test-data/` 3 Files / 509 Pages を Full Text 非出力で検証し、全 File の Page Text Extraction が成功しました（63 Pages / 157,368 Bytes、124 Pages / 160,115 Bytes、322 Pages / 976,739 Bytes）。
- Existing Workspace Unit: API 88 Tests、Worker 22 Tests、全 Workspace 143 Tests。
- HTTP/PostgreSQL Integration: Owner/Cross-user Process Start、Repeated Start Idempotency、OpenAPI Contract を `analyses.integration-spec.ts` に追加しました。
- Infrastructure E2E: Real Presigned PUT / MinIO Object から Redis/BullMQ `PARSE` / `CHUNK` Worker、PostgreSQL 2 Pages / Page-bounded Chunks / SHA-256 / Attempt History、`READY_FOR_EMBEDDING` までを検証しました。
- Full Integration Gate は PostgreSQL/Redis/BullMQ/MinIO 6 Suites / 51 Tests が成功しました。`TEST-DEV-002` Option `C` により既存 Concurrent Upload Acceptance だけが Test-side `P2034` Retry を使用します。
- Deterministic Security Unit: Test 内で生成した Standard Security Password-required PDF を実 `pdfjs-dist` に渡し、`PDF_PARSE_INVALID` へ Sanitized Classification することを確認しました。Binary Fixture と Password は Production Log/Error に出しません。
- Parser Security Unit: JavaScript `OpenAction`、External URI Annotation、`<system>` Instruction-like Text を含む PDF を生成し、Script/Network を実行せず Text だけを Data として抽出することを確認しました。
- Resource Limit Unit: 2 MiB/Page、50 MiB/Document、20 MB Object の Inclusive Boundary と +1 Byte Failure、Over-limit Stream `destroy()`、Invalid Stream の Stable Error を確認しました。
- Emitted JSON Log Regression: Malicious Instruction/URI を含む `pageText`、Storage Coordinate、Filename、Presigned URL が Redact されることを確認しました。
- 2026-08-14 Full Quality Gate: Format Check、Spec Check 7 Features / 98 Requirements、Lint、Typecheck、143 Unit/Component Tests、Build、Docker Integration 6 Suites / 51 Tests が成功しました。

## Remaining Gaps

- Crash 中断点、全空 Page、Active Parent の Commit Race は Infrastructure-level Acceptance 未追加です。501 Page Limit と 3 Attempt Recovery は Passed しました。
- Real IR Files は Permission-encrypted ですが Password 不要で抽出可能でした。`PROC-Q-007` Option `A` により、この Input は通常 PDF と同じ Security/Resource Limit 内で受け入れます。
- Heading v1 は Real IR Files で 62 / 121 / 313 Sections を検出しましたが、Semantic Accuracy の Human Review / Benchmark は未実施です。
- Password/Limit は deterministic Unit と既存 Malformed/501-page Database E2E の共通 Failure Persistence 経路を組み合わせて確認しました。巨大な 50 MiB Binary Fixture は Repository/CI に保存しません。
- `PROC-AC-013` は Local Real IR 3 Files の Evidence だけで repeatable CI Fixture がないため `Partial` を維持します。Heading Semantic Review、Parent Race、Phase 4 Untrusted Context E2E も残るため Feature は `Verified` ではありません。

## Acceptance Status

| Acceptance Criterion | Status    | Evidence / Gap                                               |
| -------------------- | --------- | ------------------------------------------------------------ |
| `PROC-AC-001`        | `Passed`  | Owner Process HTTP + Durable Execution                       |
| `PROC-AC-002`        | `Passed`  | 2-page MinIO/BullMQ/Worker/DB E2E + 3 Real IR Direct Probe   |
| `PROC-AC-003`        | `Passed`  | Mixed empty/text 2-page Worker/DB E2E                        |
| `PROC-AC-004`        | `Passed`  | Page-bounded Chunk Unit + Page FK/Order/Limit DB E2E         |
| `PROC-AC-005`        | `Passed`  | Repeated Start HTTP + duplicate Parse Delivery DB E2E        |
| `PROC-AC-006`        | `Passed`  | 2 transient Storage failures → Attempt 3 Worker success      |
| `PROC-AC-007`        | `Passed`  | Malformed/501-page DB E2E + password/text/stream limit Unit  |
| `PROC-AC-008`        | `Passed`  | Bearer Owner A/B HTTP + no Job side effect                   |
| `PROC-AC-009`        | `Passed`  | Direct cross-owner Page/Chunk PostgreSQL FK reject           |
| `PROC-AC-010`        | `Passed`  | Removed Redis Job → Pending Dispatcher → Worker convergence  |
| `PROC-AC-011`        | `Passed`  | Deterministic Action/URI PDF + emitted log redaction         |
| `PROC-AC-012`        | `Passed`  | PARSE → CHUNK → `READY_FOR_EMBEDDING` Worker E2E             |
| `PROC-AC-013`        | `Partial` | 3 Real IR Direct Probe passed、repeatable CI fixture pending |

## Result

Runtime Happy-path、Retry、Duplicate Delivery、Queue Recovery、Page Limit は Infrastructure E2E、Password/Text/Stream Limit と malicious PDF/Log Boundary は deterministic Unit で確認しました。Permission-encrypted CI Fixture、Heading Semantic Review、Parent Race、Phase 4 Untrusted Context E2E が残るため Feature 全体は `Partial` です。
