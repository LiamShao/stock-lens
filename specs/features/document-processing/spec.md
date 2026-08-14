# Document Processing Specification

## Metadata

| Field                 | Value                                        |
| --------------------- | -------------------------------------------- |
| Spec status           | `Approved`                                   |
| Implementation status | `Implemented`                                |
| Verification status   | `Partial`                                    |
| Owner                 | `TBD`                                        |
| Approval              | `Approved 2026-08-13; PROC-Q-007 Approved A` |
| Last updated          | `2026-08-14`                                 |

## Goal

Finalize 済みの Public IR PDF を独立 Worker で非同期に解析し、原文 Page Number を保持した Page Text と、Evidence/RAG の基礎になる再現可能な Chunk を Owner-isolated Database に保存します。失敗、Retry、再実行は Durable Job State から追跡でき、同じ Input を繰り返し処理しても重複 Data を作りません。

## Non-goals

- OCR、画像だけの Page の文字認識
- Embedding、LLM Structured Extraction、Evidence Selection、View Generation
- Financial Metric の計算
- PDF Viewer 用 Presigned Download URL
- Full GraphRAG、Knowledge Graph、Chat Q&A
- Password 入力または明示的な復号を必要とする PDF の解除（Password 不要で安全に Text 抽出できる Permission-encrypted PDF は対象外）
- PDF 内 JavaScript、Attachment、Link、Form の実行または取得

## Actors and Preconditions

- Authenticated User は自分の `UPLOADED` Analysis に対して処理開始を要求します。
- Analysis には少なくとも 1 件、最大 3 件の Active Finalized Document があります。
- API、Worker、PostgreSQL、Redis/BullMQ、Private Object Storage が利用可能です。
- Worker は Queue Payload の ID だけを信頼せず、Database Relation から Owner、Analysis、Document、Storage Target、現在 Status を再解決します。

## Functional Requirements

| ID            | Requirement                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROC-FR-001` | User は自分の `UPLOADED` Analysis だけを非同期処理へ投入でき、開始結果から Durable Execution ID と現在 Status を確認できる                                                |
| `PROC-FR-002` | Worker は各 Active Document を Private Object Storage から Stream/Bounded Local File として取得し、PDF Page ごとの Text を Page Number 付きで抽出する                     |
| `PROC-FR-003` | OCR を使わず抽出できない Page は空 Text として保持し、Page 欠落や Page Number の詰め替えを行わない                                                                        |
| `PROC-FR-004` | 検出可能な Heading/Section は deterministic heuristic として `sectionMetadata` に保存し、検出不能時は `null` とする                                                       |
| `PROC-FR-005` | Chunk は単一 Page の境界を越えず、Document 全体で安定した `chunkIndex`、Page、Section、Content Hash、Token/Length Metadata を持つ                                         |
| `PROC-FR-006` | Parse 成功時は `Document.pageCount` と全 `DocumentPage` を原子的に反映し、Chunk 成功時は当該 Document の Chunk Set を原子的に置換する                                     |
| `PROC-FR-007` | Pipeline は `UPLOADED → PARSING → CHUNKING` を Durable Job と Timestamp で追跡し、Phase 3 完了境界では後続 Phase へ安全に引き渡せる状態にする                             |
| `PROC-FR-008` | Parse/Chunk Job は Stable Idempotency Key を持ち、同一 Input Version の成功済み処理は Skip し、Retry/Concurrent Delivery でも Page/Chunk を重複作成しない                 |
| `PROC-FR-009` | Retryable Failure は最大 3 Attempt の Exponential Backoff、Non-retryable Failure は即時終了とし、`FAILED_PARSING` または `FAILED_CHUNKING` と Sanitized Reason を保存する |
| `PROC-FR-010` | Analysis または Document が削除済み、所有関係が不整合、Input SHA が変化、前提 Status が不正な場合は Fail closed とし、派生 Data を書き込まない                            |
| `PROC-FR-011` | 各 Step は Queue/Database の一時的不整合と Worker Crash 後に Pending Scan または再 Delivery で収束できる                                                                  |

## Security and Compliance Requirements

| ID             | Requirement                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `PROC-SEC-001` | Start/Status 操作の `ownerId` は Access Token からのみ導出し、Cross-user Resource は Stable Not Found とする                  |
| `PROC-SEC-002` | `DocumentPage` と `DocumentChunk` は Database Composite FK で親 Document と Owner Equality を強制する                         |
| `PROC-SEC-003` | Parser は Network、Script、External Resource、Attachment、Form Action を実行せず、PDF Text を Data としてのみ扱う             |
| `PROC-SEC-004` | Parser の CPU、Memory、Page Count、抽出 Text Size、処理時間に明示的上限を設け、上限超過を Stable Non-retryable Failure とする |
| `PROC-SEC-005` | Log、Error、Job Detail に Full PDF Text、Full Page/Chunk Text、Storage Key、Presigned URL、Raw Provider Error を保存しない    |
| `PROC-SEC-006` | Object から読んだ Byte と Text は Untrusted Input とし、後続 LLM Context へ渡す際は既存 Untrusted PDF Boundary を必ず使用する |
| `PROC-SEC-007` | Temporary File を使う場合は Process 専用 Directory、限定 Permission、必須 Cleanup を使用し、Filename を Path に使用しない     |

## Proposed API and Data Contract

以下は Approval 対象の Proposed Contract です。

- `POST /api/analyses/:analysisId/process`
  - Authentication: Bearer Access Token
  - Success: `202 Accepted`
  - Response: `{ executionId, analysisId, status, acceptedAt }`
  - `UPLOADED` 以外、Active Document 0 件、既存実行中、削除済み Resource は Stable Error とする
- `GET /api/analyses/:analysisId/jobs`
  - User-facing Status に必要な Sanitized Execution/Attempt Summary だけを返す
  - Internal Storage Coordinate、Raw Error、BullMQ Connection Detail は返さない
- Queue Payload は `{ jobExecutionId }` のみとする
- `DocumentPage` / `DocumentChunk` に `(ownerId, documentId)` から `Document(ownerId, id)` への Composite FK を追加する
- Parse Input Version は最低限 `documentId + document.sha256 + parserVersion`、Chunk Input Version は `page text hashes + chunkerVersion + chunk configuration hash` を含む

## Error and Edge Cases

| Case                                             | Expected behavior                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Cross-user / missing Analysis                    | `404 ANALYSIS_NOT_FOUND`、Job/Queue/Storage Side Effect なし                   |
| Analysis に Active Document がない               | Stable `ANALYSIS_HAS_NO_DOCUMENTS`、Side Effect なし                           |
| 同じ Analysis の処理が実行中                     | 同じ Active Root Execution を返す Idempotent `202`                             |
| Malformed / password-required PDF                | Non-retryable `FAILED_PARSING`、Sanitized Error                                |
| Permission-encrypted、Password 不要で抽出可能    | 通常 PDF と同じ Resource/Security Limit 内で受け入れる                         |
| Object Storage timeout / Redis temporary failure | Retryable、Durable `QUEUED`/Attempt State から収束                             |
| Empty text page                                  | Page Record を空 Text で保持し、OCR を試みない                                 |
| 全 Page が空 Text                                | Parse Evidence は保持するが、Chunk Step は Stable Non-retryable Failure とする |
| Document deleted during processing               | Commit 前に Active Parent を再確認し、派生 Data を反映しない                   |
| Duplicate BullMQ delivery                        | 同じ Job/Attempt Claim または成功済み Skip に収束                              |
| Worker crash after extraction before commit      | 既存成功 Data を壊さず、再 Delivery で再計算/Commit                            |

## Acceptance Criteria

| ID            | Given / When / Then                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PROC-AC-001` | Given Owner の `UPLOADED` Analysis と 1〜3 PDFs、When Process を開始、Then `202` と Durable Execution を返し `PARSING` へ進む                    |
| `PROC-AC-002` | Given Text を含む複数 Page PDF、When Parse 成功、Then 1-based Page Number、Text Hash、正確な Page Count を保存する                               |
| `PROC-AC-003` | Given Text Page と image-only Page の混在、When OCR なしで Parse、Then image-only Page は空 Text の同じ Page Number で保持する                   |
| `PROC-AC-004` | Given Parsed Pages、When Chunk、Then全 Chunk は単一 Page 内、順序安定、元 Page Text へ追跡可能である                                             |
| `PROC-AC-005` | Given 同じ Input/Version の二重 Delivery と Manual Re-run、When 完了、Then Page/Chunk Set と成功 Job は重複しない                                |
| `PROC-AC-006` | Given Retryable Storage Failure、When 3 Attempt 以内に回復、Then Sanitized Attempt History を保持して同じ Execution が成功する                   |
| `PROC-AC-007` | Given Malformed/Encrypted/Limit-over PDF、When Parse、Then Non-retryable Failure と正しい Analysis Failure Status を保存し部分 Data を公開しない |
| `PROC-AC-008` | Given Owner A/B、When B が A の Process/Status を操作、Then Stable Not Found で DB/Queue/Storage Side Effect がない                              |
| `PROC-AC-009` | Given Direct cross-owner Page/Chunk Insert、When PostgreSQL に保存、Then Composite FK が拒否する                                                 |
| `PROC-AC-010` | Given Worker Crash、Redis Dispatch Failure、Repeated Scan、When System が回復、Then Durable State から一つの結果へ収束する                       |
| `PROC-AC-011` | Given malicious PDF Text/Metadata、When Parse/Log、Then Script/Network を実行せず Sensitive/Full Content を Log しない                           |
| `PROC-AC-012` | Given Parse/Chunk 成功、When Phase 3 Boundary に到達、Then後続 Phase が二重処理なしで継続でき、Status の意味が User/API/DB で一致する            |
| `PROC-AC-013` | Given Permission-encrypted だが Password 不要で安全に Text 抽出可能な PDF、When Parse、Then通常 PDF と同じ Security/Resource Limit 内で処理する  |

## Open Questions

| ID           | Question                                                                         | Impact                                    | Status                                                     |
| ------------ | -------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `PROC-Q-001` | 処理開始を明示的 `POST .../process` とするか、最初の Finalize 後に自動開始するか | API / User が最大 3 PDFs を揃える Flow    | `Resolved: explicit POST`                                  |
| `PROC-Q-002` | Phase 3 単独完了後の Analysis Status をどう表現するか                            | Status Machine / Phase 4 Handoff          | `Resolved: READY_FOR_EMBEDDING`                            |
| `PROC-Q-003` | Parser/Chunker の Resource Limit と Chunk Size/Overlap の初期値を何にするか      | Security / Retrieval Quality / Dependency | `Resolved: approved limits + character chunks`             |
| `PROC-Q-004` | Section Detection を Phase 3 P0 に含める粒度                                     | Scope / Metadata Quality                  | `Resolved: deterministic heuristic`                        |
| `PROC-Q-005` | User-facing Job List を Phase 3 に含めるか、Analysis Detail Status のみとするか  | Public API / Information Exposure         | `Resolved: no job list`                                    |
| `PROC-Q-007` | Permission-encrypted PDF の受入境界                                              | Compatibility / Parsing Failure Semantics | `Resolved: accept when no password/decryption is required` |

## Dependencies

- Approved PDF Upload Specification
- Verified Analysis Management / Authentication / Owner-scoped Data Access
- `@stocklens/object-storage`
- PostgreSQL、Redis/BullMQ、Private MinIO/S3
- Approved Job Re-run Specification
- `docs/architecture.md`、`docs/database-design.md`、`docs/security.md`、`docs/testing-strategy.md`
