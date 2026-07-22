# Demo User Provisioning Specification

## Metadata

| Field                 | Value                 |
| --------------------- | --------------------- |
| Spec status           | `Approved`            |
| Implementation status | `Implemented`         |
| Verification status   | `Verified`            |
| Approval              | `Approved 2026-07-22` |
| Last updated          | `2026-07-22`          |

## Goal

Local Development と明示的に構成された Demo Environment に、再現可能で安全な Demo User を Provision します。

## Non-goals

- API 起動時の自動 Account 作成
- Demo Company、PDF、Analysis Data の Seed
- Soft-deleted User の自動復元
- Production Credential Management 全体

## Functional Requirements

| ID            | Requirement                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `DEMO-FR-001` | CLI は `DEMO_USER_EMAIL`、`DEMO_USER_PASSWORD`、`DEMO_USER_DISPLAY_NAME` を Zod で検証・正規化する |
| `DEMO-FR-002` | Email が未使用なら `isDemo=true` の User を作成する                                                |
| `DEMO-FR-003` | Active Demo User と設定が同じなら Database Write をせず `unchanged` を返す                         |
| `DEMO-FR-004` | Active Demo User の Display Name または Password が異なる場合だけ更新する                          |
| `DEMO-FR-005` | CLI は `created`、`updated`、`unchanged` と User ID/Email を Structured JSON で出力する            |

## Security Requirements

| ID             | Requirement                                                                  |
| -------------- | ---------------------------------------------------------------------------- |
| `DEMO-SEC-001` | Password は Authentication と同じ Argon2id Hasher で保存する                 |
| `DEMO-SEC-002` | 通常 User と同じ Email の上書きを拒否する                                    |
| `DEMO-SEC-003` | Soft-deleted Demo User を暗黙に復元しない                                    |
| `DEMO-SEC-004` | CLI Output と Error に Password、Hash、Token を含めない                      |
| `DEMO-SEC-005` | Provisioning は明示的 Command でのみ実行し、API Startup では実行しない       |
| `DEMO-SEC-006` | Production では明示 Allow Flag と Local Default 以外の Password を必須にする |
| `DEMO-SEC-007` | Password 変更時は既存 Active Refresh Token を同一 Transaction で失効する     |

## Operational Contract

```text
pnpm demo:user:provision
```

Command は Root `.env` または Process Environment を使用します。現在の Local Setup では `.env.example` を明示的に読み込んだ実行も可能です。

## Error and Edge Cases

| Case                           | Expected behavior                     |
| ------------------------------ | ------------------------------------- |
| Invalid/Missing Config         | Non-zero Exit、Invalid Key だけを出力 |
| Email belongs to non-demo User | Fail without write                    |
| Demo User is soft-deleted      | Fail without restore                  |
| Database unavailable           | Non-zero Exit、Sanitized Error Event  |

## Acceptance Criteria

| ID            | Given / When / Then                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `DEMO-AC-001` | Given 有効な Config と未使用 Email、When CLI 実行、Then Argon2id Password の Demo User を作成し `created` を返す |
| `DEMO-AC-002` | Given同じ Demo User/Config、When 再実行、Then Write せず `unchanged` を返す                                      |
| `DEMO-AC-003` | Given変更済み Config、When 再実行、Then変更 Field だけ更新して `updated` を返す                                  |
| `DEMO-AC-004` | Given通常 User の Email、When 実行、Then上書きせず失敗する                                                       |
| `DEMO-AC-005` | Given Soft-deleted Demo User、When 実行、Then復元せず失敗する                                                    |
| `DEMO-AC-006` | Given任意の結果、Then Structured Output に Password/Hash/Token を含めない                                        |

## Open Questions

| ID           | Question                                         | Status                                               |
| ------------ | ------------------------------------------------ | ---------------------------------------------------- |
| `DEMO-Q-001` | Production Demo Provisioning の Guard Policy     | `Resolved` — Explicit Allow + Non-default Password   |
| `DEMO-Q-002` | Password Rotation 時の既存 Session Revoke Policy | `Resolved` — Password 変更時のみ全 Active Token 失効 |
| `DEMO-Q-003` | Concurrent Provision の収束方法                  | `Resolved` — `P2002` 後に再読込                      |
| `DEMO-Q-004` | Unknown CLI Error の Sanitization Policy         | `Resolved` — Stable Generic Error                    |

## Dependencies

- Authentication Password Hasher
- PostgreSQL `User` / `RefreshToken`
- `.env.example` Local Configuration
