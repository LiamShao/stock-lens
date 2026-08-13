# Job Re-run Verification

## Metadata

| Field               | Value                              |
| ------------------- | ---------------------------------- |
| Related Spec        | `specs/features/job-rerun/spec.md` |
| Verification status | `Partial`                          |
| Last updated        | `2026-08-13`                       |

## Implemented Evidence

- CLI-only `job:inspect` / `job:rerun` Surface を追加しました。
- Production/Local とも Explicit Enable と 32 Characters 以上の Operator Secret を要求し、Production Local Default を拒否します。
- `OBJECT_CLEANUP`、`PARSE`、`CHUNK` の FAILED Execution だけを許可し、最大 5 Manual Re-runs とします。
- `FAILED → QUEUED` と `JobOperationAudit` Insert は `READ COMMITTED` Transaction 内の `JobExecution` Row Lock で直列化します。
- CLI/Log Output は Stable JSON Code/Message と Sanitized Job Summary に限定します。
- Redis Failure 時は Durable `QUEUED` State を維持し、Worker Pending Dispatcher から回復します。

## Automated Evidence

- Config Unit は Disabled Production と Explicit Non-default Secret を検証します。
- Existing Object Cleanup Processor は Manual Re-run 後も Attempt Number を単調増加させるよう更新しました。
- Real CLI/Infrastructure: Cleanup 3 Attempts Failure → CLI Inspect → Confirmed Re-run → Audit → same Execution 4th Attempt Success を PostgreSQL/Redis/BullMQ/MinIO で検証しました。
- Processing Infrastructure: Parse Attempt 3 Failure → Durable QUEUED → Missing Redis Job → Pending Dispatcher → same Execution Attempt 4 Success と、CHUNK Failure → same CHUNK Processor Attempt 2 を検証しました。
- Repository Integration: Parse FAILED → QUEUED/Audit、QUEUED/RUNNING/SUCCEEDED/Disallowed Step/deleted Target Fail-closed、5 Manual Re-run Limit は成功しました。
- Concurrent Duplicate Test は Option `B` Row Lock により 1 `queued` / 1 Stable `not-rerunnable` / 1 Audit に収束し、`RERUN-DEV-002` を解消しました。

## Remaining Gaps

- Workload IAM/Secret Manager の実体は Phase 7 Deployment Scope です。

## Acceptance Status

| Acceptance Criterion | Status    | Evidence / Gap                                             |
| -------------------- | --------- | ---------------------------------------------------------- |
| `RERUN-AC-001`       | `Passed`  | Cleanup Attempt 3 FAILED → CLI → same ID Attempt 4 success |
| `RERUN-AC-002`       | `Passed`  | Parse Attempt 4 success + CHUNK Attempt 2 processor E2E    |
| `RERUN-AC-003`       | `Passed`  | Row Lock: 1 queued / 1 not-rerunnable / 1 Audit            |
| `RERUN-AC-004`       | `Passed`  | Status/allowlist/deleted Target DB Matrix、no Audit        |
| `RERUN-AC-005`       | `Passed`  | QUEUED without Redis Job → Dispatcher → same ID success    |
| `RERUN-AC-006`       | `Partial` | Production Guard Unit、IAM deployment pending              |
| `RERUN-AC-007`       | `Passed`  | Real inspect/rerun JSON + audit redaction regression       |

## Result

Supported CLI、Durable Audit、Cleanup/Parse/Chunk Routing、Redis Recovery、Concurrency/Limit/Fail-closed は Integration で確認し、`PDF-DEV-002` と `RERUN-DEV-002` を解消しました。Workload IAM/Secrets Manager の Deployment Evidence は Phase 7 Scope のため Feature 全体は `Partial` です。
