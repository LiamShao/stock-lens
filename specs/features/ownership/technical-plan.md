# Owner-scoped Data Access Technical Plan

## Metadata

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Related Spec | `specs/features/ownership/spec.md` |
| Plan status  | `Implemented`                      |
| Last updated | `2026-08-10`                       |

## Implemented Approach

- `DatabaseModule` が Prisma と Repository Provider を集約します。
- Repository Method は Resource ID と同時に `ownerId` を受け取り、すべての Active Query に含めます。
- Update/Delete は `updateMany` の Count を Success Flag に変換し、Cross-user と Not Found を区別しません。
- Document Create は Transaction 内で Active Parent と Owner を確認します。
- Analysis Soft Delete は所属 Document と同一 Transaction で実行します。

## Affected Files

| Area             | Files                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| DI               | `apps/api/src/database/database.module.ts`, `app.module.ts`, `auth.module.ts` |
| Data Access      | `analysis.repository.ts`, `document.repository.ts`                            |
| Integration Test | `apps/api/test/owner-scoped-repositories.integration-spec.ts`                 |
| Test Config      | `jest.integration.config.cjs`, Root/API `package.json`                        |

## API Changes

Analysis Create/List/Get/Rename/Delete と Document Start/Re-presign/Finalize/List/Delete API は実装済みで、Bearer User A/B の HTTP Authorization を検証しました。

## Database Changes

`Analysis(ownerId, id)` の Unique Candidate Key と `Document(ownerId, analysisId)` の Composite FK を Migration で追加しました。Migration は既存 Owner Mismatch が 1 件でもあれば Fail Fast します。

## Test Strategy

| Requirement                | Evidence                                           | Result   |
| -------------------------- | -------------------------------------------------- | -------- |
| `OWN-AC-001`〜`OWN-AC-006` | Testcontainers PostgreSQL Integration Test 4 Cases | `Passed` |
| `OWN-AC-007`               | Analysis + Document HTTP Bearer A/B Integration    | `Passed` |

各 Suite は隔離 Container を起動し、空 Database に全 Migration を適用します。Container 停止で Test Data を破棄し、共有 Local Database は変更しません。

## Risks and Decisions

- Database Bypass、Test Isolation、Concurrency Race の整改は `OWN-DEV-001`〜`OWN-DEV-003` として解消済みです。
- Analysis と Document HTTP Boundary は検証済みで、`OWN-DEV-004` は 2026-08-10 に解消しました。

## Approved Remediation Plan — 2026-07-22

- `Analysis(ownerId, id)` を Unique Candidate Key とし、`Document(ownerId, analysisId)` から Composite Foreign Key を追加します。
- Migration 前に Existing Owner Mismatch を検査し、不整合がある場合は Fail して手動判断を要求します。
- Parent Check/Child Create と Analysis/Document Soft Delete は Serializable Transaction + 最大 3 回の `P2034` Retry で実行します。
- Local Shared Database Integration Test を Testcontainers PostgreSQL に置き換え、Migration を Test ごとに適用します。
- Concurrent Create/Soft Delete の収束を Integration Test に追加します。
