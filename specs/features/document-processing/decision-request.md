# Phase 3 Decision Request

本决策单覆盖 `document-processing` 与依赖的 `job-rerun` Draft。推荐项以最小 Public Attack Surface、明确 Status Semantics、可重复测试和 Phase 4 可衔接性为目标。

## Proposed Decisions

| ID            | Decision                     | Options                                                                                                                                                               | Recommendation                                                                                 | Status                  |
| ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------- |
| `PROC-Q-001`  | Analysis Processing Trigger  | `A` 明示 `POST /api/analyses/:id/process`；`B` 首个 PDF Finalize 后自动开始；`C` 每个 PDF Finalize 都自动增量处理                                                     | `A`。User 可先上传最多 3 件 PDF，再明确开始；避免第一件完成后与后续 Upload 竞态                | `Approved A`            |
| `PROC-Q-002`  | Phase 3 Handoff Status       | `A` 新增 `READY_FOR_EMBEDDING`；`B` Phase 3 Runtime 延迟到 Phase 4；`C` 使用 `EMBEDDING` 表示等待/执行                                                                | `A`。Queued/Ready 与 Running 不混用，API/DB/Worker Recovery 语义最清楚                         | `Approved A`            |
| `PROC-Q-003`  | Resource Limits              | `A` 500 Pages、2 MiB UTF-8 Text/Page、50 MiB Text/Document、120 秒 Parse Timeout；`B` 更低上限；`C` 仅依赖 20 MB Upload Limit                                         | `A`。对通常 IR PDF 留有空间，同时防止 PDF Decompression/Parser DoS；超限为 Non-retryable       | `Approved A`            |
| `PROC-Q-004`  | Chunk Policy                 | `A` Page-bounded 1,200 Unicode Characters、150 Character Overlap，Whitespace-aware Boundary；`B` Provider Tokenizer 800/100 Tokens；`C` Sentence-only Dynamic Chunk   | `A`。不绑定 LLM Provider，日文行为可重复；`tokenCount` 在 Provider Tokenizer 確定前保持 `null` | `Approved A`            |
| `PROC-Q-005`  | Section Detection            | `A` Phase 3 仅做 Deterministic Heading Heuristic；`B` 完全延期；`C` Phase 3 使用 LLM                                                                                  | `A`。满足“detectable metadata”，不引入 LLM/Prompt Scope；不确定时保存 `null`                   | `Approved A`            |
| `PROC-Q-006`  | User-facing Job Read Surface | `A` Process Response + 既有 Analysis Detail Status，不新增 Job List；`B` 新增 Owner-scoped Job List；`C` Server-sent Events                                           | `A`。MVP 已可追踪状态且暴露面最小；Attempt Detail 保留给 Operator                              | `Approved A`            |
| `RERUN-Q-001` | Operator Surface             | `A` CLI-only；`B` Internal Admin API；`C` CLI + API                                                                                                                   | `A`。不增加 Network Attack Surface，符合 Phase 2 已接受方向                                    | `Approved A`            |
| `RERUN-Q-002` | Operator Auth and Audit      | `A` Workload IAM/Secret + Production Enable Flag + `JobOperationAudit` Table；`B` Application Admin Role/API + Audit Table；`C` Environment Access + Central Log only | `A`。身份由 Deployment Boundary 保证，Mutation Audit 在 DB 中 Durable/Queryable                | `Approved A`            |
| `RERUN-Q-003` | Re-run Allowlist and Limit   | `A` `OBJECT_CLEANUP/PARSE/CHUNK`，每 Execution 最多 5 次 Manual Re-run；`B` 所有 Step 无上限；`C` Cleanup only                                                        | `A`。覆盖 Phase 3，限制意外 Cost/Loop；未来 Step 需在各 Feature Spec 中显式加入                | `Approved A`            |
| `PROC-Q-007`  | Permission-encrypted PDF     | `A` 无需 Password/主动解密且可安全提取时接受；`B` Encryption Flag 一律拒绝；`C` 暂缓至 Phase 7                                                                        | `A`。维持 Parser Security Boundary，同时兼容常见 Public IR PDF                                 | `Approved A 2026-08-13` |

## Approval Effect

全部选择 `A` 后：

1. 两份 Spec 更新为 `Approved` 并记录 Approval Date。
2. 创建各自的 `technical-plan.md` 和 `tasks.md`，Requirement ID 不变。
3. 先实现共享 Durable Job/CLI/Audit Boundary，再实现 Parse、Page Persist、Chunk、Status Handoff。
4. 每个 Acceptance Criterion 以 Unit、Testcontainers PostgreSQL、Redis/BullMQ、MinIO Integration Evidence 验证。

任一项选择其他 Option 时，会先更新 Spec/Deviation，再生成 Technical Plan；不会在 Material Decision 未解决时修改 Runtime、API 或 Database。
