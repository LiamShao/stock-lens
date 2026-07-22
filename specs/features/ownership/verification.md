# Owner-scoped Data Access Verification

## Metadata

| Field               | Value                              |
| ------------------- | ---------------------------------- |
| Related Spec        | `specs/features/ownership/spec.md` |
| Verification status | `Partial`                          |
| Verified at         | `2026-07-22`                       |

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
| `OWN-AC-007`                             | No HTTP API                                                        | `Blocked`                          |

Database-level Evidence:

- Cross-owner `Document` Direct Insert は Composite FK により `P2003` で拒否します。
- Parent Soft Delete と Child Create の同時実行後、Active Child は残りません。
- Local Migration 適用前の Owner Mismatch Audit は `0` 件でした。

## Commands and Result

```bash
pnpm test:integration
```

Result: 全 Integration 2 Suites、9 Tests Passed。Ownership Suite は 4 Tests で、Container 停止により Test Database 全体を破棄しました。

## Deviations and Residual Risks

- `OWN-DEV-004` — Analysis/Document HTTP API 未実装のため Blocked

## Conclusion

Repository、PostgreSQL Constraint、Concurrency Boundary の Cross-user Isolation は検証済みです。HTTP Authorization は Planned API が存在しないため Feature 全体は意図的に `Partial` のままです。
