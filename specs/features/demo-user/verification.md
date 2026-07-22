# Demo User Provisioning Verification

## Metadata

| Field               | Value                              |
| ------------------- | ---------------------------------- |
| Related Spec        | `specs/features/demo-user/spec.md` |
| Verification status | `Verified`                         |
| Verified at         | `2026-07-22`                       |

## Acceptance Evidence

| Acceptance Criterion | Evidence                                                       | Result   |
| -------------------- | -------------------------------------------------------------- | -------- |
| `DEMO-AC-001`        | Testcontainers Integration: Create + Argon2id Verification     | `Passed` |
| `DEMO-AC-002`        | Unit No-write Test + Testcontainers `unchanged`                | `Passed` |
| `DEMO-AC-003`        | Unit Update Test + Integration Password Rotation/Token Revoke  | `Passed` |
| `DEMO-AC-004`        | Non-demo Unit Test                                             | `Passed` |
| `DEMO-AC-005`        | Soft-deleted Demo Unit Test                                    | `Passed` |
| `DEMO-AC-006`        | Stable Error Mapper Test + Entrypoint Output Projection Review | `Passed` |

## Reproducible Command

```bash
pnpm test:integration
```

2026-07-22 の隔離 PostgreSQL で `created`、`unchanged`、Password Rotation、Active Session Revoke を自動検証しました。Password は Test Output/Evidence に記録していません。

## Deviations and Residual Risks

- Production Provisioning は運用上の明示 Allow が必要であり、通常 API Startup からは到達しません。

## Conclusion

Approved Backfilled Spec の Acceptance Criteria は Unit/Testcontainers Evidence で検証済みです。Demo User Provisioning は `Verified` です。
