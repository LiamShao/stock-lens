# Owner-scoped Data Access Verification

## Metadata

| Field               | Value                              |
| ------------------- | ---------------------------------- |
| Related Spec        | `specs/features/ownership/spec.md` |
| Verification status | `Verified`                         |
| Verified at         | `2026-08-10`                       |

## Environment

- Testcontainers + `stocklens-postgres:16-pgvector`
- Suite ごとの隔離 `stocklens_test` Database
- 空 Database への `prisma migrate deploy`

## Acceptance Evidence

| Acceptance Criterion                     | Evidence                                                           | Result                             |
| ---------------------------------------- | ------------------------------------------------------------------ | ---------------------------------- |
| `OWN-AC-001`, `OWN-AC-002`, `OWN-AC-005` | `isolates analysis reads, updates, lists, and deletes by owner`    | `Passed` at Repository/DB Boundary |
| `OWN-AC-003`, `OWN-AC-004`, `OWN-AC-005` | `isolates document creation, reads, updates, and deletes by owner` | `Passed` at Repository/DB Boundary |
| `OWN-AC-006`                             | `soft-deletes an owned analysis and its active documents together` | `Passed`                           |
| `OWN-AC-007`                             | Analysis + Document HTTP Bearer Owner A/B Test                     | `Passed`                           |

Database-level Evidence:

- Cross-owner `Document` Direct Insert は Composite FK により `P2003` で拒否します。
- Parent Soft Delete と Child Create の同時実行後、Active Child は残りません。
- Local Migration 適用前の Owner Mismatch Audit は `0` 件でした。

## Commands and Result

```bash
pnpm test:integration
```

Result: Repository/Analysis/Document の Owner Isolation を隔離 PostgreSQL で検証しました。Document HTTP Target Suite は 6 Tests、全 Integration は 5 Suites / 31 Tests Passed し、Cross-user Request の Database/Storage/Cleanup Side Effect がないことを確認しました。Container 停止により各 Test Database 全体を破棄します。

## Deviations and Residual Risks

- `OWN-DEV-004` — Analysis と Document の Bearer User A/B HTTP Evidence により 2026-08-10 解消

## Conclusion

Repository、PostgreSQL Constraint、Concurrency Boundary、Analysis HTTP、Document Start/Re-presign/Finalize/List/Delete の Cross-user Isolation は検証済みです。Approved Acceptance Criteria は再現可能な PostgreSQL/HTTP Evidence を持つため、本 Feature は `Verified` です。
