# Job Re-run Technical Plan

## Metadata

| Field        | Value                                           |
| ------------ | ----------------------------------------------- |
| Related Spec | `specs/features/job-rerun/spec.md`              |
| Plan status  | `Implemented — deployment verification pending` |
| Last updated | `2026-08-13`                                    |

## Approach

Worker Package に Inspect/Re-run CLI を追加します。Production は Enable Flag、Operator ID、Secret の存在と Local Default ではない値を必須とします。Repository は対象 `JobExecution` を `READ COMMITTED` Transaction 内で `SELECT ... FOR UPDATE` し、Lock 取得後に Parent Integrity、Allowlisted Step、`FAILED` Status、5 回上限を検証します。同じ Execution を `QUEUED` へ戻す操作と Audit を原子的に保存し、Concurrent Command は最初の Commit 後の Status を再読込して Stable Result へ収束します。Redis Dispatch Failure 時は Durable Queue Scanner が回復します。

## Affected Files

| Area   | Files                              | Change                             |
| ------ | ---------------------------------- | ---------------------------------- |
| Prisma | Schema/Migration                   | `JobOperationAudit`                |
| Worker | Config、Repository、CLI、Publisher | Inspect/Re-run/Dispatch            |
| Root   | `package.json`                     | `job:inspect`, `job:rerun` Scripts |
| Docs   | Security/Operations/Progress       | Production Guard と Runbook        |

## API Changes

- Public/Internal HTTP API は追加しません。
- CLI JSON Output だけを Supported Operator Contract とします。

## Database Changes

- `JobOperationAudit` は Execution Relation、Operator ID、Action、Before/After Status、Request ID、Created/Updated Timestamp を保持します。
- Re-run Transition と Audit Insert は同一 `READ COMMITTED` / Row Lock Transaction です。

## Security and Failure Handling

- Allowlist は `OBJECT_CLEANUP`, `PARSE`, `CHUNK` です。
- 最大 5 回の Manual Re-run を超えた場合は Stable Error とし、Mutation しません。
- Concurrent Re-run は `JobExecution` Row Lock で直列化し、Lock 待機後に最新 Status を再検証します。
- CLI は Connection/Raw Error を Sanitized Generic Error に変換します。
- Queue Payload は Execution ID だけです。

## Test Strategy

| Requirement                    | Level                           | Evidence                                       |
| ------------------------------ | ------------------------------- | ---------------------------------------------- |
| `RERUN-AC-001`, `RERUN-AC-002` | PostgreSQL/Redis/BullMQ/MinIO   | Cleanup/Parse/Chunk Re-run                     |
| `RERUN-AC-003`〜`RERUN-AC-005` | Concurrency/Failure Integration | Atomic Claim、No duplicate、Redis Recovery     |
| `RERUN-AC-006`, `RERUN-AC-007` | Config/CLI Unit                 | Production Fail-closed、Sanitized Output/Audit |

Operational E2E は既存 isolated PostgreSQL、Redis/BullMQ、MinIO Harness で Cleanup を 3 Attempts 失敗させ、実 CLI Process の `inspect → --confirm rerun` を実行し、同じ Execution ID / 4th Attempt で Object Delete が成功することを検証します。Repository Integration は Concurrent Command、5 Re-run Limit、non-FAILED / deleted target を別途検証し、Queue/DB Side Effect がないことを確認します。

## Rollout and Rollback

- Audit Migration を先に適用し、CLI は Default Disabled で Deploy します。
- Rollback は CLI Binary/Script を戻し、Audit Table を保持します。

## Risks and Decisions

- Workload IAM 自体の Terraform は Phase 7 Scope です。Phase 3 は Production Guard Contract と Local/Test Evidence を実装します。
