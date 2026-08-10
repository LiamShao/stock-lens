# PDF Upload Technical Plan

## Metadata

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| Related Spec | `specs/features/pdf-upload/spec.md`     |
| Plan status  | `Implementing — PDF-TASK-014 completed` |
| Last updated | `2026-08-10`                            |

## Approach

- Analysis Management API を先に実装し、Authenticated Owner が作成した Active Analysis を Upload Parent とします。
- API は File 本体を受け取らず、`DocumentUpload` Session と 5 分間の Presigned PUT URL を発行します。
- Client PUT 後の Finalize で API が Object を Streaming Read し、Actual Size、SHA-256、`%PDF-` Header、Metadata を検証します。
- Valid Object は Serializable Transaction 内で Active Duplicate と 3 File Limit を再確認し、`Document` を作成して Session を `COMPLETED` にします。
- Invalid、Expired、Deleted Object は BullMQ Cleanup Job に渡し、Stable Idempotency Key と Retry History を保存します。
- S3-compatible Interface と MinIO/AWS S3 Adapter は API と Worker から再利用できる Internal Package に置きます。

## Affected Files

| Area            | Files / Directory                             | Change                                                     |
| --------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Shared Contract | `packages/shared/src/`                        | Zod Request/Response Schema、Enum、Public Type             |
| Object Storage  | New internal package under `packages/`        | S3-compatible Interface、Presign、Stream、Metadata、Delete |
| API             | New `apps/api/src/documents/` module          | Controller、Service、OpenAPI、Stable Error                 |
| Data Access     | `apps/api/src/database/`                      | Upload Session/Document Repository、Serializable Finalize  |
| Database        | `prisma/schema.prisma`, new migration         | `DocumentUpload`、Status、Relation、Index、Constraint      |
| Worker          | `apps/worker/src/`                            | Idempotent Object Cleanup Processor                        |
| Configuration   | API/Worker Environment Schema                 | Private Bucket、Endpoint、Region、Credential、TTL          |
| Tests           | API Unit/Integration、Worker Unit/Integration | Validation、Authorization、Storage、Concurrency、Cleanup   |
| Documentation   | API/Database/Security/Architecture docs       | Approved Contract と Operational Boundary                  |
| SDD             | PDF Verification、Traceability、Deviation     | Acceptance Evidence と残存 Risk                            |

## Proposed API Changes

Base Path は `/api` です。すべて Bearer Authentication を必須とし、`ownerId` は Token から導出します。

| Method   | Path                                                        | Purpose                               |
| -------- | ----------------------------------------------------------- | ------------------------------------- |
| `POST`   | `/analyses/:analysisId/document-uploads`                    | Session 作成と Presigned PUT URL 発行 |
| `POST`   | `/analyses/:analysisId/document-uploads/:uploadId/presign`  | Active Session の URL 再発行          |
| `POST`   | `/analyses/:analysisId/document-uploads/:uploadId/finalize` | Trusted Validation と Document 作成   |
| `GET`    | `/analyses/:analysisId/documents`                           | Active Finalized Document 一覧        |
| `DELETE` | `/analyses/:analysisId/documents/:documentId`               | Soft Delete と Object Cleanup Queue   |

Start Request は `originalName`、`mimeType`、`sizeBytes`、Lowercase Hex `sha256`、Optional `documentType` を受け取ります。Start Response は Session Metadata と PUT URL、Signed Headers、Expiry を返し、Bucket、Storage Key、Credential は返しません。

Finalize は初回成功時に Finalized Document を返します。Completed Session への同一 Finalize は同じ Document を返す Idempotent Operation とし、Rejected/Expired Session は Stable Conflict Error とします。

Document List は最大 3 件の Active Finalized Document を `{ items: DocumentResource[] }` で返します。Document Delete は `204 No Content` とし、Soft Delete と Durable Cleanup Execution を同一 Serializable Transaction に保存してから Redis Dispatch を試行します。

主な Stable Error は `ANALYSIS_NOT_FOUND`、`DOCUMENT_NOT_FOUND`、`DOCUMENT_UPLOAD_NOT_FOUND`、`DOCUMENT_UPLOAD_NOT_ACTIVE`、`DOCUMENT_LIMIT_EXCEEDED`、`INVALID_PDF`、`UPLOAD_EXPIRED`、`DUPLICATE_DOCUMENT`、`OBJECT_STORAGE_UNAVAILABLE`、`STORAGE_VALIDATION_FAILED` です。Validation Error は共通 `VALIDATION_ERROR` を使用します。

## Database Changes

- `DocumentUploadStatus`: `PENDING`、`VALIDATING`、`COMPLETED`、`REJECTED`、`EXPIRED`
- `DocumentUpload`: Owner/Analysis、Declared Metadata、Claimed SHA-256、Private Storage Location、Status、Expiry、Failure、Finalized Document Relation、Timestamp
- `DocumentUpload(ownerId, analysisId)` から `Analysis(ownerId, id)` への Composite FK
- Finalized Document との One-to-one Constraint
- Active Session Cleanup 用 `(status, expiresAt)`、Ownership/List 用 `(ownerId, analysisId, status)` Index
- First Document Finalize 時の `DRAFT` → `UPLOADED` 遷移は `ANALYSIS-DEV-001` の承認と Migration に依存
- Cleanup を `JobExecution` / `JobAttempt` で追跡できるよう Job Step を拡張

Active Document と未期限切れ Upload Session の合計が 3 を超えないよう、Session Create と Finalize の双方を Serializable Transaction + 限定 `P2034` Retry で保護します。

## Security and Failure Handling

- Extension、Declared MIME、Declared Size、SHA-256 Format は URL 発行前に検証します。
- Presigned URL は Private Bucket の単一 Random Key、`application/pdf`、Expected Size、5 分 Expiry に制限します。
- Finalize は Object Storage Metadata を信頼せず、最大 20 MB + 1 byte まで Streaming Read して Actual Size、SHA-256、Header を検証します。
- Original Filename は Sanitized Metadata としてのみ保存し、Storage Key に使用しません。
- Cross-user Analysis/Session/Document は同じ Not Found Response とします。
- Concurrent Finalize、Repeated Finalize、Delete/Finalize Race は Idempotent Result または Stable Conflict に収束させます。
- Validation Failure、Expired Session、Document Delete は Object Cleanup Job を Enqueue し、Object Not Found は成功扱いにします。
- 初回 Presign Failure は Session を `REJECTED` にして予約枠を解放します。再 Presign Failure は `PENDING` を維持して再試行可能にします。
- Upload URL、Credential、Authorization、Full Object Content、Full PDF Text は Log に記録しません。

### TASK-007 / TASK-008 Boundary

- `PDF-TASK-007` は Object Head と Readable Stream から Content Type、Claimed SHA Metadata、Actual Size、SHA-256、先頭 `%PDF-` を検証する Internal Validator を実装します。
- Validator は Full Body を保持せず、最大 20 MB + 1 byte で打ち切り、Invalid Content と Retryable Storage Failure を構造化して区別します。
- Public Finalize Endpoint、`PENDING → VALIDATING` Claim、Document 作成、Duplicate/Limit 再確認、`COMPLETED`/`REJECTED` 永続化、Cleanup Enqueue は一つの整合した Flow として `PDF-TASK-008` で接続します。
- したがって `PDF-TASK-007` 単独では Upload Session Status を変更せず、公開 Finalize Response も追加しません。

### TASK-010 Security Boundary

- Start、Re-presign、Finalize、List、Delete は Repository の Owner Scope が対象を返さない場合、Missing Resource と同一の Stable Not Found に収束させます。Bearer User A/B の HTTP Acceptance Evidence は `PDF-TASK-013` で追加します。
- API Structured Logger は Presigned Upload URL、Storage Bucket/Key、Object Key、Original Filename、Full PDF/Page/Chunk Text、Object Body を Field 名と既知の Response Nesting で Redact します。SHA-256 と Size のような Integrity Metadata は Secret として扱いません。
- 将来の Parse/LLM Pipeline が Raw String を System Instruction として渡さないよう、Shared Package に `source = uploaded-pdf`、`trust = untrusted`、`role = user` を固定した Provider-agnostic Context Builder を追加します。
- Context Builder は Document/Page/Chunk Metadata を検証し、PDF Text 内の Delimiter/Markup を Escape して単一の明示的な Untrusted Data Block に閉じ込めます。Prompt Injection 文字列を含む Regression Test を追加します。
- 本 Task は PDF Parsing、Prompt Template、LLM Provider Call を実装しません。実際の Provider Adapter は Phase 4 でこの Boundary を必須入力として接続し、End-to-end Prompt Injection Evaluation を追加します。

### TASK-011 HTTP Verification Boundary

- Nest Testing Module は `OBJECT_STORAGE` を deterministic fake に置換し、Bearer Guard、Global Zod Pipe、Controller、Service、Owner-scoped Repository、PostgreSQL Migration/Constraint を実経路で検証します。
- Valid Start は `201`、Storage-safe Session Response、Expected Size/MIME/SHA Header、5 分の Presigned Expiry、Database `PENDING` Record、Random Storage Key を検証します。
- 3 Active Upload Slot の後の 4 件目は `DOCUMENT_LIMIT_EXCEEDED` に収束し、`DocumentUpload` Record と Presign Call が増えないことを検証します。
- Size 0、20 MB + 1、Invalid Extension/MIME は HTTP `VALIDATION_ERROR` となり、Database Write と Presign Call が発生しないことを検証します。
- Shared Zod Unit Test は 1 byte と 20 MB の inclusive Boundary を受理し、0 byte と 20 MB + 1 を拒否します。
- Fake Storage は HTTP/Application Wiring Evidence に限定し、Header/Object/Finalize の Real Provider Acceptance は `PDF-TASK-012` で MinIO に対して検証します。

### TASK-012 MinIO Verification Boundary

- Official MinIO Image を Testcontainers で Suite ごとに起動し、Test 専用 Private Bucket を Container 内の `mc` で作成します。
- API の Production `S3ObjectStorageAdapter` から発行した URL と Signed Headers を使用して、Node.js Client が実際に PDF Body を PUT します。
- Valid Object は Head Metadata と Finalize 後の `Document`、`DocumentUpload.COMPLETED`、`Analysis.UPLOADED` を PostgreSQL と HTTP Response で検証します。
- Invalid `%PDF-` Header は Real MinIO Stream から `INVALID_PDF` に収束し、Document を作成せず、`REJECTED` Session と Durable `QUEUED OBJECT_CLEANUP` を保存することを検証します。
- Redis/BullMQ Worker による実 Object Delete は `PDF-TASK-014` で検証します。`PDF-TASK-012` 単独では Test Object を Teardown で削除します。

### TASK-013 HTTP Authorization Boundary

- Bearer User A が所有する Analysis、Upload Session、Finalized Document に対し、Bearer User B から Start、Re-presign、Finalize、List、Delete を HTTP 実経路で試行します。
- Cross-user Start は Missing Analysis と同じ `404 ANALYSIS_NOT_FOUND` とし、`DocumentUpload` Record と Presign Call を作成しません。
- Cross-user Re-presign/Finalize は `404 DOCUMENT_UPLOAD_NOT_FOUND` とし、Presign、Head、Get/Stream、Session Status、Document Persist に Side Effect を発生させません。
- Cross-user List/Delete は `404 ANALYSIS_NOT_FOUND` とし、Document Metadata を返さず、Soft Delete と `OBJECT_CLEANUP` JobExecution を作成しません。
- Owner A の同一 Flow は成功することも同じ Test で確認し、Guard だけでなく Authenticated User ID の Controller → Service → Repository 伝播を検証します。

## Object Cleanup Queue Contract

- Queue 名は `object-cleanup`、Job 名は `delete-object` とし、Queue Payload は `jobExecutionId` UUID のみに限定します。Bucket、Object Key、Owner ID は Redis に複製しません。
- `JobExecution.step = OBJECT_CLEANUP` とし、`documentId` または `documentUploadId` のちょうど一方を Target とします。Database `CHECK` と Owner/Analysis Composite Foreign Key で Target を強制します。
- API は Storage 操作前に Stable Idempotency Key で `JobExecution` を Upsert し、その後 BullMQ へ Dispatch します。Redis Failure 時も `QUEUED` Record を残します。
- Worker は 60 秒ごとに未 Dispatch の `QUEUED` Cleanup を再送します。BullMQ Job ID は `JobExecution.id` とし、重複 Dispatch を同じ Job に収束させます。
- Automatic Retry は最大 3 回の Exponential Backoff とし、各試行を `JobAttempt` に保存します。最終失敗後は既存 BullMQ Job の `retry()` と Database Status Reset により手動再実行できます。
- Object Storage の Delete は Missing Object を含め成功として扱います。Provider Error Detail は保存・出力せず、Stable `OBJECT_STORAGE_DELETE_FAILED` のみを記録します。

## Dependencies

S3-compatible Operation と Presigning のため AWS SDK v3 の最小 Package を `@stocklens/object-storage` に追加済みです。`PDF-TASK-006` では API から同 Package を再利用する Workspace Dependency を追加しました。Cleanup Job 発行用の `bullmq` も API Dependency として追加済みです。

## Test Strategy

| Acceptance Criterion       | Level                     | Planned Evidence                                                    |
| -------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `PDF-AC-001`〜`PDF-AC-004` | Unit + HTTP Integration   | Start Validation、Presign Constraint、Limit、Extension/MIME/Size    |
| `PDF-AC-005`, `PDF-AC-007` | Storage Integration       | MinIO Object の Header/Size/SHA 検証と Finalize                     |
| `PDF-AC-006`               | HTTP + PostgreSQL         | Bearer Owner A/B の Cross-user Start/Finalize/List/Delete           |
| `PDF-AC-008`               | HTTP + Worker Integration | Soft Delete、Cleanup Enqueue、Object Delete/Not Found Idempotency   |
| Concurrency / Idempotency  | PostgreSQL Integration    | Concurrent Start/Finalize/Delete、Cleanup Retry、3 File Reservation |

Testcontainers PostgreSQL と隔離 MinIO-compatible Storage を使用し、Mock だけでは Integration Acceptance を Passed にしません。

## Rollout and Rollback

1. Analysis Management と `DRAFT` Status Migration を先に Deploy します。
2. `DocumentUpload` Schema と Storage/Queue Configuration を Deploy します。
3. Cleanup Worker を起動後に Upload Endpoint を有効化します。
4. Rollback 時は新規 Upload 発行を停止し、既存 Cleanup Job を Drain してから Application を戻します。Migration は Data Loss を伴う Down Migration を自動実行しません。

## Risks and Decisions

- `ANALYSIS-DEV-001` の `DRAFT` 追加は 2026-07-24 に承認され、Analysis Management Feature で実装します。
- Exact API Path/Schema は 2026-07-24 に承認済みです。
- S3 Presigned PUT の Content-Length Enforcement は Provider Compatibility を Integration Test で確認し、保証できない場合も Finalize の Trusted Size Check を必須とします。
- Cleanup Queue が利用不能な場合は Upload/Delete Outcome と Cleanup Pending State を失わず、再実行可能にします。
