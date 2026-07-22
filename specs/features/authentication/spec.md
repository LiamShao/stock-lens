# Authentication Specification

## Metadata

| Field                 | Value                 |
| --------------------- | --------------------- |
| Spec status           | `Approved`            |
| Implementation status | `Implemented`         |
| Verification status   | `Verified`            |
| Approval              | `Approved 2026-07-22` |
| Last updated          | `2026-07-22`          |

## Goal

Email/Password による Account 作成と Login、短期 Access Token、Rotation される Refresh Token、Logout、Active User 確認を提供します。

## Non-goals

- Social Login、MFA、Password Reset、Email Verification
- Cross-site Cookie Deployment
- Multi-device Session Management UI
- Authorization 対象 Resource の CRUD

## Actors and Preconditions

- 未認証 User: Register、Login、Refresh、Logout を利用できます。
- 認証済み User: Bearer Access Token で `/api/auth/me` を利用できます。
- PostgreSQL と有効な Authentication Environment が必要です。

## Functional Requirements

| ID            | Requirement                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `AUTH-FR-001` | Register は Email を trim/lowercase、Display Name を trim し、User と最初の Refresh Token を同一 Transaction で作成する |
| `AUTH-FR-002` | Login は正規化済み Email と Password を検証し、Access Token と Refresh Token を発行して `lastLoginAt` を更新する        |
| `AUTH-FR-003` | Refresh は有効な Token を一度だけ Claim し、同じ Family ID の Replacement Token を発行する                              |
| `AUTH-FR-004` | 使用済みまたは失効済み Refresh Token の再利用を検知し、Family 全体を失効する                                            |
| `AUTH-FR-005` | Logout は提示された有効 Refresh Token の Family を失効し、Cookie を削除する。Token がない場合も成功する                 |
| `AUTH-FR-006` | `/api/auth/me` は有効な Bearer Token と Active User が一致する場合だけ User Profile を返す                              |

## Security Requirements

| ID             | Requirement                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `AUTH-SEC-001` | Password は 12〜128 文字とし、Argon2id Hash だけを保存する                                                |
| `AUTH-SEC-002` | Login Failure は Email 存在有無を Message で区別しない                                                    |
| `AUTH-SEC-003` | Access Token は issuer、audience、subject、expiry、signature を検証し、Default 15 分とする                |
| `AUTH-SEC-004` | Refresh Secret は 256 bit Random とし、Database には SHA-256 Hash のみ保存する                            |
| `AUTH-SEC-005` | Refresh Cookie は `HttpOnly`、`SameSite=Strict`、Path `/api/auth` とし、Production では `Secure` を付ける |
| `AUTH-SEC-006` | Access Token 検証後も Database で Active User と Email を再確認する                                       |
| `AUTH-SEC-007` | Credential CORS は単一の設定済み Origin のみ許可する                                                      |
| `AUTH-SEC-008` | Register/Login/Refresh と API 全体に Rate Limit を適用する                                                |
| `AUTH-SEC-009` | Password、Access Token、Refresh Token を Response Log や Error Detail に含めない                          |

## API Contract

| Method | Path                 | Success                             | Stable errors                                                          |
| ------ | -------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `POST` | `/api/auth/register` | `201 AuthResponse` + Refresh Cookie | `VALIDATION_ERROR`, `EMAIL_ALREADY_REGISTERED`, `RATE_LIMIT_EXCEEDED`  |
| `POST` | `/api/auth/login`    | `200 AuthResponse` + Refresh Cookie | `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `RATE_LIMIT_EXCEEDED`       |
| `POST` | `/api/auth/refresh`  | `200 AuthResponse` + Rotated Cookie | `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED`, `RATE_LIMIT_EXCEEDED` |
| `POST` | `/api/auth/logout`   | `204` + Cleared Cookie              | `RATE_LIMIT_EXCEEDED`                                                  |
| `GET`  | `/api/auth/me`       | `200 AuthUser`                      | `ACCESS_TOKEN_REQUIRED`, `INVALID_ACCESS_TOKEN`, `RATE_LIMIT_EXCEEDED` |

`AuthResponse` は `accessToken`、`expiresIn`、`user` を含みます。Password と Refresh Token は JSON Body に含めません。

## Error and Edge Cases

| Case                                        | Expected behavior                         |
| ------------------------------------------- | ----------------------------------------- |
| Duplicate Email（Soft-deleted User を含む） | `409 EMAIL_ALREADY_REGISTERED`            |
| Unknown Email / Wrong Password              | `401 INVALID_CREDENTIALS`                 |
| Missing/Malformed/Expired Refresh Token     | `401 INVALID_REFRESH_TOKEN`               |
| Consumed Refresh Token                      | `401 REFRESH_TOKEN_REUSED`、Family Revoke |
| Deleted User の Access/Refresh Token        | Authentication 拒否                       |
| Missing/Malformed Bearer Header             | `401 ACCESS_TOKEN_REQUIRED`               |

## Acceptance Criteria

| ID            | Given / When / Then                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `AUTH-AC-001` | Given 有効な Register Input、When Register、Then 正規化 User を作成し AuthResponse と Protected Refresh Cookie を返す |
| `AUTH-AC-002` | Given 不正な Email/Password、When Register/Login、Then `400 VALIDATION_ERROR` で Secret を返さない                    |
| `AUTH-AC-003` | Given Duplicate Email、When Register、Then `409 EMAIL_ALREADY_REGISTERED` で追加 User/Token を作成しない              |
| `AUTH-AC-004` | Given 正しい Credential、When Login、Then Token を発行し `lastLoginAt` を更新する                                     |
| `AUTH-AC-005` | Given Unknown Email または Wrong Password、When Login、Then同じ `401 INVALID_CREDENTIALS` を返す                      |
| `AUTH-AC-006` | Given 未使用 Refresh Token、When Refresh、Then同じ Family の Replacement を作成し旧 Token を失効する                  |
| `AUTH-AC-007` | Given 使用済み Refresh Token、When 再利用、Then Family 全体を失効する                                                 |
| `AUTH-AC-008` | Given Refresh Cookie、When Logout、Then Family を失効して `204` と Cookie Clear を返す                                |
| `AUTH-AC-009` | Given Active User の Access Token、When `/me`、Then AuthUser を返す。Deleted/Missing User なら拒否する                |
| `AUTH-AC-010` | Given Production、When Cookie 発行、Then `Secure` を含む                                                              |
| `AUTH-AC-011` | Given Rate Limit 超過、When Auth/API Request、Then統一形式の `429 RATE_LIMIT_EXCEEDED` を返す                         |

## Open Questions

| ID           | Question                                                  | Status                                     |
| ------------ | --------------------------------------------------------- | ------------------------------------------ |
| `AUTH-Q-001` | Login Timing Resistance を Dummy Hash Verify で実装するか | `Resolved` — Dummy Argon2id Verify         |
| `AUTH-Q-002` | Login Token と `lastLoginAt` を同一 Transaction にするか  | `Resolved` — Atomic Transaction            |
| `AUTH-Q-003` | Integration Harness を Testcontainers に統一する時期      | `Resolved` — CI Gate として導入            |
| `AUTH-Q-004` | JWT Algorithm を `HS256` に固定するか                     | `Resolved` — Sign/Verify を固定            |
| `AUTH-Q-005` | Explicit Log Redaction の導入時期                         | `Resolved` — Logger Regression Test を追加 |

## Dependencies

- `docs/security.md`
- `docs/api-conventions.md`
- `prisma/schema.prisma`
- `@stocklens/shared` Zod Schemas
