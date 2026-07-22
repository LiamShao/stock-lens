# Demo User Provisioning Technical Plan

## Metadata

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Related Spec | `specs/features/demo-user/spec.md` |
| Plan status  | `Implemented`                      |
| Last updated | `2026-07-22`                       |

## Implemented Approach

- `demo-user.config.ts` が Environment を Zod で検証します。
- `DemoUserProvisioner` が Existing User を Email で検索し、Create/No-op/Update/Reject を決定します。
- `provision-demo-user.ts` が Prisma Lifecycle と Structured Output を管理します。
- Nest CLI の独立 Entry Point として実行し、API Bootstrap から分離します。

## Affected Files

| Area         | Files                                                       |
| ------------ | ----------------------------------------------------------- |
| Config       | `.env.example`, `demo-user.config.ts`                       |
| Provisioning | `demo-user-provisioner.ts`, `provision-demo-user.ts`        |
| Scripts      | Root / API `package.json`                                   |
| Tests        | `demo-user.config.spec.ts`, `demo-user-provisioner.spec.ts` |

## Database Changes

Schema/Migration 変更はありません。CLI は `User` Record を作成または更新し、Password 変更時は同一 Transaction で Active Refresh Token を失効します。

## Security and Failure Handling

- Output は Password/Hash/Token を除外します。
- Non-demo と Soft-deleted User は Fail Closed です。
- Production は明示 Allow Flag と Local Default 以外の Password が必要です。
- Concurrent Create は Unique Conflict 後に再読込して Existing User Rule へ収束します。

## Test Strategy

Unit Test は Config、Create、No-op、Update、Concurrent Create、Non-demo/Soft-delete Reject、Sanitized Error を検証します。Testcontainers Integration Test は実 PostgreSQL で `created`→`unchanged` と Password Rotation/Revoke を検証します。

## Rollout and Rollback

Command は明示実行だけです。誤作成時は関連 Data/Token を確認してから Demo User を Soft Delete する運用が必要です。自動 Rollback はありません。

## Approved Remediation Plan — 2026-07-22

- Production では `ALLOW_DEMO_USER_PROVISIONING=true` と Local Default 以外の Password を必須にします。
- Password Hash 更新と Active Refresh Token Revoke を同一 Transaction で実行します。
- Concurrent Create の `P2002` を再読込し、通常の Existing Demo Rule に収束させます。
- CLI の Unknown Error は Stable Generic Code/Message に変換し、Raw Driver/Runtime Message を出力しません。
- Unit Test と Testcontainers Integration Test で Create→Unchanged、Password Rotation/Revoke、Production Guard を検証します。
