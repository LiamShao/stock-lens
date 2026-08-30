# Analysis Views Verification

## Metadata

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| Related Spec        | `specs/features/analysis-views/spec.md`    |
| Verification status | `Partial — aggregate read API implemented` |
| Last updated        | `2026-08-30`                               |

## Implemented Evidence

- `analysisViewsGenerationOutputSchema` は三 View の固定順 Required Section、Strict Root/Section/Block、Stable Key、Japanese Text、Block/Character/Citation/Total Character Limit、Unknown Field Reject を固定します。
- Supported Block は 1 件以上の Direct Evidence UUID を必須とし、同 Block 内の Duplicate Citation を拒否します。Missing Information Block だけは Evidence 0 件を許可します。
- Just Tell Me 6 Sections、Analyst View 8 Sections、Buffett-Munger Lens 7 Sections を一つの Versioned Root Contract で原子的な Candidate として表現します。
- Default Budget は Context 48,000 Characters、Conservative Input 48,000 Tokens、Output 8,192 Tokens、Initial + Repair 合計 3 Calls、60 Seconds、Authored Text 18,000 Characters です。
- 既存 Investment Advice Scanner を content-neutral helper として再利用し、View Model-authored Text の Buy/Sell、Target Price、Price/Return Prediction、Personalized Allocation、Trade Timing を検出します。
- View Framework Validator は Buffett/Munger の人格模倣と Buffett/Munger/Berkshire の虚偽 Endorsement を Stable Code で検出します。公開原則を分析枠組みとして説明する通常文は許可します。
- Git-tracked `analysis-views` Prompt Asset は Name `analysis-views`、Version 1、Schema Version `analysis-views-v1` と Template SHA-256 を固定し、既存の明示的 Prompt Activation CLI で登録可能です。
- Prompt は三 View、Required Section、Direct Evidence ID、Missing Information、No Advice、No Impersonation/Endorsement と Untrusted Source Policy を明示します。
- `AnalysisViewsOrchestrator` は Analysis Metadata、最大 24 Finding、Finding-linked Evidence、四つの Deterministic Financial Metrics だけを Strict DTO で受け、Owner/Storage/Unknown Field を Provider Input から拒否します。
- Finding/Evidence は stable key/ID 順に並べ、escaped single `<untrusted_analysis_source>` User Block に限定します。Source 内の closing tag、role/tool/URL/secret request は System Prompt へ混入しません。
- 三 View は `analysis_views_v1` Schema に対する一回の Structured Generation で取得します。Full Source が Context/Conservative UTF-8 Token 上限を超える場合は Provider Call 前に失敗し、Silent Truncation しません。
- Provider Output は Shared Strict Schema、custom Total Authored Character Budget、deterministic Compliance を再検証し、失敗 Candidate を Result として返しません。
- Result は validated Output、Unique Source Finding/Evidence Count、Provider/Model/Token/Latency/Request ID Usage のみを返し、Prompt/Context/Source を Usage に含めません。Database Usage Persist は Task 005 で接続します。
- `AnalysisViewsPublishRepository` は `READY_FOR_VIEW_GENERATION` の Active Owner/Analysis、Finding、Finding-linked Evidence、Document/Page/Chunk/Excerpt、Financial Metric Snapshot を Database から再解決し、Stable Input Hash を作成します。Deleted、Cross-owner、Unlinked、Broken Lineage は Provider Input/Citation Allowlist に入りません。
- Commit 前に Active Parent、Exact Input Hash、Active `analysis-views` Prompt ID/SHA-256/Schema Version を Serializable Transaction 内で再確認します。Unknown/Cross-owner/Unlinked Evidence ID と Compliance Violation は三 View の Publish 前に拒否します。
- 成功時だけ既存三 JSONB、`COMPLETED`、`completedAt`、Failure Clear を一つの Transaction/Update で保存します。Input/Prompt/Delete Race、Duplicate Publish、Validation Failure は Partial/Stale Output を公開しません。
- Phase 4 Atomic Publish は Analysis、Exact View Source Hash、Active View Prompt ID/Hash/Schema、Provider/Model Runtime Hash から一意の Durable `GENERATE_VIEWS` Execution を同じ Transaction で作成します。Queue Payload は Execution ID だけです。
- View Worker は Execution Identity、Owner、Active Parent、Prompt、Finding/Evidence/Metric Source を Database から再解決し、同じ Job Attempt 内で Initial 1 + Repair 最大 2 Calls に制限します。
- Schema/Citation/Compliance Candidate Failure は Stable Code だけを Repair Prompt に渡します。Transient Provider Failure は BullMQ 最大 3 Attempts、Validation Exhaustion は `FAILED_VALIDATION`、Generation Failure は `FAILED_EXTRACTION` と Sanitized Failure/Attempt History を保存します。
- Pending Dispatcher は Redis Dispatch Failure または Process Restart 後の Durable `QUEUED` View Execution を回復します。既存 Operator CLI は `GENERATE_VIEWS` の同一 Execution/Idempotency Key、5 回上限、Audit Contract で Manual Re-run できます。
- Provider Usage は Call ごとに Content-free `AiUsageLog` へ保存し、Prompt、Source、Generated Text、Raw Provider Detail は保存しません。
- 成功時は三 JSONB、`COMPLETED`、`completedAt`、Execution/Attempt `SUCCEEDED` を同じ Serializable Transaction で保存します。
- Shared `analysisViewsResourceSchema` は Completed Status/Time、三 View、最大 120 件の Unique/Referenced Evidence Projection を Strict/Bounded Contract として固定します。
- `GET /api/analyses/:analysisId/views` は Active Owner Scope を最初に解決し、Cross-owner/Missing/Deleted を同じ `404 ANALYSIS_NOT_FOUND`、未完成を `409 ANALYSIS_VIEWS_NOT_READY` とします。
- Read Service は三 JSONB、`completedAt`、Compliance、全 Direct Citation を再検証し、Active Document と FindingEvidence Lineage から Document Name、1-based Page、Original Excerpt、Chunk ID を再投影します。Corrupt/Missing Lineage は Sanitized `500 INTERNAL_SERVER_ERROR` で全体を Fail closed にします。
- OpenAPI は Bearer Security と `200/400/401/404/409/429/500` Response、View/Section/Block/Evidence DTO の Bound を公開します。
- Task 006 で新規 Runtime Dependency、Database Migration はありません。Public API は Approved Contract の Aggregate Read Endpoint を追加しました。

## Automated Evidence

- `packages/shared/src/analysis-views.spec.ts`: Required Section Order、Strict/Unknown、Japanese/Length、Direct/Unique Citation、Missing Information、Duplicate Block Key、Aggregate Character Limit、Budget、8 Compliance Cases を 14 Tests で検証しました。
- Targeted Shared Gate: 9 Suites / 50 Tests、Lint、Typecheck、Build が成功しました。
- Workspace Gate: Format、Spec Check 9 Features / 146 Requirements、7 Lint Tasks、10 Typecheck Tasks、233 Unit/Component Tests、7 Build Tasks が成功しました。
- `analysis-views-orchestrator.spec.ts`: One-call Request/Usage、stable full-source order、Injection Escape、Strict Unknown/Status Reject、pre-call Context Limit、post-call Authored Limit、Compliance Reject、UTF-8 Estimate を 7 Tests で検証しました。
- `prompt-asset.spec.ts`: Analysis Views Manifest/Template Hash、Schema Version、Untrusted/Three-view/Compliance Policy を 1 Test で検証しました。
- Task 003 Targeted Gate: Worker 20 Suites / 89 Tests、Lint、Typecheck、Shared Build が成功しました。
- Task 003 Workspace Gate: Format、Spec Check 9 Features / 146 Requirements、7 Lint Tasks、10 Typecheck Tasks、241 Unit/Component Tests、7 Build Tasks が成功しました。
- `analysis-views-citation-validator.spec.ts`: Exact Provider Input に含まれる Finding-linked Evidence ID だけを許可することを Unit で検証しました。
- `analysis-views-publish.integration-spec.ts`: Real PostgreSQL で Owner-scoped Source/Original Lineage、三 JSONB + Completion Atomic Publish、Unknown/Unlinked/Cross-owner Citation Reject、Compliance Pre-persist Reject、Input/Prompt/Delete Race、Duplicate Publish Fail-closed を 4 Tests で検証しました。
- Task 004 Full Gate: Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、7 Lint Tasks、10 Typecheck Tasks、242 Unit/Component Tests、7 Build Tasks、Integration 11 Suites / 70 Tests が成功しました。
- `analysis-views-generation.processor.spec.ts`: Citation Repair、3-call Validation Exhaustion、Transient Retry Signal、Duplicate Delivery No-op を 4 Tests で検証しました。
- `pending-analysis.dispatcher.spec.ts` / `job-operation-dispatch.spec.ts`: `GENERATE_VIEWS` の Stable Job Name、Pending Recovery、Manual Re-run Routing を検証しました。
- `analysis-views-worker.integration-spec.ts`: Real PostgreSQL/Redis/BullMQ で Pending Recovery → One Repair → Atomic Completion、Rate-limit Attempt 1 Failure → Attempt 2 Success、Validation Exhaustion → 同一 Execution Manual Re-run Attempt 2 Success、Usage Audit、No Duplicate Execution を 3 Tests で検証しました。
- Task 005 Integration Gate: 12 Suites / 73 Tests が成功しました。
- Task 005 Full Gate: Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、7 Lint Tasks、10 Typecheck Tasks、248 Unit/Component Tests、7 Build Tasks、Integration 12 Suites / 73 Tests が成功しました。
- `analysis-views.spec.ts`: Completed Aggregate、Exact Unique Citation Projection、Strict Unknown/Missing/Unused Evidence Reject の Read Contract Test を追加しました。
- `analysis-views.service.spec.ts`: Completed Projection、404 Owner Boundary、409 Not Ready、Corrupt JSONB/Completion、Missing/Page Lineage Fail-closed を 6 Tests で検証しました。
- `analyses.integration-spec.ts`: Real PostgreSQL + Bearer HTTP で Owner A Completed Aggregate、Owner B 404、Not Ready 409、FindingEvidence/Document/Page/Chunk Projection、Concrete OpenAPI を検証しました。
- Task 006 Targeted Gate: Shared 9 Suites / 53 Tests、API 18 Suites / 94 Tests、Shared/API Lint/Typecheck、PostgreSQL HTTP 1 Suite / 6 Tests が成功しました。
- Task 006 Full Gate: Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、7 Lint Tasks、10 Typecheck Tasks、256 Unit/Component Tests、7 Build Tasks、Integration 12 Suites / 74 Tests が成功しました。
- Deterministic Provider と PostgreSQL/Redis/BullMQ は接続済みです。Private Object Storage、Browser E2E は後続 Task で接続します。
- OpenAI Live Call は実行していません。Approved `VIEW-Q-007` に従い Provider Integration は `Partial` です。

## Acceptance Status

| Acceptance Criterion | Status        | Evidence / Gap                                                 |
| -------------------- | ------------- | -------------------------------------------------------------- |
| `VIEW-AC-001`        | `Passed`      | Fixed identity + Pending Dispatcher + real BullMQ              |
| `VIEW-AC-002`        | `Passed`      | Deterministic provider → atomic three-view completion          |
| `VIEW-AC-003`        | `Partial`     | Missing contract passed; generation pending                    |
| `VIEW-AC-004`        | `Passed`      | Owner/Finding/Document/Page/Chunk/Excerpt PostgreSQL           |
| `VIEW-AC-005`        | `Passed`      | Unknown/cross-owner/unlinked pre-persist rejection             |
| `VIEW-AC-006`        | `Passed`      | Orchestrator + repository pre-persist rejection                |
| `VIEW-AC-007`        | `Passed`      | Invalid citation → same Execution one-repair success           |
| `VIEW-AC-008`        | `Passed`      | Exhaustion + sanitized state + transient Attempt 2             |
| `VIEW-AC-009`        | `Passed`      | Race/duplicate/manual re-run/no duplicate Execution            |
| `VIEW-AC-010`        | `Passed`      | Completed Aggregate + Owner A/B real PostgreSQL HTTP           |
| `VIEW-AC-011`        | `Not started` | Responsive/keyboard three-view UI pending                      |
| `VIEW-AC-012`        | `Not started` | Evidence Drawer content/navigation pending                     |
| `VIEW-AC-013`        | `Not started` | Five-minute read presign + real PDF.js page pending            |
| `VIEW-AC-014`        | `Not started` | Memory token + refresh rotation UI pending                     |
| `VIEW-AC-015`        | `Partial`     | Content-free runtime usage passed; API/Storage/Browser pending |
| `VIEW-AC-016`        | `Partial`     | Escaped untrusted context; UI render pending                   |

## Quality Gates

| Command                 | Result |
| ----------------------- | ------ |
| `pnpm format:check`     | Passed |
| `pnpm spec:check`       | Passed |
| `pnpm lint`             | Passed |
| `pnpm typecheck`        | Passed |
| `pnpm test`             | Passed |
| `pnpm test:integration` | Passed |
| `pnpm build`            | Passed |

## Deviations and Residual Risks

- `VIEW-DEV-001` / `VIEW-DEV-002` の Material Decision は User-approved Option A で解消済みです。
- Runtime、Live Provider、Golden Dataset、Real PDF.js Navigation Evidence は未着手です。
- Task 002 Review では新規 Deviation を検出しませんでした。
- Task 003 Review では新規 Deviation を検出しませんでした。
- Task 004 Review では新規 Deviation を検出しませんでした。Durable Queue/Repair/Retry/Usage/Manual Re-run は Approved Task 005 の既知 Gap です。
- Task 005 Review では新規 Deviation を検出しませんでした。Durable Queue/Repair/Retry/Usage/Manual Re-run の既知 Gap は実装と Real PostgreSQL/Redis/BullMQ Evidence で解消しました。
- Task 006 Review では新規 Deviation を検出しませんでした。Private Object Storage、Browser Session/UI/PDF.js は Approved Task 007〜010 の既知 Gap です。

## Conclusion

Approved `VIEW-TASK-002`〜`006` の Shared Contract、Versioned Prompt、Bounded One-call Orchestrator、Owner-scoped Citation Resolution、Atomic Publish、Durable Queue/Repair/Retry/Recovery/Re-run、Completed-only Aggregate Read API は実装・検証済みです。Storage、Web、Live/Golden Evidence は未実装のため Feature は `Implementing` / `Partial` です。
