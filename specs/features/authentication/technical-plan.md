# Authentication Technical Plan

## Metadata

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| Related Spec | `specs/features/authentication/spec.md` |
| Plan status  | `Implemented`                           |
| Last updated | `2026-07-22`                            |

## Implemented Approach

- `AuthController` は HTTP、Cookie、OpenAPI、Zod Pipe の Boundary です。
- `AuthService` は Register/Login/Refresh/Logout/Authenticate の Business Rule を処理します。
- `AuthRepository` は User と Refresh Token の Prisma Access を担当します。
- `PasswordHasher` は Argon2id、`TokenService` は JWT と Opaque Refresh Token を担当します。
- `AccessTokenGuard` は Bearer Header を解析し、Active User を Request に設定します。
- Refresh Rotation は `updateMany` による一度限りの Claim と Transaction で実装します。

## Affected Files

| Area     | Files                                                                         |
| -------- | ----------------------------------------------------------------------------- |
| Contract | `packages/shared/src/index.ts`, `docs/api-conventions.md`                     |
| HTTP     | `apps/api/src/auth/auth.controller.ts`, `access-token.guard.ts`               |
| Business | `apps/api/src/auth/auth.service.ts`, `token.service.ts`, `password-hasher.ts` |
| Data     | `apps/api/src/auth/auth.repository.ts`, `prisma/schema.prisma`                |
| Platform | `apps/api/src/main.ts`, `api-exception.filter.ts`                             |
| Tests    | `apps/api/src/auth/*.spec.ts`                                                 |

## API Changes

Backfill 対象の 5 Endpoint は実装済みです。OpenAPI は Success/Error DTO、Cookie Header、Bearer/Cookie Security Scheme を公開します。

## Database Changes

`User` と `RefreshToken`、Family/Expiry Index、Rotation Relation は初期 Migration に含まれます。追加 Migration はありません。

## Security and Failure Handling

- Refresh Secret の平文は Cookie 以外に永続化しません。
- Reuse Detection は Family Revoke へ Fail Closed します。
- Soft-deleted User は Login/Access/Refresh を拒否します。
- Unknown Email でも固定 Dummy Argon2id Verify を実行し、Login Token と Audit Update は同一 Transaction です。
- JWT は Sign/Verify とも `HS256` に限定します。

## Test Strategy

| Requirement                  | Evidence                                      | Result   |
| ---------------------------- | --------------------------------------------- | -------- |
| `AUTH-AC-001`〜`AUTH-AC-005` | Fastify HTTP + Testcontainers PostgreSQL      | `Passed` |
| `AUTH-AC-006`〜`AUTH-AC-009` | Rotation/Reuse/Logout/Guard HTTP Integration  | `Passed` |
| `AUTH-AC-010`                | Production Cookie Controller Test             | `Passed` |
| `AUTH-AC-011`                | Rate Limit + Credential CORS HTTP Integration | `Passed` |

## Rollout and Rollback

Authentication は既に Main Branch の Baseline です。今後の Behavior Change は Spec Approval と backward-compatible Cookie/Token Migration を必要とします。

## Approved Remediation Plan — 2026-07-22

- Unknown Email Path でも固定 Dummy Argon2id Hash を Verify します。
- Login の Refresh Token Create と `lastLoginAt` Update を Repository Transaction に統合します。
- JWT Sign/Verify Algorithm を `HS256` に固定します。
- Client Request ID を 128 文字以内の限定文字種で検証し、不正値を UUID に置換します。
- Fastify Logger に Credential/Token Redaction Path を明示し、Regression Test を追加します。
- Auth OpenAPI Success/Error/Cookie Contract を Concrete Schema で公開します。
- Testcontainers PostgreSQL に Migration を適用し、Register/Login/Refresh/Logout/Guard/CORS/Rate Limit を HTTP Integration Test で検証します。
- Integration Test を GitHub Actions の Quality Gate に追加します。
