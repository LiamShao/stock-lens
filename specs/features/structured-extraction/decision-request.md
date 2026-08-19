# Phase 4 Structured Extraction Decision Request

本决策单用于批准 `structured-extraction` Draft。批准前只允许只读调查和规格修改，不修改 Runtime、API、数据库或 Provider 集成。

## Proposed Decisions

| ID              | Decision                    | Options                                                                                                                                                                            | Recommendation                                                                                  | Status                  |
| --------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------- |
| `EXTRACT-Q-001` | Phase 4 Handoff Status      | `A` 新增 `READY_FOR_VIEW_GENERATION`；`B` Findings 完成即标记 `COMPLETED`；`C` Phase 4 只做 Library，不接入 Pipeline                                                               | `A`。避免 Views 仍为空时错误显示 Completed，并给 Phase 5 明确、可恢复的起点                     | `Approved A 2026-08-14` |
| `EXTRACT-Q-002` | Pre-embedding Evidence Flow | `A` 分批 Map Extraction → bounded Merge/Dedupe → Evidence Validation；`B` 提前实现 Embedding/pgvector；`C` 固定截取前 N 个 Chunks                                                  | `A`。不扩大到 Phase 6，能处理长文档且不会静默丢弃后半部分                                       | `Approved A 2026-08-14` |
| `EXTRACT-Q-003` | Initial Provider Delivery   | `A` Provider Interface + OpenAI Production Adapter + Deterministic Test Provider；`B` Interface + Test Provider only；`C` 直接耦合 OpenAI                                          | `A`。保留可替换性，同时提供可运行的真实路径；API Key 只进入 Worker，CI 不调用付费 Provider      | `Approved A 2026-08-14` |
| `EXTRACT-Q-004` | Financial Metric Scope      | `A` Phase 4 先实现 P0 基础 Metric（Revenue、Operating Profit、Net Income、Operating Cash Flow）与可验证同比计算；`B` 所有 Metric 延期；`C` 交给 LLM                                | `A`。满足确定性计算原则并控制范围；缺少单位/期间时返回 unknown                                  | `Approved A 2026-08-14` |
| `EXTRACT-Q-005` | Prompt Version Activation   | `A` Git-tracked Prompt Asset + 显式幂等 CLI 写入/激活 DB；`B` Migration 内写 Prompt；`C` 仅代码常量，不写 `PromptVersion`                                                          | `A`。部署/回滚可审计，API/Worker 启动无隐式数据库 Mutation                                      | `Approved A 2026-08-14` |
| `EXTRACT-Q-006` | Repair / Retry Budget       | `A` 每 Job Attempt 最多 1 次初始 + 2 次 Repair；Validation Exhaustion 不再 Queue Retry，Provider 临时错误最多 3 Job Attempts；`B` 所有失败统一 3 Job Attempts；`C` 不 Repair       | `A`。Validation 最多 3 次 Provider Call，避免 Queue Retry 放大到 9 次；临时基础设施错误仍可恢复 | `Approved A 2026-08-14` |
| `EXTRACT-Q-007` | Live Provider Verification  | `A` Deterministic Provider 为 CI Gate，另设显式 Opt-in Live Smoke/Evaluation；无 Live Evidence 时 Provider Integration 只能 `Partial`；`B` Live API 是 CI 必需；`C` 不做 Live Test | `A`。CI 可重复且无 Secret/Cost 依赖，同时不把 Mock Evidence 误报为真实 Provider 已验证          | `Approved A 2026-08-14` |

## Approval Effect

若全部批准推荐项 `A`：

1. `spec.md` 更新为 `Approved`，记录批准日期和每项 Decision。
2. 按 SDD 顺序创建 `technical-plan.md` 与 `tasks.md`，再开始 Runtime/Database 变更。
3. Phase 4 使用 `CALCULATE_FINANCIAL_METRICS → EXTRACT → VALIDATE → READY_FOR_VIEW_GENERATION`，Embedding 仍留在 Phase 6。
4. 长文档按 bounded batches 全覆盖，不使用“只取前 N 个 Chunk”的静默截断。
5. Production 支持 OpenAI Adapter，但默认 CI 只用 Deterministic Provider；Live Provider 的完成度保持可审计。
6. Finding/Evidence/Financial Metrics 只有在 Zod、Evidence、Compliance、Parent/Input Validation 全部成功后才原子发布。

若任何项选择其他 Option，我会先更新 Spec 与对应 Deviation，再生成 Technical Plan；不会提前实现未批准行为。

## Resolution

User は 2026-08-14 に `EXTRACT-Q-001`〜`EXTRACT-Q-007` の Option `A` をすべて承認しました。Spec は `Approved` とし、Technical Plan/Tasks/Implementation はこの Baseline に従います。

## Follow-up Decision — Manual Phase 4 Re-run

| ID              | Decision                   | Options                                                                                                                                               | Recommendation                                                                                  | Status                  |
| --------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------- |
| `EXTRACT-Q-008` | Phase 4 Manual Re-run 対象 | `A` `CALCULATE_FINANCIAL_METRICS` と `EXTRACT` を既存 CLI Allowlist に追加；`B` `EXTRACT` のみ追加；`C` 現行三 Step Allowlist を維持し Phase 7 へ延期 | `A`。既存 CLI-only/IAM/Audit/5回上限を再利用し、Automatic Retry Exhaustion 後も安全に復旧できる | `Approved A 2026-08-19` |

User は 2026-08-19 に Option `A` を承認しました。既存 CLI-only、Workload IAM/Secret Guard、`JobOperationAudit`、同一 Execution、5 回上限を維持したまま `CALCULATE_FINANCIAL_METRICS` と `EXTRACT` を Allowlist に追加します。内部成功監査 Step である `VALIDATE` は対象外です。
