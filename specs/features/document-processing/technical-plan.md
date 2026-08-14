# Document Processing Technical Plan

## Metadata

| Field        | Value                                        |
| ------------ | -------------------------------------------- |
| Related Spec | `specs/features/document-processing/spec.md` |
| Plan status  | `Implemented — residual verification gaps`   |
| Last updated | `2026-08-14`                                 |

## Approach

Owner-scoped API が Root `PARSE` Execution を Serializable Transaction で作成し、BullMQ には `jobExecutionId` のみを送ります。Worker は Storage と Database から Input を再解決し、Document ごとの Parse と Chunk を Durable `JobExecution` として実行します。Page Set と Chunk Set はそれぞれ Transaction 内で置換し、Input/Implementation Version を Idempotency Key に含めます。

PDF は 20 MB 上限の Object を Process 専用 Temporary Directory に取得し、Network/Script を無効化した Parser で Page ごとに Text を抽出します。500 Pages、2 MiB/Page、50 MiB/Document、120 Seconds を超える Input は Non-retryable とします。Chunk は単一 Page 内の 1,200 Unicode Characters、150 Character Overlap、Whitespace-aware Boundary です。

PDF Metadata の Encryption Flag 自体は Reject 条件にしません。Password 入力や明示的な復号なしで Parser が安全に Text を抽出できる Permission-encrypted PDF は通常 Input として扱い、Password-required PDF は Stable Non-retryable Parse Failure とします。

## Affected Files

| Area   | Files                                               | Change                                                                           |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Prisma | `prisma/schema.prisma`, migration                   | `READY_FOR_EMBEDDING`、Composite Ownership FK、`JobOperationAudit`               |
| Shared | `packages/shared/src/*`                             | Process API/Queue/Error/Status Contract                                          |
| API    | `apps/api/src/analyses/*`, database/queue providers | Owner-scoped Process Endpoint、Durable Root Job、Dispatch                        |
| Worker | `apps/worker/src/*`                                 | Parser、Section Detector、Chunker、Repositories、Processors、Recovery Dispatcher |
| Tests  | API/Worker/Integration suites                       | Authorization、Limits、Idempotency、Retry、Crash/Redis Recovery                  |
| Docs   | API/Architecture/Database/Security/Testing/Progress | Approved Runtime Contract と Evidence                                            |

## API Changes

- `POST /api/analyses/:analysisId/process` → `202 Accepted`
- Body は受け取らず、Owner は Bearer Access Token から導出します。
- Response は `executionId`, `analysisId`, `status`, `acceptedAt` のみです。
- `AnalysisResource.status` に `READY_FOR_EMBEDDING` を追加します。
- Public Job List/API は追加しません。

## Database Changes

- `AnalysisStatus.READY_FOR_EMBEDDING` を `CHUNKING` と `EMBEDDING` の間へ追加します。
- `DocumentPage(ownerId, documentId)` と `DocumentChunk(ownerId, documentId)` を `Document(ownerId, id)` へ Composite FK で結びます。
- `JobOperationAudit` に Operator、Execution、Action、Before/After Status、Request ID、Timestamp を保存します。
- Manual Re-run Count は Audit Record を Source とし、Execution ごとに最大 5 回を Transaction 内で判定します。

## Security and Failure Handling

- Parser の external fetch/script/action を許可しません。
- Temporary path に Original Filename を使わず、`finally` で削除します。
- Full PDF/Page/Chunk Text、Storage Coordinate、Raw Error を Log/Audit/API に出しません。
- Retryable Storage/Queue Failure と Non-retryable PDF/Limit Failure を分類します。
- Password-required PDF は Non-retryable とし、Permission-encrypted でも Password/復号不要で抽出可能な PDF は同じ Parser Limit 内で受け入れます。
- Parent Active/Owner/Input SHA を Commit 前に再確認します。
- Pending Scanner が Durable `QUEUED` Job を再 Dispatch します。

## Test Strategy

| Requirement                  | Level                               | Evidence                                                 |
| ---------------------------- | ----------------------------------- | -------------------------------------------------------- |
| `PROC-AC-001`, `PROC-AC-008` | HTTP + PostgreSQL                   | Owner A/B Process Start と Side Effect                   |
| `PROC-AC-002`〜`PROC-AC-004` | Unit + MinIO Integration            | Page Extraction、Empty Page、Section、Chunk Traceability |
| `PROC-AC-005`, `PROC-AC-010` | PostgreSQL/Redis/BullMQ Integration | Duplicate Delivery、Crash/Dispatch Recovery              |
| `PROC-AC-006`, `PROC-AC-007` | Worker Unit + Integration           | Retry Classification、Malformed/Password/Limit Failure   |
| `PROC-AC-009`                | PostgreSQL Integration              | Composite Ownership FK Reject                            |
| `PROC-AC-011`                | Security Unit                       | External Resource Disabled、Log Redaction、Temp Cleanup  |
| `PROC-AC-012`                | Integration                         | `READY_FOR_EMBEDDING` Handoff                            |
| `PROC-AC-013`                | Real fixture + Integration          | Permission-encrypted、Password-free Extraction           |

Infrastructure E2E は API Integration Harness の isolated PostgreSQL、Redis/BullMQ、MinIO を再利用します。Test は Presigned PUT と Finalize 後に Process API を呼び、実 `AnalysisProcessingProcessor` を Queue Worker として起動し、Parse Job が作る Durable Chunk Job を同じ Queue で消費します。最終的に Page/Chunk、Attempt History、`READY_FOR_EMBEDDING`、Object Retention を Database/Storage から検証します。CI には最小の deterministic Text PDF を生成し、Local Real IR PDF 自体は追跡しません。

Failure/Recovery E2E は同 Harness で mixed empty page、malformed input、501-page limit、同一 Execution の再 Delivery、Queue Job remove 後の Pending Dispatcher recovery を検証します。20 MB / 50 MiB Text Limit は巨大 Fixture を Repository に追加せず Unit 境界で検証し、Password-required PDF は再配布可能な deterministic Fixture が用意できるまで明示的 Gap とします。

`PROC-TASK-014` では Repository に Binary Fixture を保存せず、Test 内で deterministic Standard Security PDF と malicious Action/URI PDF を生成します。Password-required Input の `PasswordException` → Stable Non-retryable Classification、Parser が Action/URI を実行せず Text を Data として返すこと、Page/Document Text Limit の inclusive boundary、20 MB Stream の destroy、Sanitized Failure Code だけが Repository に渡ることを Unit Test で固定します。Limit 判定は Production 値を変えず Pure Helper へ切り出し、巨大な 50 MiB Fixture と Test Memory Spike を避けます。

## Rollout and Rollback

- Enum Value、Audit Table、Composite FK Migration を API/Worker より先に適用します。
- API/Worker は新 Status を理解する Version として同時 Deploy します。
- Rollback 時も Enum Value と Audit Records は保持し、旧 Binary が未知 Status を扱えないため Database-first Rollback は行いません。

## Risks and Decisions

- PDF Parser Dependency は Security Update を追跡し、Lockfile を固定します。
- Character Chunking は Provider Token Count と一致しません。Phase 4 で `tokenCount` を計算しても Chunk Boundary は Version を変えない限り保持します。
- Resource Limit は User 承認済みであり、変更時は Spec Update が必要です。
