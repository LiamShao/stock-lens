# Analysis Management Technical Plan

## Metadata

| Field        | Value                                        |
| ------------ | -------------------------------------------- |
| Related Spec | `specs/features/analysis-management/spec.md` |
| Plan status  | `Implemented`                                |
| Last updated | `2026-07-24`                                 |

## Approach

- `AnalysisStatus.DRAFT` を追加し、新規 Analysis の Default とします。Existing Row の Status は変更しません。
- Shared Package に Request/Query/Response Zod Schema と Type を追加します。
- `AnalysisRepository` を Cursor Pagination、Company Existence Check、Record を返す Rename に拡張します。
- `AnalysisService` が Validation 済み Input、Owner Scope、Cursor Encode/Decode、Stable Domain Error、Response Projection を担当します。
- `AnalysisController` は HTTP/OpenAPI のみに限定し、Bearer User を Service に渡します。
- `AnalysisModule` を App に追加し、既存 `DatabaseModule` と Auth Guard を再利用します。

## Affected Files

| Area            | Files / Directory                                    | Change                                      |
| --------------- | ---------------------------------------------------- | ------------------------------------------- |
| Shared Contract | `packages/shared/src/index.ts`                       | Analysis Zod Schema と Type                 |
| Database        | `prisma/schema.prisma`, new migration                | `DRAFT` Enum Value と Default               |
| Repository      | `apps/api/src/database/analysis.repository.ts`       | Company Check、Cursor List、Rename Record   |
| API             | New `apps/api/src/analyses/` module                  | Controller、Service、OpenAPI                |
| Application     | `apps/api/src/app.module.ts`, `auth/auth.module.ts`  | Module Registration、Guard Export           |
| Tests           | API Unit と Testcontainers HTTP Integration          | Validation、CRUD、Pagination、Authorization |
| Documentation   | `AGENTS.md`, API/Database/Architecture/Progress docs | Approved Status/API/Boundary                |
| SDD             | Spec/Tasks/Verification/Traceability/Deviation       | Approval、Evidence、Residual Risk           |

## API Changes

| Method   | Path                | Input                                 | Success                |
| -------- | ------------------- | ------------------------------------- | ---------------------- |
| `POST`   | `/api/analyses`     | `{ title, companyId?: UUID \| null }` | `201 AnalysisResource` |
| `GET`    | `/api/analyses`     | `limit?`, `cursor?`, `status?`        | `200 AnalysisPage`     |
| `GET`    | `/api/analyses/:id` | UUID Path                             | `200 AnalysisResource` |
| `PATCH`  | `/api/analyses/:id` | `{ title }`                           | `200 AnalysisResource` |
| `DELETE` | `/api/analyses/:id` | None                                  | `204`                  |

- Title は Trim 後 1〜120 文字で C0/DEL Control Character を拒否します。
- History は `createdAt DESC, id DESC`、Default 20、Maximum 50 の Opaque Cursor Pagination とします。
- Page Response は `items` と `nextCursor: string | null` を返します。
- Resource は Metadata のみを返し、`ownerId`、Documents、AI Outputs は含めません。
- Missing/Cross-user/Deleted Resource は `404 ANALYSIS_NOT_FOUND`、Unknown Company は `404 COMPANY_NOT_FOUND` とします。
- Success/Error/Pagination/Bearer Contract を OpenAPI に具体的に定義します。

## Database Changes

- PostgreSQL Enum `AnalysisStatus` に `DRAFT` を `UPLOADED` の前へ追加します。
- `Analysis.status` Default を `DRAFT` に変更します。
- Existing Row は Data Migration せず現在の Status を維持します。
- New Table、Index、Foreign Key は追加しません。

## Security and Failure Handling

- 全 Endpoint に `AccessTokenGuard` を適用し、`ownerId` は `CurrentUser.id` だけから取得します。
- Body、Path、Query は Shared Zod Schema で検証します。
- Controller/Service は Prisma を直接参照せず `AnalysisRepository` を使用します。
- Cursor は Version、`createdAt`、UUID を含む Base64url JSON とし、Decode 後に Zod 検証します。
- Cursor を改変しても Owner Filter を外せない Query とします。
- Cross-user と Missing を同じ Error にし、Existence Oracle を作りません。
- Unexpected Database Detail は共通 Exception Filter で Sanitized します。

## Test Strategy

| Acceptance Criterion                 | Level                   | Evidence                                              |
| ------------------------------------ | ----------------------- | ----------------------------------------------------- |
| `ANALYSIS-AC-001`, `ANALYSIS-AC-002` | Unit + HTTP/PostgreSQL  | Create、DRAFT、Title、Optional/Unknown Company        |
| `ANALYSIS-AC-003`, `ANALYSIS-AC-004` | Unit + HTTP/PostgreSQL  | Owner Filter、Status Filter、Stable Cursor Pagination |
| `ANALYSIS-AC-005`, `ANALYSIS-AC-006` | HTTP/PostgreSQL         | Get/Rename/Delete、Cross-user 404、No Mutation        |
| `ANALYSIS-AC-007`, `ANALYSIS-AC-008` | HTTP                    | Zod Validation、Bearer Guard                          |
| `ANALYSIS-AC-009`                    | PostgreSQL              | Analysis/Document Transactional Soft Delete           |
| `ANALYSIS-AC-010`                    | Unit / OpenAPI Document | Concrete Success/Error/Pagination Schema              |
| `ANALYSIS-AC-011`, `OWN-AC-007`      | Testcontainers HTTP     | End-to-end CRUD と Owner Isolation                    |

## Rollout and Rollback

1. Additive Enum Migration を Deploy します。
2. Updated API を Deploy し、以後の新規 Analysis を `DRAFT` で作成します。
3. Rollback は API Default を戻せますが、PostgreSQL Enum Value は Non-destructive に残します。
4. `DRAFT` Row が存在する状態で旧 API へ戻す場合は、旧 Client/Worker が Unknown Status を受けないことを確認します。

## Risks and Decisions

- `ANALYSIS-DEV-001` は User が `DRAFT` 追加を承認済みで、本 Plan の Migration/Test により解消します。
- Processing 中 Delete 後の Worker Stop と Object Cleanup は将来の Pipeline/PDF Feature で実装・検証します。Analysis API は現在の Owner-scoped Metadata Soft Delete を保証します。
- Company Catalog API は Non-goal です。Known Company ID の指定または `null` を許可します。
