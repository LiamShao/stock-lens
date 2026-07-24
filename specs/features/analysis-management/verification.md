# Analysis Management Verification

## Metadata

| Field               | Value                                        |
| ------------------- | -------------------------------------------- |
| Related Spec        | `specs/features/analysis-management/spec.md` |
| Verification status | `Verified`                                   |
| Verified at         | `2026-07-24`                                 |

## Environment

- Node.js `>=22 <24` / pnpm 10
- Testcontainers + `stocklens-postgres:16-pgvector`
- Suite ごとの隔離 PostgreSQL と空 Database への全 Migration 適用

## Acceptance Evidence

| Acceptance Criterion | Evidence                                                                      | Result   |
| -------------------- | ----------------------------------------------------------------------------- | -------- |
| `ANALYSIS-AC-001`    | `creates a validated DRAFT with optional company`                             | `Passed` |
| `ANALYSIS-AC-002`    | Valid Company、`null`、Unknown Company HTTP/PostgreSQL Assertions             | `Passed` |
| `ANALYSIS-AC-003`    | `paginates stable owner history and filters status` Owner A/B Assertions      | `Passed` |
| `ANALYSIS-AC-004`    | Two-page Cursor Test + Cursor Unit Round-trip/Invalid Cases                   | `Passed` |
| `ANALYSIS-AC-005`    | Owner Get/Rename/Delete HTTP + Database Assertions                            | `Passed` |
| `ANALYSIS-AC-006`    | Owner B Get/Patch/Delete all return identical `ANALYSIS_NOT_FOUND`            | `Passed` |
| `ANALYSIS-AC-007`    | Blank/Long/Control Title、Unknown Field、UUID/Limit/Status/Cursor Validation  | `Passed` |
| `ANALYSIS-AC-008`    | Missing Bearer returns `ACCESS_TOKEN_REQUIRED`                                | `Passed` |
| `ANALYSIS-AC-009`    | HTTP Delete + Repository Regression verify Transactional Document Soft Delete | `Passed` |
| `ANALYSIS-AC-010`    | `publishes concrete OpenAPI operations and bearer security`                   | `Passed` |
| `ANALYSIS-AC-011`    | `analyses.integration-spec.ts` on migrated Testcontainers PostgreSQL          | `Passed` |

## Quality Gates

| Command                 | Result                                       |
| ----------------------- | -------------------------------------------- |
| `pnpm format:check`     | Passed                                       |
| `pnpm spec:check`       | Passed — 5 Features / 68 Requirements        |
| `pnpm db:validate`      | Passed                                       |
| `pnpm lint`             | Passed                                       |
| `pnpm typecheck`        | Passed                                       |
| `pnpm test`             | Passed — API 13 Suites / 44 Tests + Monorepo |
| `pnpm test:integration` | Passed — 3 Suites / 13 Tests                 |
| `pnpm build`            | Passed                                       |

## Deviations and Residual Risks

- `ANALYSIS-DEV-001` は `DRAFT` Migration と空 Database Migration Test により解消しました。
- `OWN-DEV-004` は Analysis HTTP Boundary を検証済みですが、Document HTTP API は PDF Upload Feature まで Partial です。
- Processing 中 Delete 後の Worker Stop/Object Cleanup は Pipeline/PDF Feature の Scope です。現在は Metadata Transaction Boundary を検証済みです。

## Conclusion

Approved Spec の全 Acceptance Criteria は Unit、OpenAPI、Testcontainers HTTP/PostgreSQL Evidence で検証済みです。Analysis Management Feature は SDD Definition of Done の `Verified` です。
