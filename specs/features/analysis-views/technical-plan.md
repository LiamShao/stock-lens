# Analysis Views Technical Plan

## Metadata

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| Related Spec | `specs/features/analysis-views/spec.md` |
| Plan status  | `Approved`                              |
| Last updated | `2026-08-24`                            |

## Approach

Phase 4 の Atomic Publish が `READY_FOR_VIEW_GENERATION` に到達した後、同じ Analysis Queue に stable `GENERATE_VIEWS` Execution を作成します。Queue Payload は `jobExecutionId` のみとし、Worker は Owner、Active Analysis、Finding、Finding-linked Evidence、Financial Metrics、Active Prompt を Database から再解決します。

三 View は一回の bounded Structured Generation で Strict Zod Output として取得し、Direct Evidence ID、Required Section、Missing Information、Compliance を Server-side で検証します。成功後だけ既存三 JSONB、`COMPLETED`、`completedAt` を一 Transaction で置換します。Provider Candidate、Partial View、Evidence Excerpt の複製は永続化しません。

API は既存 Metadata Polling と View Payload を分離します。Completed-only Aggregate API は View Block と Unique Evidence Projection を返します。PDF Read URL は Owner/Analysis/Document を再確認して最大 5 分で発行します。Web は Access Token を Memory に限定し、既存 HttpOnly Refresh Cookie で Session を回復して Login、History、Detail、Evidence Drawer、PDF.js Viewer を接続します。

## Affected Files

| Area       | Files / Directories                                     | Change                                                   |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Shared     | `packages/shared/src/analysis-views*`, `index.ts`       | Strict View/Read/Download Schema、Budget、Compliance     |
| Prompt     | `prompts/analysis-views/*`                              | Git-tracked Versioned Three-view Prompt                  |
| Worker AI  | `apps/worker/src/ai/*`                                  | Bounded Context、One-call Orchestration、Repair          |
| Worker DB  | View Repository/Processor/Dispatcher                    | Owner Resolution、Atomic Publish、Retry、Idempotency     |
| Prisma     | Existing Schema + append-only migration if needed       | Existing JSONB/JobStep の Integrity Review               |
| API        | Analysis View Repository/Service/Controller/OpenAPI     | Completed Aggregate Read API                             |
| Storage    | `packages/object-storage/*`, Documents API              | Read-only Presign、Owner-scoped Download URL             |
| Web        | `apps/web/src/app/*`, client/session/components         | Login、History、Detail、View、Drawer、PDF.js             |
| Tests      | Shared/Worker/API/Web/E2E/Evaluation                    | Contract、Race、Authorization、Accessibility、Navigation |
| Docs/Specs | AI Pipeline、Evidence、Security、API、Testing、Progress | Runtime Contract、Verification、Residual Risk            |

## Shared Contract

- Root は `justTellMe`、`analystView`、`buffettMunger` の三 Field だけを持つ Strict Object とします。
- 各 View は固定順の Required Section を一度ずつ持ち、Section/Block Key は bounded stable identifier とします。
- Block は Plain Japanese Text、`evidenceIds`、`isMissingInformation` を持ちます。通常 Block は Citation 1 件以上、Missing Block は 0 件以上を許可します。
- Root の Section/Block/Citation/Total Character と Provider Context/Output/Call/Timeout を bounded にします。
- Compliance は既存 Investment Advice Code に Buffett/Munger Impersonation と False Endorsement を追加し、Model-authored Text だけを検査します。

## Durable Generation and Atomic Publish

- Phase 4 Success は Analysis/Input/Prompt/Schema/Provider Identity から `GENERATE_VIEWS` Execution を upsert し、Redis Failure は Pending Dispatcher が回復します。
- Context は validated Finding/Evidence を escaped untrusted user block に置き、System Prompt へ補間しません。
- Initial 1 + Repair 最大 2 Calls、Transient Error は BullMQ 最大 3 Attempts とします。
- Citation は同じ Analysis の Active Evidence かつ Provider Input に含めた ID だけを許可します。
- Commit 前に Owner、Active Parent、Input Hash、Prompt Version を再確認し、三 JSONB、Status、Timestamp、Job/Usage を Atomic Persist します。

## API and Object Storage

- `GET /api/analyses/:analysisId/views` は Controller → Service → Repository を維持し、Controller は Prisma を呼びません。
- Missing/Cross-owner は `404 ANALYSIS_NOT_FOUND`、未完成は `409 ANALYSIS_VIEWS_NOT_READY`、Corrupt Persisted Output は sanitized server error とします。
- Evidence は Unique ID ごとに `id/documentId/documentName/pageNumber/excerpt/chunkId` を投影し、JSONB に Excerpt を複製しません。
- `POST /api/analyses/:analysisId/documents/:documentId/download-url` は Active lineage を確認し、S3 `GetObject` の URL と expiry だけを返します。
- Storage Provider Error は Coordinate/Endpoint を除去して `503 DOCUMENT_DOWNLOAD_UNAVAILABLE` とします。

## Web Session and UI

- API Client は `credentials: include` と in-memory Access Token を使い、Initial Refresh と 401 時の single-flight Refresh/一回 Replay を実装します。
- Login Form は React Hook Form + Shared Zod、Server State は TanStack Query を使用します。追加 Dependency と理由は導入 Task で記録します。
- History/Detail は Status を bounded polling し、Completed 時だけ View Query を有効化します。
- View Tabs と Evidence Drawer は Keyboard、Visible Focus、Semantic Heading/Button、Responsive Layout を満たします。
- PDF 操作時だけ Read URL を取得し、URL を永続 Cache/Log/Analytics に送りません。
- PDF.js は version-matched bundled Worker を使い、PDF Embedded JavaScript、Tool Request、Automatic External Navigation を実行しません。

## Test Strategy

| Requirement                       | Level                          | Evidence                                                            |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `VIEW-AC-001`〜`VIEW-AC-009`      | Unit + PostgreSQL/Redis/BullMQ | Durable chain、schema、citation、repair/retry、atomicity、race      |
| `VIEW-AC-010`, `AC-013`, `AC-015` | API/Storage Integration        | Bearer A/B、not-ready、real read presign、missing object、redaction |
| `VIEW-AC-011`, `AC-012`, `AC-014` | Vitest/RTL + Playwright        | Session recovery、tabs、drawer、keyboard、responsive、PDF page      |
| `VIEW-AC-006`, `AC-016`           | Security Unit/Evaluation       | Advice/impersonation、prompt injection、plain-text render           |

CI は Deterministic Provider を使用します。OpenAI Live Smoke は明示 opt-in の content-free Artifact とし、Passed Artifact がない間 Provider Integration は `Partial` です。Mocked Viewer だけで PDF Navigation を Passed としません。

## Rollout and Rollback

1. Shared Schema/Compliance と Prompt Asset を先に公開し、Runtime Behavior は変えません。
2. Worker Generation/Atomic Publish、Aggregate API、Read Presign を順に有効化します。
3. Web Session/History/Detail、View/Drawer、PDF.js を分層して接続します。
4. Rollback は Dispatch を停止して Worker/API/Web を戻し、Job/Usage/Prompt Audit と成功済み Output を保持します。

## Risks and Mitigations

- One-call Three-view Output は Limit に達し得ます。Required Section と Total Character Budget を固定し、Silent Truncation を拒否します。
- JSONB は Field-level Constraint を持ちません。全 Write/Read で Shared Strict Parse し、Atomic Integration で Partial Set を拒否します。
- Memory Token は Reload で失われます。HttpOnly Cookie Rotation で Session を回復し、localStorage Exposure を避けます。
- PDF.js は Bundle/CSP/Worker Complexity を増やします。Version-matched Asset と実 PDF Navigation/Security Test を必須にします。
- Buffett-Munger Lens の Phase 5 前倒しは `VIEW-Q-001` Approval を Source of Truth とし、Phase 6 は Embedding/RAG に限定します。
