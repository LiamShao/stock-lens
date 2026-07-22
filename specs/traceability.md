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
| `OWN-SEC-001` | HTTP Service 未実装                              | Planned API により Evidence なし       | `Blocked` |
| `OWN-SEC-002` | `DatabaseModule` / Repository Boundary           | Module/Code Review                     | `Partial` |
| `OWN-SEC-003` | Composite Owner FK + Repository Parent Check     | Direct Cross-owner Insert Reject       | `Passed`  |
| `OWN-SEC-004` | `deletedAt: null` Filters                        | Integration Test                       | `Passed`  |
| `OWN-SEC-005` | Testcontainers PostgreSQL + Future HTTP Test     | Repository/DB Passed、HTTP Blocked     | `Partial` |

## Cross-cutting Gaps

- User 承認と解消 Evidence は `specs/deviations.md` を参照してください。
- PDF Upload 以降は Code 作成前に Draft Spec を承認します。
