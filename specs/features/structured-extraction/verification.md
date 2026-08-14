# Structured Extraction Verification

## Metadata

| Field               | Value                                          |
| ------------------- | ---------------------------------------------- |
| Related Spec        | `specs/features/structured-extraction/spec.md` |
| Verification status | `Partial — implementation in progress`         |
| Last updated        | `2026-08-14`                                   |

## Implemented Evidence

- Shared `structuredExtractionOutputSchema` は Finding/Evidence Candidate の UUID、Category、Stable Key、Importance、String/Array Length、Unknown Field Reject を Strict Zod Contract として固定します。
- `DEFAULT_STRUCTURED_EXTRACTION_BUDGET` は 32 Chunks、48,000 Characters、4,096 Output Tokens、最大 3 Provider Calls、60 Seconds/Call を上限内 Default とします。
- Deterministic Compliance Validator は Model-authored Title/Body の Buy/Sell Recommendation、Target Price、Price/Return Prediction、Personalized Allocation、Trade Timing を Stable Violation Code に分類します。
- Evidence Excerpt は Original Source Data のため Compliance Scan 対象外とし、Provider-authored Prose と混同しません。
- `AnalysisStatus.READY_FOR_VIEW_GENERATION` は Prisma Enum、Migration、Shared Zod/API Projection に追加し、`completedAt = null` の Phase 5 Handoff として表現します。
- `AnalysisFinding`、`Evidence`、`FindingEvidence` と Document/Page/Chunk Lineage は Owner/Analysis/Document/Page を含む Composite FK で結び、Finding Importance は Database Check でも 1〜5 に限定します。
- Migration は Existing Finding/Evidence/Link の Owner/Lineage 不整合を Fail-fast Check し、`FindingEvidence.analysisId` を Backfill 後に `NOT NULL` とします。

## Automated Evidence

- `packages/shared/src/structured-extraction.spec.ts`: Strict Valid Output、Unknown Field、Importance/Length/Finding Count、Budget Ceiling、6 Compliance Categories、Evidence Excerpt Boundary。
- Targeted Shared Gate: 5 Suites / 29 Tests、Lint、Typecheck が成功しました。
- Targeted Migration/Database Gate: Fresh PostgreSQL Migration と Owner-scoped Repository Suite 17 Tests が成功し、Valid Finding/Evidence/Link、Handoff Status、Cross-owner Finding/Evidence、Cross-document Page/Chunk、Importance Check を確認しました。
- Full Workspace Gate: Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、154 Unit/Component Tests、Build、Docker Integration 6 Suites / 52 Tests が成功しました。

## Remaining Gaps

- Prompt、Metrics、Provider、Map/Merge、Evidence Content Validation/Persistence、Durable Queue、Evaluation は未実装です。
- Compliance Unit は検出 Contract を確認しましたが、Atomic Persist Reject と Repair Flow は未実装です。
- OpenAI Adapter は Official Design Reference を Technical Plan に反映しただけで、SDK/Runtime/Live Evidence は未実装です。

## Acceptance Status

| Acceptance Criterion | Status        | Evidence / Gap                                            |
| -------------------- | ------------- | --------------------------------------------------------- |
| `EXTRACT-AC-001`     | `Not started` | Durable Phase 4 start pending                             |
| `EXTRACT-AC-002`     | `Partial`     | Strict Shared Schema passed、Provider/Persist pending     |
| `EXTRACT-AC-003`     | `Not started` | Provider context integration pending                      |
| `EXTRACT-AC-004`     | `Not started` | Evidence validation/persist pending                       |
| `EXTRACT-AC-005`     | `Partial`     | Cross-owner/lineage DB reject passed、excerpt pending     |
| `EXTRACT-AC-006`     | `Not started` | Deterministic metric pipeline pending                     |
| `EXTRACT-AC-007`     | `Not started` | Missing/ambiguous metric fixture pending                  |
| `EXTRACT-AC-008`     | `Partial`     | Compliance unit passed、persist rejection pending         |
| `EXTRACT-AC-009`     | `Not started` | Repair success flow pending                               |
| `EXTRACT-AC-010`     | `Not started` | Repair exhaustion flow pending                            |
| `EXTRACT-AC-011`     | `Not started` | Provider retry/idempotency pending                        |
| `EXTRACT-AC-012`     | `Partial`     | Composite parent constraints passed、runtime race pending |
| `EXTRACT-AC-013`     | `Partial`     | Enum/Migration/Shared Handoff passed、runtime pending     |
| `EXTRACT-AC-014`     | `Partial`     | Content-free result、runtime log boundary pending         |

## Result

Approved Spec/Plan/Tasks と Shared Contract の最初の Slice は完了しました。Core Pipeline と Integration Evidence は未実装のため Feature は `Partial` です。
