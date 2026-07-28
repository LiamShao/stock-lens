# PDF Upload Verification

## Metadata

| Field               | Value                               |
| ------------------- | ----------------------------------- |
| Related Spec        | `specs/features/pdf-upload/spec.md` |
| Verification status | `Partial`                           |
| Verified at         | `Partial verification 2026-07-28`   |

## Environment

- `PDF-TASK-003` の Database Foundation と `PDF-TASK-004` の S3-compatible Storage Adapter を実装済みです。Queue、Upload API、Finalize Service、Cleanup Worker は未実装です。
- Analysis Management Feature と `ANALYSIS-DEV-001` は Verified です。
- Testcontainers PostgreSQL で全 Migration と `DocumentUpload` Constraint を検証済みです。
- Project-owned MinIO に対する Presigned PUT、Head、Streaming Read、Delete の Manual Smoke Test は成功しました。Automated MinIO Integration と Redis/BullMQ Integration は未実施です。

## Acceptance Evidence

| Acceptance Criterion | Evidence                                                   | Result    |
| -------------------- | ---------------------------------------------------------- | --------- |
| `PDF-AC-001`         | Presign Primitive は検証済み、Upload Start 未実装          | `Partial` |
| `PDF-AC-002`         | 3 File Limit/Concurrency Test 未実装                       | `Blocked` |
| `PDF-AC-003`         | DB Size Boundary は Passed、Upload Start 未実装            | `Partial` |
| `PDF-AC-004`         | Extension/MIME Validation Test 未実装                      | `Blocked` |
| `PDF-AC-005`         | Invalid Header + Cleanup Integration 未実装                | `Blocked` |
| `PDF-AC-006`         | DB Composite FK は Passed、HTTP Test 未実装                | `Partial` |
| `PDF-AC-007`         | Streaming Read は検証済み、Finalize Validation 未実装      | `Partial` |
| `PDF-AC-008`         | S3 Delete は検証済み、Document Delete/Cleanup Queue 未実装 | `Partial` |

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

## Quality Gates

| Command                 | Result                                              |
| ----------------------- | --------------------------------------------------- |
| `pnpm format:check`     | Passed                                              |
| `pnpm spec:check`       | Passed — 5 Features / 68 Requirements               |
| `pnpm db:validate`      | Passed                                              |
| `pnpm lint`             | Passed — Full Workspace                             |
| `pnpm typecheck`        | Passed — Full Workspace                             |
| `pnpm test`             | Passed — API 44、Object Storage 13、Web 1、Worker 3 |
| `pnpm test:integration` | Passed — PostgreSQL 3 Suites / 17 Tests             |
| `pnpm build`            | Passed — Full Workspace                             |

## Deviations and Residual Risks

- `ANALYSIS-DEV-001` — Pre-upload Analysis 用 `DRAFT` Status は実装・検証済みです。
- `OWN-DEV-004` — Analysis HTTP は検証済みです。Document Upload/List/Delete HTTP は本 Feature の実装まで Blocked です。
- Exact API Path/Schema と AWS SDK/BullMQ Dependency は Technical Plan として承認済みです。AWS SDK Storage Adapter は実装済みで、API の BullMQ Dependency は `PDF-TASK-005` まで未追加です。
- Database Constraint は Defense-in-depth です。3 File Limit、Duplicate 判定、Trusted Object Validation は Service/Storage Integration が必要です。
- MinIO Smoke Test は Adapter の Provider Compatibility Evidence ですが、Automated Test ではありません。`PDF-TASK-012` が完了するまで Storage Acceptance を Passed としません。
- Private Bucket Provisioning、Browser CORS と Production IAM Policy は本 Task の Adapter Scope 外です。Upload HTTP Integration と Deployment Configuration で検証が必要です。

## Conclusion

PDF Upload Spec、7 Decisions、Technical Plan と Analysis Management Dependency は Approved/Verified で、Database Foundation と Object Storage Adapter は実装・部分検証済みです。Cleanup Queue、Upload/Finalize API と Automated End-to-end Acceptance Evidence が完了するまで `Verified` としません。
