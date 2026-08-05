# PDF Upload Verification

## Metadata

| Field               | Value                               |
| ------------------- | ----------------------------------- |
| Related Spec        | `specs/features/pdf-upload/spec.md` |
| Verification status | `Partial`                           |
| Verified at         | `Partial verification 2026-08-05`   |

## Environment

- `PDF-TASK-003` の Database Foundation、`PDF-TASK-004` の S3-compatible Storage Adapter、`PDF-TASK-005` の Cleanup Queue/Worker/Retry Tracking、`PDF-TASK-006` の Upload Start/Presign API、`PDF-TASK-007` の Trusted Streaming Validator を実装済みです。Transactional Finalize Service は未実装です。
- Analysis Management Feature と `ANALYSIS-DEV-001` は Verified です。
- Testcontainers PostgreSQL で全 Migration と `DocumentUpload` Constraint を検証済みです。
- Project-owned MinIO に対する Presigned PUT、Head、Streaming Read、Delete の Manual Smoke Test は成功しました。Cleanup Processor/Dispatch/Retry は Unit Test 済みですが、Automated MinIO/Redis/BullMQ Integration は `PDF-TASK-014` まで未実施です。

## Acceptance Evidence

| Acceptance Criterion | Evidence                                                                   | Result    |
| -------------------- | -------------------------------------------------------------------------- | --------- |
| `PDF-AC-001`         | Start/Presign Service Unit は Passed、HTTP/Storage Integration は未実施    | `Partial` |
| `PDF-AC-002`         | Serializable Reservation 実装済み、PostgreSQL Concurrency Test は未実施    | `Partial` |
| `PDF-AC-003`         | DB Boundary と Shared Zod Size Boundary Unit は Passed、HTTP は未実施      | `Partial` |
| `PDF-AC-004`         | Extension/MIME/SHA/Filename Zod Unit は Passed、Header は Finalize 待ち    | `Partial` |
| `PDF-AC-005`         | Invalid Header Unit は Passed、Reject/Cleanup Integration は未実装         | `Partial` |
| `PDF-AC-006`         | DB Composite FK と Owner-scoped Service/Repository 実装済み、HTTP は未実施 | `Partial` |
| `PDF-AC-007`         | Head/Actual Size/SHA Streaming Unit は Passed、Document 永続化は未実装     | `Partial` |
| `PDF-AC-008`         | S3 Delete と Cleanup Queue/Worker は検証済み、Document Delete API は未実装 | `Partial` |

## Database Foundation Evidence

- `DocumentUploadStatus` と `DocumentUpload` Entity を Prisma Schema と Migration に追加しました。
- Owner/Analysis Composite FK と Finalized Document Composite FK/Unique Constraint を追加しました。
- 1〜20 MB、Lowercase SHA-256、Expiry、Required Metadata、Completion/Failure Lifecycle を Database `CHECK` で強制します。
- Cleanup、Ownership/List、Duplicate Lookup 用 Index を追加しました。
- `owner-scoped-repositories.integration-spec.ts` で Cross-owner Insert、Constraint、Index、One-to-one Finalization、Cross-analysis Finalization Reject を実 PostgreSQL 上で検証しました。

## Object Storage Foundation Evidence

- `@stocklens/object-storage` に API/Worker 共通の `ObjectStorage` Interface と S3/MinIO Adapter を追加しました。
- Object Key は Owner/Analysis/Upload Session Prefix と Random UUID で構成し、Original Filename を含めません。
- Presigned PUT は最大 300 秒、1〜20 MB、`application/pdf`、Claimed SHA-256 Metadata に制限します。
- `Content-Length`、`Content-Type`、SHA Metadata が実際の AWS Signature Header に含まれることを Unit Test で検証しました。
- Head、Node.js Readable Stream、Delete、Missing Object の `null` Mapping を Unit Test で検証しました。
- Project-owned MinIO で PUT `200`、Head Metadata、Stream Body、Delete、Delete 後 Not Found を確認し、Temporary Object を削除しました。
- Automatic Empty-body CRC32 Presign を避けるため AWS SDK Request Checksum は `WHEN_REQUIRED` とし、Finalize 時の Trusted SHA-256 再計算を必須とします。

## Object Cleanup Queue Evidence

- Shared Zod Contract は Queue Payload を `jobExecutionId` UUID のみに制限し、Storage Coordinate を Redis Payload に含めません。
- `OBJECT_CLEANUP` JobStep、`documentUploadId` Relation、Owner/Analysis Composite Foreign Key、Cleanup Target `CHECK` を Migration に追加しました。
- API Publisher は `JobExecution` を先に Upsert し、Redis Failure 時も `QUEUED` State を保持します。
- Worker は Database から Storage Target を解決し、最大 3 回の Exponential Backoff、Attempt ごとの `JobAttempt`、Sanitized Failure を実装します。
- Startup と 60 秒 Interval で Pending Dispatch を回復し、成功済み実行は再削除せず、最終失敗 Job は明示的に Retry できます。
- Unit Test は Persist-before-dispatch、Redis Failure、成功済み Idempotency、Manual Retry、Delete Success/Failure、Pending Redispatch を検証します。
- PostgreSQL Integration Test に Stable Idempotency Key の一意性と Cleanup Target Constraint の検証を追加し、空 Database への Split Migration とともに Passed しました。

## Upload Start and Presign API Evidence

- Strict Shared Zod Schema は 1〜20 MB、case-insensitive `.pdf`、exact `application/pdf`、lowercase SHA-256、safe Filename、Optional Document Type を URL 発行前に検証します。
- `DocumentUploadRepository.createPending` は Owner-scoped Active Analysis を確認し、Active Document、未期限 `PENDING`、実行中 `VALIDATING` の合計 3 枠を Serializable Transaction で予約します。
- Object Key は Owner/Analysis/Upload UUID/Random UUID から生成し、Filename を含めません。API Service は Bucket 名だけを受け取り、Response は Bucket、Key、Credential を返しません。
- Start と Active `PENDING` Session の再 Presign Endpoint、Bearer Guard、Zod Path/Body Pipe、Concrete OpenAPI Success/Error Schema を追加しました。
- 初回 Presign Failure は Stable `OBJECT_STORAGE_UNAVAILABLE` と `REJECTED` Status に収束して枠を解放し、再 Presign Failure は再試行用に `PENDING` を維持します。
- Shared 11 Tests と API 57 Tests が成功しました。Start/Validation HTTP Integration、Cross-user HTTP、Concurrent Slot Reservation は `PDF-TASK-011`、`PDF-TASK-013`、`PDF-TASK-015` に残ります。

## Trusted Streaming Validation Evidence

- `PdfObjectValidator` は Object Head の exact `application/pdf`、Content Length、Signed SHA Metadata を Expected Session Metadata と照合します。
- Object Body は Buffer 全体を保持せず `Readable` を逐次処理し、Actual Size と SHA-256 を Trusted Server-side Code で再計算します。
- `%PDF-` は複数 Chunk に分割された場合も先頭 5 byte を検証し、不一致時は Full Body を読まず Stream を破棄します。
- 20 MB + 1 byte を検出した時点で Stream を破棄します。Stream Size/SHA と Head Metadata のどちらか一方だけを信頼しません。
- Missing Object、Head/Get/Stream Error は Provider Detail を含まない Retryable `storage-failure`、Content/Header/Size/SHA Mismatch は `invalid` として区別します。
- Validator Unit 12 Tests は Valid Chunked Stream、Head Metadata Matrix、Invalid Header、Actual Size/SHA Mismatch、Oversize Cutoff、Missing/Provider/Stream Failure を検証します。
- Public Finalize、Status Transition、Document Persist、Reject/Cleanup は `PDF-TASK-008`、Automated MinIO Acceptance は `PDF-TASK-012` に残ります。

## Quality Gates

| Command                 | Result                                  |
| ----------------------- | --------------------------------------- |
| `pnpm format:check`     | Passed                                  |
| `pnpm spec:check`       | Passed — 5 Features / 68 Requirements   |
| `pnpm db:validate`      | Passed                                  |
| `pnpm lint`             | Passed — Full Workspace                 |
| `pnpm typecheck`        | Passed — Full Workspace                 |
| `pnpm test`             | Passed — Full Workspace 102 Tests       |
| `pnpm test:integration` | Passed — PostgreSQL 3 Suites / 18 Tests |
| `pnpm build`            | Passed — Full Workspace                 |

## Deviations and Residual Risks

- `ANALYSIS-DEV-001` — Pre-upload Analysis 用 `DRAFT` Status は実装・検証済みです。
- `OWN-DEV-004` — Analysis HTTP は検証済みです。Document Upload/List/Delete HTTP は本 Feature の実装まで Blocked です。
- Exact API Path/Schema と AWS SDK/BullMQ Dependency は Technical Plan として承認済みです。AWS SDK Storage Adapter と Cleanup Queue Dependency は実装済みです。
- Database Constraint は Defense-in-depth です。3 File Limit、Duplicate 判定、Trusted Validator の Finalize Service 接続は Integration が必要です。
- MinIO Smoke Test は Adapter の Provider Compatibility Evidence ですが、Automated Test ではありません。`PDF-TASK-012` が完了するまで Storage Acceptance を Passed としません。
- Private Bucket Provisioning、Browser CORS と Production IAM Policy は本 Task の Adapter Scope 外です。Upload HTTP Integration と Deployment Configuration で検証が必要です。

## Conclusion

PDF Upload Spec、7 Decisions、Technical Plan と Analysis Management Dependency は Approved/Verified で、Database Foundation、Object Storage Adapter、Cleanup Queue/Worker、Upload Start/Presign API、Trusted Streaming Validator は実装・部分検証済みです。Transactional Finalize API、Document Delete 接続と Automated End-to-end Acceptance Evidence が完了するまで `Verified` としません。
