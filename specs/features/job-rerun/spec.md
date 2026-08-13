# Job Re-run Specification

## Metadata

| Field                 | Value                 |
| --------------------- | --------------------- |
| Spec status           | `Approved`            |
| Implementation status | `Implemented`         |
| Verification status   | `Partial`             |
| Owner                 | `TBD`                 |
| Approval              | `Approved 2026-08-13` |
| Last updated          | `2026-08-13`          |

## Goal

Automatic Retry を使い切った `FAILED` JobExecution を、認証・対象確認・監査・安定した出力を伴う Supported Operator Surface から安全に同じ Execution ID で再投入できるようにします。Phase 2 の `PDF-DEV-002` Risk Acceptance を解消し、Phase 3 以降の Pipeline Job に共通利用します。

## Non-goals

- End User が任意 Job を再実行する Public API
- 成功済み Job の強制再計算
- Job Payload、Owner、Analysis、Document、Storage Target の書き換え
- Raw Stack Trace、Raw Provider Error、Secret、PDF Text の表示
- Database を直接編集する運用手順

## Actors and Preconditions

- Operator は Application End User とは分離された明示的な運用 Credential/Role を持ちます。
- 対象 `JobExecution` は Durable Database Record と Attempt History を持ち、`FAILED` です。
- CLI は Production で明示的 Enable と Operator Identity を必須にします。

## Functional Requirements

| ID             | Requirement                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `RERUN-FR-001` | Operator は Execution ID を指定して、Sanitized Target/Step/Status/Attempt Summary を Read-only Inspection できる          |
| `RERUN-FR-002` | Operator は確認した `FAILED` Execution だけを同じ ID/Idempotency Key で `QUEUED` に戻して Dispatch できる                 |
| `RERUN-FR-003` | Re-run は新しい `JobExecution` を作らず、新しい `JobAttempt` を実 Worker Claim 時に追加する                               |
| `RERUN-FR-004` | `RUNNING`、`QUEUED`、`SUCCEEDED`、削除済み/不整合 Target は再投入せず Stable Result/Error を返す                          |
| `RERUN-FR-005` | Database Update 成功後の Redis Dispatch Failure は `QUEUED` を保持し、Pending Dispatcher から収束する                     |
| `RERUN-FR-006` | 操作は Operator Identity、Execution ID、Step、Before/After Status、Timestamp、Request/Correlation ID を監査可能に記録する |
| `RERUN-FR-007` | CLI は Machine-readable JSON と非ゼロ Exit Code を持ち、Runbook に Inspect → Confirm → Re-run → Verify の手順を記載する   |

## Security Requirements

| ID              | Requirement                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `RERUN-SEC-001` | Production は明示的 Enable Flag、非 Default Operator Identity、Secret Manager 由来 Credential を必須にする       |
| `RERUN-SEC-002` | Re-run 対象は Allowlist された Job Step に限定し、CLI Input から Queue Payload/Storage Coordinate を受け取らない |
| `RERUN-SEC-003` | Audit/CLI/Log は Password、Token、Connection URL、Storage Key、PDF Text、Raw Error Details を出力しない          |
| `RERUN-SEC-004` | Status Check と `FAILED → QUEUED` は Concurrent Operator/Dispatcher に対して原子的かつ Idempotent とする         |
| `RERUN-SEC-005` | Target の Owner/Parent/Soft-delete Integrity を Database から再検証し、不整合時は Fail closed とする             |

## Proposed CLI and Data Contract

- `pnpm job:inspect --execution-id <uuid>`
- `pnpm job:rerun --execution-id <uuid> --operator-id <stable-id> --confirm <execution-id>`
- Output は `code`, `message`, `executionId`, `step`, `previousStatus`, `status`, `requestId` の Sanitized JSON とする
- Queue Payload は既存通り `{ jobExecutionId }` のみとする
- Audit Event の永続化先は Approval 後の Technical Plan で確定する

## Error and Edge Cases

| Case                              | Expected behavior                                                  |
| --------------------------------- | ------------------------------------------------------------------ |
| Missing execution                 | Stable `JOB_EXECUTION_NOT_FOUND`                                   |
| Status is not `FAILED`            | Stable `JOB_NOT_RERUNNABLE`、変更なし                              |
| Target deleted/inconsistent       | Stable `JOB_TARGET_NOT_AVAILABLE`、変更/Dispatch なし              |
| Concurrent duplicate re-run       | 一方だけが Transition、双方は同じ `QUEUED` Execution に収束        |
| Redis unavailable after DB commit | Durable `QUEUED`、Pending Dispatcher が後で Dispatch               |
| Unknown runtime error             | Generic code/message のみ、Raw Message を stdout/stderr に出さない |

## Acceptance Criteria

| ID             | Given / When / Then                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `RERUN-AC-001` | Given FAILED Cleanup Job、When Authorized Operator が Inspect/Confirm/Re-run、Then同じ Execution ID が QUEUED となり Worker で成功できる  |
| `RERUN-AC-002` | Given FAILED Parse/Chunk Job、When Re-run、Then Step 固有 Processor へ同じ Durable Target から Dispatch される                            |
| `RERUN-AC-003` | Given concurrent duplicate commands、When Re-run、Then JobExecution/Dispatch は一つに収束し Audit は各試行を区別する                      |
| `RERUN-AC-004` | Given SUCCEEDED/RUNNING/QUEUED または deleted target、When Re-run、Then変更も Queue Side Effect もない                                    |
| `RERUN-AC-005` | Given Redis failure after transition、When Dispatcher recovers、Then QUEUED execution is eventually delivered without a new execution     |
| `RERUN-AC-006` | Given Production config without explicit enable/identity/credential、When CLI starts、Then fail closed before DB mutation                 |
| `RERUN-AC-007` | Given any success/failure path、When output/audit/log is inspected、Then no secret, storage coordinate, PDF text, or raw error is present |

## Open Questions

| ID            | Question                                                                                               | Impact                                 | Status                                        |
| ------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------------------------------------------- |
| `RERUN-Q-001` | Operator Surface は CLI のみでよいか、Internal Admin API も必要か                                      | Authorization / Attack Surface / Scope | `Resolved: CLI only`                          |
| `RERUN-Q-002` | Operator Authentication を実行環境 IAM + Enable Flag で担保するか、Application-level Role を追加するか | Security / Database / Deployment       | `Resolved: workload identity + secret + flag` |
| `RERUN-Q-003` | Audit を専用 `JobOperationAudit` Table に保存するか、Structured Central Log のみとするか               | Compliance / Database / Queryability   | `Resolved: JobOperationAudit table`           |
| `RERUN-Q-004` | Manual Re-run の累積 Attempt 上限と対象 Step Allowlist                                                 | Availability / Cost / Abuse Control    | `Resolved: 5; OBJECT_CLEANUP/PARSE/CHUNK`     |

## Dependencies

- Existing `JobExecution` / `JobAttempt` / Object Cleanup Queue Contract
- Phase 3 Document Processing Jobs
- Structured Log Redaction
- Production Secrets/IAM Design and Operator Runbook
