# Authentication Verification

## Metadata

| Field               | Value                                   |
| ------------------- | --------------------------------------- |
| Related Spec        | `specs/features/authentication/spec.md` |
| Verification status | `Verified`                              |
| Verified at         | `2026-07-22`                            |

## Acceptance Evidence

| Acceptance Criterion | Evidence                                                                                           | Result   |
| -------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| `AUTH-AC-001`        | HTTP Integration: Register、Argon2id DB Record、Protected Cookie                                   | `Passed` |
| `AUTH-AC-002`        | Controller Validation/Unified Error Unit Test                                                      | `Passed` |
| `AUTH-AC-003`        | HTTP Integration: Duplicate Register `409`、Token Count Audit                                      | `Passed` |
| `AUTH-AC-004`        | HTTP Integration: Login、`lastLoginAt`、Refresh Token Persistence                                  | `Passed` |
| `AUTH-AC-005`        | HTTP Integration: Unknown Email/Wrong Password 共通 `INVALID_CREDENTIALS` + Dummy Verify Unit Test | `Passed` |
| `AUTH-AC-006`        | HTTP Integration: Refresh Rotation と同一 Family                                                   | `Passed` |
| `AUTH-AC-007`        | HTTP Integration: Consumed Token Reuse と Replacement Family Revoke                                | `Passed` |
| `AUTH-AC-008`        | HTTP Integration: Logout `204` と DB Revoke                                                        | `Passed` |
| `AUTH-AC-009`        | HTTP Integration: `/me` Success と Soft-deleted User Reject                                        | `Passed` |
| `AUTH-AC-010`        | Controller Test: Production `Secure` Cookie                                                        | `Passed` |
| `AUTH-AC-011`        | HTTP Integration: Route Rate Limit、Unified `429`、Allow/Reject CORS                               | `Passed` |

## Quality Gates

2026-07-22 に API Unit Test 37 件と Testcontainers Integration Test 9 件を含む全 Quality Gate を実行しました。Integration Suite は空の PostgreSQL に Migration を適用してから HTTP Flow を検証します。

## Deviations and Residual Risks

- Integration Test は Node 22 の Fastify Cookie Dynamic Import のため `--experimental-vm-modules` を使用します。
- Rate Limit Store は Process Local です。Multi-instance 化前に Redis-backed Store が必要です。

## Conclusion

Approved Backfilled Spec の Acceptance Criteria は Unit/HTTP/PostgreSQL Evidence で検証済みです。Authentication Feature は SDD Definition of Done の `Verified` です。
