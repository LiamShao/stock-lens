# Job Re-run Follow-up Decision Request

## Proposed Decision

| ID              | Decision                         | Options                                                                                                              | Recommendation                                                                       | Status                  |
| --------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| `RERUN-DEV-002` | Concurrent Serializable Conflict | `A` `P2034` を Repository 内で最大 3 回 Retry；`B` Row Lock で直列化；`C` Generic Failure を期限付き Risk Acceptance | `A`。Schema/Architecture を変えず、再読込後 Stable `not-rerunnable` に収束できます。 | `Approved B 2026-08-13` |

## Observed Evidence

- 2 Concurrent Commands の Data Result は 1 `QUEUED` Execution / 1 Audit で、Duplicate Mutation はありません。
- 競合した Command だけが Prisma `P2034` で Reject され、Approved `RERUN-AC-003` と Stable CLI Error Contract を満たしません。
- Single Re-run、Deleted Target、5 Manual Re-run Limit は isolated PostgreSQL Integration で成功しています。

## Approval Effect

- `A`: `JobOperationRepository.rerun` の Serializable Transaction を bounded 3 Attempts とし、再読込後の Stable Result を返す Regression Test を通します。
- `B`: Raw Row Lock の Transaction Contract と Test を追加します。
- `C`: Runtime を変更せず、Deviation と Feature `Partial` を維持します。

## Approved B Contract

- Re-run Mutation Transaction は `READ COMMITTED` で対象 `JobExecution` を `SELECT ... FOR UPDATE` し、Lock 取得後に Status、Manual Limit、Parent/Target Integrity を再読込します。
- 最初の Command だけが `FAILED → QUEUED` と Audit Insert を行い、待機した Command は Commit 後の `QUEUED` を読み `not-rerunnable` を返します。
- Public API、Database Schema、Queue Payload は変更しません。
