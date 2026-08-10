# PDF Upload Verification

## Metadata

| Field               | Value                               |
| ------------------- | ----------------------------------- |
| Related Spec        | `specs/features/pdf-upload/spec.md` |
| Verification status | `Partial`                           |
| Verified at         | `Partial verification 2026-08-10`   |

## Environment

- `PDF-TASK-003` の Database Foundation、`PDF-TASK-004` の S3-compatible Storage Adapter、`PDF-TASK-005` の Cleanup Queue/Worker/Retry Tracking、`PDF-TASK-006` の Upload Start/Presign API、`PDF-TASK-007` の Trusted Streaming Validator、`PDF-TASK-008` の Transactional Finalize API、`PDF-TASK-009` の Document List/Delete API、`PDF-TASK-010` の Security Boundary を実装済みです。
- `PDF-TASK-011` の Start/Validation HTTP Integration は Testcontainers PostgreSQL と deterministic fake Storage を使用して Passed しました。
- `PDF-TASK-012` は隔離 MinIO、Production S3 Adapter、実 Presigned PUT、Trusted Finalize を Testcontainers PostgreSQL と同じ Suite で自動検証しました。
- `PDF-TASK-013` は Bearer User A/B の Start、Re-presign、Finalize、List、Delete を Guard から PostgreSQL までの HTTP 実経路で自動検証しました。
- `PDF-TASK-014` は Document Delete から Redis/BullMQ、Production S3 Adapter、MinIO Object Delete、Job Attempt Success までを実 Worker 経路で自動検証しました。
- Analysis Management Feature と `ANALYSIS-DEV-001` は Verified です。
- Testcontainers PostgreSQL で全 Migration と `DocumentUpload` Constraint を検証済みです。
- Project-owned MinIO に対する Presigned PUT、Head、Streaming Read、Valid/Invalid Finalize と Redis/BullMQ Worker Delete は Automated Integration Test 済みです。Concurrency と Automatic Retry Failure Path は `PDF-TASK-015` に残します。

## Acceptance Evidence

| Acceptance Criterion | Evidence                                                          | Result   |
| -------------------- | ----------------------------------------------------------------- | -------- |
| `PDF-AC-001`         | Start HTTP + Production Adapter の Real MinIO Presigned PUT       | `Passed` |
| `PDF-AC-002`         | 4th Slot HTTP、DB Count、No Presign を Testcontainers で検証      | `Passed` |
| `PDF-AC-003`         | Inclusive Unit + 0/20 MB 超 HTTP、No DB/Presign を検証            | `Passed` |
| `PDF-AC-004`         | Invalid Extension/MIME HTTP、No DB/Presign を検証                 | `Passed` |
| `PDF-AC-005`         | Real MinIO Invalid Header Reject、No Document、Durable Cleanup    | `Passed` |
| `PDF-AC-006`         | Bearer A/B Start/Re-presign/Finalize/List/Delete、No Side Effect  | `Passed` |
| `PDF-AC-007`         | Real PUT/Head/Stream、Trusted SHA/Size、Atomic Completed/Uploaded | `Passed` |
| `PDF-AC-008`         | HTTP Delete + PostgreSQL/Redis/BullMQ/MinIO Worker Cleanup        | `Passed` |

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
- Real Infrastructure Integration は Queue Payload が `jobExecutionId` のみであること、BullMQ Job ID、`JobExecution/JobAttempt` の `QUEUED → RUNNING → SUCCEEDED` 結果、MinIO Object Delete を検証しました。
- MinIO Object がすでに存在しない場合も同じ Worker 経路で 1 Attempt の `SUCCEEDED` に収束することを検証しました。

## Upload Start and Presign API Evidence

- Strict Shared Zod Schema は 1〜20 MB、case-insensitive `.pdf`、exact `application/pdf`、lowercase SHA-256、safe Filename、Optional Document Type を URL 発行前に検証します。
- `DocumentUploadRepository.createPending` は Owner-scoped Active Analysis を確認し、Active Document、未期限 `PENDING`、実行中 `VALIDATING` の合計 3 枠を Serializable Transaction で予約します。
- Object Key は Owner/Analysis/Upload UUID/Random UUID から生成し、Filename を含めません。API Service は Bucket 名だけを受け取り、Response は Bucket、Key、Credential を返しません。
- Start と Active `PENDING` Session の再 Presign Endpoint、Bearer Guard、Zod Path/Body Pipe、Concrete OpenAPI Success/Error Schema を追加しました。
- 初回 Presign Failure は Stable `OBJECT_STORAGE_UNAVAILABLE` と `REJECTED` Status に収束して枠を解放し、再 Presign Failure は再試行用に `PENDING` を維持します。
- Initial Shared/API Unit Evidence に加え、Start/Validation HTTP Integration は `PDF-TASK-011`、Cross-user HTTP は `PDF-TASK-013` で完了しました。Concurrent Slot Reservation は `PDF-TASK-015` に残ります。

## Upload Start and Validation HTTP Evidence

- `POST /api/analyses/:analysisId/document-uploads` を Bearer Access Token、Global Zod Pipe、Controller、Service、Repository、Testcontainers PostgreSQL の実経路で検証しました。
- Valid Start は `201`、Storage-safe `PENDING` Session、Expected Content Length/Type/SHA Headers、5 分 Expiry、Owner-scoped Database Record、Filename を含まない Random Storage Key を返しました。
- 3 Active Upload 後の 4 件目は `409 DOCUMENT_LIMIT_EXCEEDED` となり、`DocumentUpload` は 3 件、`Document` は 0 件、Presign Call は 3 回のまま増えませんでした。
- Size 0 と 20 MB + 1、Invalid Extension/MIME は `400 VALIDATION_ERROR` となり、Database Write と Presign Call は 0 でした。
- Shared Schema Unit Test は 1 byte と 20 MB を Inclusive に受理し、既存 Matrix と合わせて Boundary を検証しました。
- `PDF-TASK-011` の Storage は deterministic fake でしたが、Real MinIO Presign/PUT/Finalize Acceptance は `PDF-TASK-012` で補完しました。

## MinIO Storage Integration Evidence

- Official MinIO Image と専用 Private Bucket を Testcontainers で隔離起動し、Production `S3ObjectStorageAdapter` を Nest Application から変更せず使用しました。
- API Start Response の実 Presigned URL と `Content-Length`、`Content-Type`、SHA Metadata Header を使用した PUT は MinIO で `200` となりました。
- Valid `%PDF-` Object は Head Metadata、Streaming Body、Actual Size、Actual SHA-256 を通過し、HTTP Finalize が `Document` を返しました。
- PostgreSQL は `DocumentUpload.COMPLETED`、Trusted `Document.sha256/sizeBytes/uploadedAt`、`Analysis.UPLOADED` を同一 Flow の結果として保持しました。
- Invalid Header Object は PUT 自体が成功しても Finalize が `422 INVALID_PDF` となり、Document を作成せず `REJECTED / INVALID_PDF_HEADER` と Durable `QUEUED OBJECT_CLEANUP` を保存しました。
- `PDF-TASK-012` の Test Teardown は生成 Object を削除し、`PDF-TASK-014` は同じ Production Adapter と隔離 MinIO に対する Redis/BullMQ Worker Delete を自動検証しました。

## Trusted Streaming Validation Evidence

- `PdfObjectValidator` は Object Head の exact `application/pdf`、Content Length、Signed SHA Metadata を Expected Session Metadata と照合します。
- Object Body は Buffer 全体を保持せず `Readable` を逐次処理し、Actual Size と SHA-256 を Trusted Server-side Code で再計算します。
- `%PDF-` は複数 Chunk に分割された場合も先頭 5 byte を検証し、不一致時は Full Body を読まず Stream を破棄します。
- 20 MB + 1 byte を検出した時点で Stream を破棄します。Stream Size/SHA と Head Metadata のどちらか一方だけを信頼しません。
- Missing Object、Head/Get/Stream Error は Provider Detail を含まない Retryable `storage-failure`、Content/Header/Size/SHA Mismatch は `invalid` として区別します。
- Validator Unit 12 Tests は Valid Chunked Stream、Head Metadata Matrix、Invalid Header、Actual Size/SHA Mismatch、Oversize Cutoff、Missing/Provider/Stream Failure を検証します。
- Public Finalize、Status Transition、Document Persist、Reject/Cleanup への接続は `PDF-TASK-008`、Automated MinIO Acceptance は `PDF-TASK-012` で完了しました。

## Transactional Finalize Evidence

- Owner-scoped `POST /api/analyses/:analysisId/document-uploads/:uploadId/finalize` と storage-safe `DocumentResource` OpenAPI Schema を追加しました。
- `PENDING → VALIDATING` Claim、Retryable Storage Failure の `VALIDATING → PENDING` 復帰、Expired/Invalid/Duplicate/Limit の終端 Status を実装しました。
- Invalid、Expired、Duplicate、Limit は Session State と Durable `OBJECT_CLEANUP` JobExecution を同一 Serializable Transaction に保存し、Redis Dispatch Failure 時も Worker の Pending Scan で回復できます。
- Valid Object は Active Duplicate SHA と 3 Document Limit を再確認し、Document、Upload `COMPLETED` Relation、`uploadedAt`、Analysis `DRAFT → UPLOADED` を同一 Transaction に保存します。
- Completed Session の Repeat Finalize は Storage を再読込せず同じ Document を返します。Storage Failure は Provider Detail を返さず `STORAGE_VALIDATION_FAILED` に収束します。
- API Unit Test は Valid/Repeated/Invalid/Storage Failure/Duplicate/Limit/Expired/Inactive Mapping を検証しました。PostgreSQL Integration Test は Atomic Complete、Idempotent Repeat、Reject/Cleanup、Duplicate、Limit、Expired を検証しました。
- HTTP Bearer A/B は `PDF-TASK-013`、MinIO Acceptance は `PDF-TASK-012` で完了しました。Concurrent Finalize は `PDF-TASK-015` に残ります。

## Document List and Delete Evidence

- Owner-scoped `GET /api/analyses/:analysisId/documents` は最大 3 件の Active Finalized Document を `{ items }` で返し、Bucket、Storage Key、Owner ID を公開しません。
- Owner-scoped `DELETE /api/analyses/:analysisId/documents/:documentId` は `204 No Content` とし、Document Soft Delete と Stable `OBJECT_CLEANUP` JobExecution を同一 Serializable Transaction に保存します。
- Redis Queue は Cleanup Dispatch が必要になるまで接続せず、Dispatch Failure 時も API Delete は Durable `QUEUED` Record を保持して Worker Pending Scan から回復できます。
- Missing/Cross-user Analysis は `ANALYSIS_NOT_FOUND`、Owned Analysis 内の Missing/Cross-analysis/Deleted Document は `DOCUMENT_NOT_FOUND` に収束します。
- Shared Contract 3 Tests と API Service 7 Tests は UUID Path、3 Document Response Limit、Storage-safe Response、Not Found Mapping、Persist-before-dispatch、Redis Failure を検証しました。
- PostgreSQL Integration Test は Finalized/Active Filter、Cross-user List/Delete、Soft Delete、Stable Cleanup Idempotency、Repeated Delete を検証しました。HTTP Bearer A/B は `PDF-TASK-013`、Real Redis/BullMQ/MinIO Worker Delete は `PDF-TASK-014` で完了しました。
- Owner の HTTP Delete 後に List から消えること、Durable `QUEUED` Execution と最小 Queue Payload が作られること、Worker が MinIO Object を削除して Execution/Attempt を Sanitized `SUCCEEDED` にすることを一つの実経路で検証しました。

## Security Boundary Evidence

- Start、Re-presign、Finalize、List、Delete は Owner-scoped Repository Result を Stable `ANALYSIS_NOT_FOUND`、`DOCUMENT_UPLOAD_NOT_FOUND`、`DOCUMENT_NOT_FOUND` に収束させ、Service Unit Test と Bearer User A/B HTTP Acceptance を `PDF-SEC-006` に紐付けました。
- Cross-user Start は Upload/Presign を作成せず、Re-presign/Finalize は Presign/Head/Stream/Status/Document を変更せず、List/Delete は Metadata、Soft Delete、Cleanup Job を発生させないことを PostgreSQL と Mock Call Count で確認しました。
- Fastify/Pino Redaction は Presigned Upload URL、Storage Bucket/Key、Object Key、Original Filename、Full PDF/Page/Chunk Text、Object Body を既知の Nested Path でも Redact します。
- Emitted JSON Log Regression Test は上記 Secret/Sensitive Value が Serialized Log に残らないことを検証しました。
- `@stocklens/shared` の `buildUntrustedPdfContext` は入力 Metadata を Zod で検証し、`source: uploaded-pdf`、`trust: untrusted`、`role: user`、`instructionsAllowed: false` を固定します。
- Uploaded Text 内の偽 `</untrusted_pdf_content>`、`<system>`、特殊文字を Escape し、一つの Untrusted Data Block に閉じ込める Unit Test を追加しました。
- Parse/LLM Provider は未実装のため、`PDF-SEC-007` の Provider 接続と End-to-end Prompt Injection Evaluation は Phase 4 まで Partial です。

## Quality Gates

| Command                 | Result                                 |
| ----------------------- | -------------------------------------- |
| `pnpm format:check`     | Passed                                 |
| `pnpm spec:check`       | Passed — 5 Features / 68 Requirements  |
| `pnpm db:validate`      | Passed                                 |
| `pnpm db:generate`      | Passed                                 |
| `pnpm lint`             | Passed — Full Workspace                |
| `pnpm typecheck`        | Passed — Full Workspace                |
| `pnpm test`             | Passed — Full Workspace 127 Tests      |
| `pnpm test:integration` | Passed — PostgreSQL/MinIO/Redis 5 / 33 |
| `pnpm build`            | Passed — Full Workspace                |

## Deviations and Residual Risks

- `ANALYSIS-DEV-001` — Pre-upload Analysis 用 `DRAFT` Status は実装・検証済みです。
- `OWN-DEV-004` — Analysis と Document の Bearer User A/B HTTP Verification が完了し、2026-08-10 に解消しました。
- Exact API Path/Schema と AWS SDK/BullMQ Dependency は Technical Plan として承認済みです。AWS SDK Storage Adapter と Cleanup Queue Dependency は実装済みです。
- Database Constraint は Defense-in-depth です。3 File Limit、Duplicate 判定、Trusted Validator の Finalize Service 接続と Real MinIO は検証済みですが、Concurrent Finalize は未検証です。
- MinIO Storage と Redis/BullMQ を含む実 Cleanup Worker Acceptance は Automated Test で Passed しました。Automatic Retry Failure Path、Concurrent Finalize/Delete、Orphan Expiry は `PDF-TASK-015` に残ります。
- Private Bucket Provisioning、Browser CORS と Production IAM Policy は本 Task の Adapter Scope 外です。Upload HTTP Integration と Deployment Configuration で検証が必要です。

## Conclusion

PDF Upload Spec、7 Decisions、Technical Plan と Analysis Management Dependency は Approved/Verified です。Database Foundation、Object Storage Adapter、Cleanup Queue/Worker、Upload Start/Presign API、Trusted Streaming Validator、Transactional Finalize API、Document List/Delete API は実装済みで、Real MinIO Storage、Cross-user HTTP、Redis/BullMQ Cleanup Acceptance も Passed しました。Concurrency/Retry/Orphan Expiry の Evidence が完了するまで Feature 全体は `Partial` とします。
