# Requirement Traceability Matrix

Status は Requirement の実装・検証状況を表します。`Partial` は Code が存在しても Acceptance Evidence が不足する状態です。

## Authentication

| Requirement    | Implementation                                             | Verification                           | Status   |
| -------------- | ---------------------------------------------------------- | -------------------------------------- | -------- |
| `AUTH-FR-001`  | `AuthService.register`, atomic User/Token Repository       | Register HTTP + PostgreSQL             | `Passed` |
| `AUTH-FR-002`  | `AuthService.login`, atomic Token/Audit Repository         | Login HTTP + DB Audit                  | `Passed` |
| `AUTH-FR-003`  | `AuthService.refresh`, `AuthRepository.rotateRefreshToken` | Rotation HTTP Integration              | `Passed` |
| `AUTH-FR-004`  | `AuthService.refresh/revokeFamily`                         | Reuse/Family Revoke HTTP Integration   | `Passed` |
| `AUTH-FR-005`  | `AuthService.logout`, `AuthController.logout`              | Logout HTTP + DB Revoke                | `Passed` |
| `AUTH-FR-006`  | `AccessTokenGuard`, `AuthService.authenticate`             | `/me` Active/Deleted User HTTP         | `Passed` |
| `AUTH-SEC-001` | Shared Zod Schema, `PasswordHasher`                        | Validation + Argon2id DB/Test          | `Passed` |
| `AUTH-SEC-002` | Common Error + Fixed Dummy Argon2id Verify                 | Unknown/Wrong HTTP + Dummy Verify Unit | `Passed` |
| `AUTH-SEC-003` | `TokenService` HS256 Sign/Verify Allowlist                 | HS256 + HS384 Reject Unit Test         | `Passed` |
| `AUTH-SEC-004` | Random Refresh Secret, Hash-only Schema                    | Rotation HTTP + Token Unit Test        | `Passed` |
| `AUTH-SEC-005` | Protected Refresh Cookie                                   | Local/Production Cookie Tests          | `Passed` |
| `AUTH-SEC-006` | Database-backed Active User Check                          | Deleted User HTTP Integration          | `Passed` |
| `AUTH-SEC-007` | Exact-origin Credential CORS                               | Allow/Reject HTTP Integration          | `Passed` |
| `AUTH-SEC-008` | Fastify Global/Route Rate Limit                            | Unified `429` HTTP Integration         | `Passed` |
| `AUTH-SEC-009` | Pino Redaction + Sanitized Error Boundary                  | Emitted JSON Log Regression Test       | `Passed` |

## Demo User

| Requirement    | Implementation                                     | Verification                          | Status   |
| -------------- | -------------------------------------------------- | ------------------------------------- | -------- |
| `DEMO-FR-001`  | `getDemoUserConfig`                                | Config/Production Guard Tests         | `Passed` |
| `DEMO-FR-002`  | Provisioner Create + `P2002` Convergence           | Unit + Testcontainers Create          | `Passed` |
| `DEMO-FR-003`  | No-op Branch                                       | Unit + Testcontainers `unchanged`     | `Passed` |
| `DEMO-FR-004`  | Conditional Update + Transactional Session Revoke  | Unit + Password Rotation Integration  | `Passed` |
| `DEMO-FR-005`  | `provision-demo-user.ts` Structured Projection     | Entrypoint Review + Error Mapper Test | `Passed` |
| `DEMO-SEC-001` | Shared `PasswordHasher`                            | Argon2id Integration                  | `Passed` |
| `DEMO-SEC-002` | `DemoUserConflictError`                            | Unit Test                             | `Passed` |
| `DEMO-SEC-003` | `DeletedDemoUserError`                             | Unit Test                             | `Passed` |
| `DEMO-SEC-004` | Stable Sanitized Error Mapper                      | Known/Unknown Error Unit Test         | `Passed` |
| `DEMO-SEC-005` | Separate CLI Entry Point                           | Code/Module Review                    | `Passed` |
| `DEMO-SEC-006` | Explicit Production Allow + Default Password Guard | Config Unit Test                      | `Passed` |
| `DEMO-SEC-007` | Password Update/Active Refresh Revoke Transaction  | Unit + Testcontainers Integration     | `Passed` |

## Owner-scoped Data Access

| Requirement   | Implementation                                   | Verification                           | Status    |
| ------------- | ------------------------------------------------ | -------------------------------------- | --------- |
| `OWN-FR-001`  | `AnalysisRepository` + Serializable Retry        | Testcontainers PostgreSQL              | `Passed`  |
| `OWN-FR-002`  | `DocumentRepository`                             | Testcontainers PostgreSQL              | `Passed`  |
| `OWN-FR-003`  | Parent Check + Composite FK + Serializable Retry | Cross-owner FK + Concurrency Test      | `Passed`  |
| `OWN-FR-004`  | Transactional Parent/Child Soft Delete           | Integration + Concurrent Create/Delete | `Passed`  |
| `OWN-FR-005`  | `null`/`false`/Empty Contract                    | Cross-user Integration                 | `Passed`  |
| `OWN-SEC-001` | Analysis HTTP 実装、Document HTTP は Planned     | Analysis Bearer Owner HTTP Passed      | `Partial` |
| `OWN-SEC-002` | Analysis Service + `DatabaseModule` Boundary     | Code Review + Analysis HTTP Test       | `Passed`  |
| `OWN-SEC-003` | Composite Owner FK + Repository Parent Check     | Direct Cross-owner Insert Reject       | `Passed`  |
| `OWN-SEC-004` | `deletedAt: null` Filters                        | Integration Test                       | `Passed`  |
| `OWN-SEC-005` | Testcontainers PostgreSQL + Analysis HTTP Test   | Analysis Passed、Document HTTP Blocked | `Partial` |

## Cross-cutting Gaps

- User 承認と解消 Evidence は `specs/deviations.md` を参照してください。
- PDF Upload 以降は Code 作成前に Draft Spec を承認します。

## PDF Upload

| Requirement   | Implementation                                           | Verification                             | Status    |
| ------------- | -------------------------------------------------------- | ---------------------------------------- | --------- |
| `PDF-FR-001`  | Upload Composite Owner FK、Service/API は Planned        | DB Cross-owner Insert Reject             | `Partial` |
| `PDF-FR-002`  | Planned Serializable Slot Reservation                    | `PDF-AC-002` + concurrency test planned  | `Blocked` |
| `PDF-FR-003`  | Upload Size DB Check、Zod/Streaming は Planned           | 0/20 MB 超 DB Constraint Test            | `Partial` |
| `PDF-FR-004`  | Planned Extension/MIME/Header Validation                 | `PDF-AC-004`, `PDF-AC-005` planned       | `Blocked` |
| `PDF-FR-005`  | Random Private Key + `@stocklens/object-storage`         | Unit + MinIO Adapter Smoke               | `Partial` |
| `PDF-FR-006`  | Signed PUT max 300 seconds、API は Planned               | Signed Header Unit + MinIO Smoke         | `Partial` |
| `PDF-FR-007`  | Streaming Read Primitive、Finalize は Planned            | Stream Unit + MinIO Smoke                | `Partial` |
| `PDF-FR-008`  | S3 Delete Primitive、Queue/Soft Delete は Planned        | Delete Unit + MinIO Smoke                | `Partial` |
| `PDF-FR-009`  | `DocumentUpload` Status/Constraint/Index、Job は Planned | PostgreSQL Lifecycle/Relation/Index Test | `Partial` |
| `PDF-SEC-001` | Planned case-insensitive `.pdf` Validation               | `PDF-AC-004` planned                     | `Blocked` |
| `PDF-SEC-002` | Planned exact `application/pdf` Validation               | `PDF-AC-004` planned                     | `Blocked` |
| `PDF-SEC-003` | Planned Trusted `%PDF-` Streaming Check                  | `PDF-AC-005` planned                     | `Blocked` |
| `PDF-SEC-004` | Size/Type/SHA Header-constrained Signed PUT              | Signature Unit + MinIO Smoke             | `Partial` |
| `PDF-SEC-005` | Random Owner Key、API Log Redaction は Planned           | Key Unit、Log Test planned               | `Partial` |
| `PDF-SEC-006` | Planned HTTP Owner Isolation                             | `PDF-AC-006` planned                     | `Blocked` |
| `PDF-SEC-007` | Planned Untrusted PDF Content Boundary                   | Service/Prompt boundary review planned   | `Blocked` |

## Analysis Management

| Requirement        | Implementation                               | Verification                            | Status   |
| ------------------ | -------------------------------------------- | --------------------------------------- | -------- |
| `ANALYSIS-FR-001`  | Shared Schema + Service + Repository         | `ANALYSIS-AC-001`, `ANALYSIS-AC-002`    | `Passed` |
| `ANALYSIS-FR-002`  | Split `DRAFT` Enum/Default Migrations        | Empty DB Migration + `ANALYSIS-AC-001`  | `Passed` |
| `ANALYSIS-FR-003`  | Cursor Repository + List API                 | `ANALYSIS-AC-003`, `ANALYSIS-AC-004`    | `Passed` |
| `ANALYSIS-FR-004`  | Status Query Schema                          | DRAFT Filter HTTP Test                  | `Passed` |
| `ANALYSIS-FR-005`  | Owner-scoped Detail API                      | `ANALYSIS-AC-005`, `ANALYSIS-AC-006`    | `Passed` |
| `ANALYSIS-FR-006`  | Owner-scoped Rename API                      | `ANALYSIS-AC-005`, `ANALYSIS-AC-006`    | `Passed` |
| `ANALYSIS-FR-007`  | Owner-scoped Delete API + Repository         | Owner/Delete/Repeat Delete HTTP         | `Passed` |
| `ANALYSIS-FR-008`  | Transactional Analysis/Document Soft Delete  | HTTP + Repository `ANALYSIS-AC-009`     | `Passed` |
| `ANALYSIS-SEC-001` | AccessTokenGuard on Analysis Controller      | Missing Bearer HTTP Test                | `Passed` |
| `ANALYSIS-SEC-002` | CurrentUser-only Owner Input                 | Unknown Field + Cross-user HTTP Test    | `Passed` |
| `ANALYSIS-SEC-003` | Stable `ANALYSIS_NOT_FOUND`                  | Get/Patch/Delete Owner A/B HTTP Test    | `Passed` |
| `ANALYSIS-SEC-004` | Analysis Service + DatabaseModule Boundary   | Code Review + HTTP Integration          | `Passed` |
| `ANALYSIS-SEC-005` | Shared Zod Body/Path/Query Schema            | Invalid Input Matrix HTTP Test          | `Passed` |
| `ANALYSIS-SEC-006` | Metadata-only Projection                     | Response omits `ownerId` + Schema Parse | `Passed` |
| `ANALYSIS-SEC-007` | ApiException + Stable Analysis/Company Codes | HTTP Error Format Assertions            | `Passed` |
