# StockLens AI Specification Guide

`specs/` は Feature 単位の Source of Truth です。`docs/` が横断的な Architecture、Database、Security、Operation を説明するのに対し、ここでは観測可能な振る舞い、Acceptance Criteria、実装計画、検証証跡を管理します。

## Artifact

各 Feature Directory は原則として次を持ちます。

```text
spec.md             What / Why / Acceptance Criteria
technical-plan.md   How / Affected Files / Risks
tasks.md            Requirement ID 付きの実装単位
verification.md     実際に実行した検証と残存 Gap
```

共通 Template は `templates/`、Feature 横断の対応関係は `traceability.md`、不一致と未決定事項は `deviations.md` に記録します。

Backfill Audit の User Confirmation は `decision-request.md` に集約します。

## Status

| Status         | 意味                                    |
| -------------- | --------------------------------------- |
| `Draft`        | 仕様作成中。実装開始不可                |
| `Backfilled`   | 既存実装から回填。User Approval 前      |
| `Approved`     | Scope と Acceptance Criteria が承認済み |
| `Implementing` | 承認済み Spec を実装中                  |
| `Implemented`  | Code は完成したが Verification 未完了   |
| `Verified`     | Definition of Done を満たす             |
| `Superseded`   | 後継 Spec に置き換え済み                |

Backfill は現状を正確に記述する作業であり、既存実装を自動的に正当化しません。

## Workflow

```text
Specify → Clarify → Approve → Plan → Tasks → Implement → Verify → Update
```

1. `spec.md` に Goal、Non-goals、Requirement、Acceptance Criteria、Open Questions を記述します。
2. Security、Public API、Database、Architecture、Scope に影響する未決定事項を解消します。
3. User Approval 後に `technical-plan.md` と `tasks.md` を確定します。
4. Task と Test は Requirement ID を参照します。
5. `verification.md` と `traceability.md` に再現可能な Evidence を記録します。
6. 不一致を発見した場合は `deviations.md` に追加し、黙って修正しません。

## Source Priority

矛盾がある場合は作業を止め、Deviation として扱います。優先順位は次の通りです。

1. `AGENTS.md` の Product / Compliance / Engineering Constitution
2. User が承認した Feature Spec
3. ADR と横断的な `docs/`
4. Technical Plan、Tasks、Verification
5. 現在の Code Behavior

Code が上位 Artifact と異なる場合、Code を正として Spec を書き換えてはいけません。
