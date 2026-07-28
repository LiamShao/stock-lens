# PDF Upload Technical Plan

## Metadata

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| Related Spec | `specs/features/pdf-upload/spec.md`     |
| Plan status  | `Implementing — PDF-TASK-004 completed` |
| Last updated | `2026-07-28`                            |

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

主な Stable Error は `ANALYSIS_NOT_FOUND`、`DOCUMENT_UPLOAD_NOT_FOUND`、`DOCUMENT_LIMIT_EXCEEDED`、`INVALID_PDF`、`UPLOAD_EXPIRED`、`DUPLICATE_DOCUMENT`、`STORAGE_VALIDATION_FAILED` です。Validation Error は共通 `VALIDATION_ERROR` を使用します。

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
- Upload URL、Credential、Authorization、Full Object Content、Full PDF Text は Log に記録しません。

## Dependencies

実装時に S3-compatible Operation と Presigning のため AWS SDK v3 の最小 Package を追加する予定です。API から Cleanup Job を発行するため `bullmq` も API Dependency に追加します。追加時は Lockfile と README に理由を記録します。

## Test Strategy

| Acceptance Criterion       | Level                     | Planned Evidence                                                        |
| -------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| `PDF-AC-001`〜`PDF-AC-004` | Unit + HTTP Integration   | Start Validation、Presign Constraint、Limit、Extension/MIME/Size        |
| `PDF-AC-005`, `PDF-AC-007` | Storage Integration       | MinIO Object の Header/Size/SHA 検証と Finalize                         |
| `PDF-AC-006`               | HTTP + PostgreSQL         | Bearer Owner A/B の Cross-user Start/Finalize/List/Delete               |
| `PDF-AC-008`               | HTTP + Worker Integration | Soft Delete、Cleanup Enqueue、Retry、Object Not Found Idempotency       |
| Concurrency / Idempotency  | PostgreSQL Integration    | Concurrent Start/Finalize/Delete、Repeated Finalize、3 File Reservation |

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
