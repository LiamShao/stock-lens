# Analysis Views Verification

## Metadata

| Field               | Value                                   |
| ------------------- | --------------------------------------- |
| Related Spec        | `specs/features/analysis-views/spec.md` |
| Verification status | `Partial — shared contract implemented` |
| Last updated        | `2026-08-24`                            |

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
- Result は validated Output、Unique Source Finding/Evidence Count、Provider/Model/Token/Latency/Request ID Usage のみを返し、Prompt/Context/Source を Usage に含めません。Database Usage Persist は Task 004/005 で接続します。
- 新規 Runtime Dependency、Database、API の変更はありません。

## Automated Evidence

- `packages/shared/src/analysis-views.spec.ts`: Required Section Order、Strict/Unknown、Japanese/Length、Direct/Unique Citation、Missing Information、Duplicate Block Key、Aggregate Character Limit、Budget、8 Compliance Cases を 14 Tests で検証しました。
- Targeted Shared Gate: 9 Suites / 50 Tests、Lint、Typecheck、Build が成功しました。
- Workspace Gate: Format、Spec Check 9 Features / 146 Requirements、7 Lint Tasks、10 Typecheck Tasks、233 Unit/Component Tests、7 Build Tasks が成功しました。
- `analysis-views-orchestrator.spec.ts`: One-call Request/Usage、stable full-source order、Injection Escape、Strict Unknown/Status Reject、pre-call Context Limit、post-call Authored Limit、Compliance Reject、UTF-8 Estimate を 7 Tests で検証しました。
- `prompt-asset.spec.ts`: Analysis Views Manifest/Template Hash、Schema Version、Untrusted/Three-view/Compliance Policy を 1 Test で検証しました。
- Task 003 Targeted Gate: Worker 20 Suites / 89 Tests、Lint、Typecheck、Shared Build が成功しました。
- Task 003 Workspace Gate: Format、Spec Check 9 Features / 146 Requirements、7 Lint Tasks、10 Typecheck Tasks、241 Unit/Component Tests、7 Build Tasks が成功しました。
- Deterministic Provider、PostgreSQL、Redis/BullMQ、Private Object Storage、Browser E2E は後続 Task で接続します。
- OpenAI Live Call は実行していません。Approved `VIEW-Q-007` に従い Provider Integration は `Partial` です。

## Acceptance Status

| Acceptance Criterion | Status        | Evidence / Gap                                      |
| -------------------- | ------------- | --------------------------------------------------- |
| `VIEW-AC-001`        | `Not started` | Durable `GENERATE_VIEWS` chain pending              |
| `VIEW-AC-002`        | `Partial`     | Deterministic one-call output; atomic DB pending    |
| `VIEW-AC-003`        | `Partial`     | Missing contract passed; generation pending         |
| `VIEW-AC-004`        | `Partial`     | Direct citation shape passed; DB lineage pending    |
| `VIEW-AC-005`        | `Not started` | Unknown/cross-owner/unlinked rejection pending      |
| `VIEW-AC-006`        | `Partial`     | Pure orchestrator rejection; persist pending        |
| `VIEW-AC-007`        | `Not started` | Same-attempt bounded repair pending                 |
| `VIEW-AC-008`        | `Not started` | Exhaustion/sanitized failure integration pending    |
| `VIEW-AC-009`        | `Not started` | Duplicate/re-run/delete/input race pending          |
| `VIEW-AC-010`        | `Not started` | Completed Aggregate Owner A/B API pending           |
| `VIEW-AC-011`        | `Not started` | Responsive/keyboard three-view UI pending           |
| `VIEW-AC-012`        | `Not started` | Evidence Drawer content/navigation pending          |
| `VIEW-AC-013`        | `Not started` | Five-minute read presign + real PDF.js page pending |
| `VIEW-AC-014`        | `Not started` | Memory token + refresh rotation UI pending          |
| `VIEW-AC-015`        | `Partial`     | Content-free usage result; runtime logs pending     |
| `VIEW-AC-016`        | `Partial`     | Escaped untrusted context; UI render pending        |

## Quality Gates

| Command                 | Result |
| ----------------------- | ------ |
| `pnpm format:check`     | Passed |
| `pnpm spec:check`       | Passed |
| `pnpm lint`             | Passed |
| `pnpm typecheck`        | Passed |
| `pnpm test`             | Passed |
| `pnpm test:integration` | TBD    |
| `pnpm build`            | Passed |

## Deviations and Residual Risks

- `VIEW-DEV-001` / `VIEW-DEV-002` の Material Decision は User-approved Option A で解消済みです。
- Runtime、Live Provider、Golden Dataset、Real PDF.js Navigation Evidence は未着手です。
- Task 002 Review では新規 Deviation を検出しませんでした。
- Task 003 Review では新規 Deviation を検出しませんでした。

## Conclusion

Approved `VIEW-TASK-002`〜`003` の Shared Contract、Versioned Prompt、Bounded One-call Orchestrator は実装・検証済みです。Owner-scoped Database Resolution、Atomic Publish、Durable Queue、API、Storage、Web、Live/Golden Evidence は未実装のため Feature は `Implementing` / `Partial` です。
