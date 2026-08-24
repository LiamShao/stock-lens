# Phase 5 Analysis Views Decision Request

本決策单用于批准 `analysis-views` Draft。批准前只允许只读调查和规格修改，不修改 Runtime、Public API、数据库、Object Storage 或 Web 行为。

## Proposed Decisions

| ID           | Decision                  | Options                                                                                                                                                                                                                       | Recommendation                                                                                                                            | Status                  |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `VIEW-Q-001` | View Scope / Completion   | `A` Phase 5 同时生成 Just Tell Me、Analyst、Buffett-Munger 三 View 后才 `COMPLETED`；`B` Phase 5 只生成前两 View，并新增 `READY_FOR_BUFFETT_LENS`；`C` 前两 View 后直接 `COMPLETED`，Buffett Lens 后补                        | `A`。三 View 都是 P0 Core View，可避免 Partial Product 被标为 Completed，也避免为阶段排期增加公开状态                                     | `Approved A 2026-08-24` |
| `VIEW-Q-002` | Generation Unit           | `A` 一次 bounded Structured Generation 返回三 View，统一 Validation 后 Atomic Publish；`B` 三个独立 Call/Job，全部成功后 Publish；`C` 不调用 Provider，只按 Finding 做 deterministic Template                                 | `A`。共享同一 Evidence Context，成本和 Retry 面最小；用 Strict Output/Context Budget 约束大 Response                                      | `Approved A 2026-08-24` |
| `VIEW-Q-003` | Citation Contract         | `A` 每个 View Block 直接保存 Evidence ID，API 返回去重 Evidence Projection；`B` Block 只引用 Finding ID，由 API 间接展开；`C` Model 生成自由文本 Footnote                                                                     | `A`。UI 与 Original Page 的对应最明确，Server 可直接验证 Owner/Analysis/Document/Chunk Lineage，且不复制 Excerpt                          | `Approved A 2026-08-24` |
| `VIEW-Q-004` | View Read API             | `A` `GET /analyses/:id/views` 仅对 Completed 返回 normalized Aggregate，未完成 `409 ANALYSIS_VIEWS_NOT_READY`；`B` 扩大现有 Analysis Detail，在任何状态返回 nullable Outputs；`C` 每个 View/Evidence 分别 Endpoint/Pagination | `A`。Status Polling 继续使用既有轻量 Metadata API，View Endpoint 不暴露 Partial/Stale Output，24 Finding 上限下 Aggregate 有明确 Boundary | `Approved A 2026-08-24` |
| `VIEW-Q-005` | Web Foundation Dependency | `A` 本 Feature 包含最小 Login/Refresh/Logout、History、Analysis Detail Shell；`B` 先单独建立/批准 Frontend Foundation Feature，再回到 View UI；`C` 本 Feature 只做 Worker/API，不交付 UI                                      | `A`。能在一个 Approved Feature 内完成用户可验证路径；不扩大到 Upload/Create UI，复用现有 Backend Auth/History Contract                    | `Approved A 2026-08-24` |
| `VIEW-Q-006` | PDF Navigation            | `A` 增加 PDF.js-based Embedded Viewer 和短命 Read Presign API；`B` 短命 URL + Browser Native `#page=N` 新标签；`C` Phase 5 只显示 Document/Page/Excerpt，不打开 PDF                                                           | `A`。Page Navigation 跨浏览器更可控并符合 Portfolio UI 目标；新增依赖和 CSP/Worker 配置必须在 Technical Plan 明示                         | `Approved A 2026-08-24` |
| `VIEW-Q-007` | Live Verification         | `A` Deterministic Provider 为 CI Gate，另设显式 Opt-in Live Smoke；无 Passed Artifact 时 Provider Integration 维持 `Partial`；`B` Live API 是 CI 必需；`C` 不做 Live Test                                                     | `A`。CI 可重复且无 Secret/Cost 依赖，同时不把 Mock Evidence 误报为真实 View Provider 已验证                                               | `Approved A 2026-08-24` |

## Cross-cutting Notes

- `VIEW-Q-001` Recommendation A 会将 Buffett-Munger Lens 从原路线图 Phase 6 提前到 Phase 5，但不扩大 Product P0 Scope；Phase 6 保留 Embedding、Hybrid Retrieval 与 RAG。
- `VIEW-Q-005` Recommendation A 只补齐查看结果所需的 Browser Session/History/Detail，不包含 Registration、Analysis Create、PDF Upload UI。这些 UI 缺口继续可见，不会被声称已完成。
- `VIEW-Q-006` Recommendation A 需要新增 Web PDF Viewer Dependency。选择后会在 Technical Plan 记录 Package、Version、CSP/Worker Asset、Bundle/Accessibility Test 和替代方案。
- 所有 Options 都维持 Private Bucket、Owner Scope、五分钟以内的 Read URL、No Investment Advice、No Buffett/Munger Impersonation。

## Approval Request

请批准 `VIEW-Q-001`〜`VIEW-Q-007` 的选项。可以直接回复：

```text
批准 VIEW-Q-001〜007 全部采用 A
```

如需不同组合，请逐项指定，例如：

```text
VIEW-Q-001 A，Q-002 B，Q-003 A，Q-004 A，Q-005 B，Q-006 B，Q-007 A
```
