# Web Analysis Intake Decision Request

本決策書は P0 Browser User Journey の `web-analysis-intake` Draft を批准するためのものです。批准前は Spec/Decision/Deviation の変更と只読調査だけを行い、Runtime、Public API、Database、Object Storage、External Provider を変更しません。

## Proposed Decisions

| ID             | Decision                    | Options                                                                                                                                                                                       | Recommendation                                                                                                                                            | Status |
| -------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `INTAKE-Q-001` | Route / Flow Unit           | `A` `/analyses/new` で Create → Upload → Review/Start の一つの Wizard、作成後は ID を URL に反映；`B` Create/Upload/Review を三 Route に分割；`C` 既存 Detail に全 Form を埋め込む            | `A`。一つの P0 Journey として明確で、Analysis 作成後は Server ID Route から Reload Recovery でき、完成済み Detail の複雑化を避ける                        | `Open` |
| `INTAKE-Q-002` | Registration Success        | `A` 既存 Register Response/Cookie を Session に適用し `/analyses` へ Redirect；`B` Register 後に Login Form へ戻す；`C` Registration UI を含めない                                            | `A`。Backend は AuthResponse と rotated Refresh Cookie を既に返すため、Password 再入力なしで安全に Memory Session を確立できる                            | `Open` |
| `INTAKE-Q-003` | Company Scope               | `A` 今回は Title のみ、`companyId: null`；`B` Company Search/Create API と Selector を追加；`C` Client 固定 Company List を持つ                                                               | `A`。現行 Product に Company Read/Create API がなく、B は Public API/Data Scope、C は不整合な Client Master を増やす。Company UX は独立 Spec にする       | `Open` |
| `INTAKE-Q-004` | Multi-file Execution        | `A` 最大 3 Files を bounded parallel、File ごとの State/Retry、成功済み保持；`B` 常に Sequential；`C` 一つの Batch API を新設                                                                 | `A`。既存 Per-file API を変更せず Upload 時間を抑え、`Promise.allSettled` 相当の明示 State Machine で Partial Success を回復可能にする                    | `Open` |
| `INTAKE-Q-005` | Browser File Integrity      | `A` Web Crypto SHA-256 と size/name/MIME/`%PDF-` early check、Finalize は常に再検証；`B` SHA-256 だけ；`C` Browser Check を行わず Backend Proxy Upload に変更                                 | `A`。既存 Start Contract が SHA-256 を必須とし、20 MB 上限なら Browser で bounded に計算できる。Client Check は UX のみで Trusted Finalize を弱めない     | `Open` |
| `INTAKE-Q-006` | Processing Start            | `A` Finalized Document Summary 後の明示 Button；`B` 最後の Finalize 成功時に自動開始；`C` History/Detail からだけ開始                                                                         | `A`。Provider Cost と非同期 Side Effect を User Intent に結び、Upload/Retry/Reload が意図せず Pipeline を開始しない                                       | `Open` |
| `INTAKE-Q-007` | Abandoned Draft             | `A` Explicit Delete のみ。離脱/Reload は Server State を保持；`B` Page Unload で Best-effort Delete；`C` Client Timer で自動 Delete                                                           | `A`。Unload Mutation は不確実で、Completed Upload の意図しない削除を避ける。既存 Analysis Delete + durable Object Cleanup を明示操作で使用する            | `Open` |
| `INTAKE-Q-008` | Browser Acceptance Provider | `A` CI は Deterministic Provider + Real PostgreSQL/Redis/BullMQ/MinIO、Live は既存 Opt-in Harness；`B` Browser E2E で OpenAI 必須；`C` Upload/Process Accepted までで View Completion は Mock | `A`。Full Journey を repeatable に検証しつつ Secret/Cost を CI から分離する。Production Provider は既存 Live Artifact がない限り `Partial` のまま維持する | `Open` |

## Cross-cutting Notes

- Recommendation はすべて既存 Backend/Public API/Database Contract を維持します。
- `INTAKE-Q-003 A` は Company Data を捨てる決定ではなく、Company Search/Create API が存在しない現 Phase の UI Scope を限定する決定です。
- `INTAKE-Q-004 A` の Parallel 上限は選択可能 File 数と同じ最大 3 で、それ以上の Queue または Background Upload を持ちません。
- `INTAKE-Q-005 A` でも Browser 判定を Security Source of Truth とせず、既存 Finalize Streaming Validation が Authoritative です。
- `INTAKE-Q-006 A` により AI Pipeline の Cost/Side Effect は Upload Completion から分離されます。
- 批准後に `technical-plan.md` と Requirement-linked `tasks.md` を作成し、その後にだけ実装を開始します。

## Approval Request

`INTAKE-Q-001`〜`INTAKE-Q-008` の Option を批准してください。Recommendation をすべて採用する場合は次のように返信できます。

```text
批准 INTAKE-Q-001〜008 全部采用 A
```

異なる組み合わせの場合は、例として次のように指定できます。

```text
INTAKE-Q-001 A，Q-002 A，Q-003 B，Q-004 B，Q-005 A，Q-006 A，Q-007 A，Q-008 A
```
