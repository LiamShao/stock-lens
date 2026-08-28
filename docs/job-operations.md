# Job 手動再実行 Runbook

## 目的

Automatic Retry を使い切った `OBJECT_CLEANUP`、`PARSE`、`CHUNK`、`CALCULATE_FINANCIAL_METRICS`、`EXTRACT`、`GENERATE_VIEWS` の `FAILED` Execution を、同じ Execution ID と Idempotency Key で安全に再投入します。End User 向け API ではなく、Workload IAM で保護された Operator CLI だけを使用します。`VALIDATE` は Extraction の原子 Publish 時に作成される成功監査 Step のため対象外です。

## 前提

- Operator は対象 Environment への承認済み Workload Identity を持つ。
- `ALLOW_JOB_RERUN=true` を明示する。
- `JOB_OPERATOR_SECRET` は Secrets Manager 等から注入し、32 Characters 以上とする。
- Production では Local Default Secret を使用しない。
- `DATABASE_URL` と `REDIS_URL` は対象 Environment の Private Endpoint を参照する。

## 手順

1. Read-only Inspection を実行します。

   ```bash
   pnpm job:inspect --execution-id <uuid> --operator-id <stable-operator-id>
   ```

2. JSON の `executionId`、`step`、`status=FAILED`、`errorCode`、`manualReruns` を確認します。
3. 同じ Execution ID を Confirmation に指定します。

   ```bash
   pnpm job:rerun --execution-id <uuid> --operator-id <stable-operator-id> --confirm <uuid>
   ```

4. `JOB_RERUN_QUEUED` を確認します。Redis Dispatch が一時失敗しても Database の `QUEUED` State を Worker Scanner が回復します。
5. 再度 Inspect し、`RUNNING` または `SUCCEEDED` への遷移と新しい Attempt を確認します。

## Fail-closed 条件

- Missing、`SUCCEEDED`、`RUNNING`、`QUEUED` Execution
- Allowlist 外の Step
- Parent/Target 不整合または利用不能
- 5 回の Manual Re-run 上限到達
- Enable Flag、Operator Identity、Secret、Confirmation の不足

Database を直接編集して Status、Payload、Target、Attempt を変更してはいけません。
