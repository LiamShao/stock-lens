# Analysis Views Technical Plan

## Metadata

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| Related Spec | `specs/features/analysis-views/spec.md` |
| Plan status  | `Approved`                              |
| Last updated | `2026-09-01`                            |

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
- Download Response は Shared Strict Schema の `url` / `expiresAt` だけとし、`Cache-Control: no-store` を返します。Repository は Active Owner/Analysis/Finalized Document を解決し、Runtime Bucket 一致と Object `HEAD` を確認してから最大 300 秒の `GetObject` URL を発行します。
- Read Presign は既存 Object Storage Config/Dependency を再利用し、Database Migration と新規 Runtime Dependency を追加しません。

## Web Session and UI

- API Client は `credentials: include` と in-memory Access Token を使い、Initial Refresh と 401 時の single-flight Refresh/一回 Replay を実装します。
- API Origin は `NEXT_PUBLIC_API_BASE_URL` で明示し、未指定時は Local API の `http://localhost:3001/api` を使用します。Browser Storage、URL、Cookie 以外の永続領域へ Token を保存しません。
- Session Bootstrap 中は Protected Query を開始せず、Refresh 成功後だけ History/Detail を有効化します。Refresh 失敗、または Replay 後も 401 の場合は Memory Session を Clear して Login へ戻します。
- Login Form は React Hook Form + Shared Zod、Server State は TanStack Query を使用します。追加 Dependency と理由は導入 Task で記録します。
- History/Detail は Status を bounded polling し、Completed 時だけ View Query を有効化します。
- Metadata Polling は 5 秒間隔、Page Mount から最大 5 分とし、`PARSING`、`CHUNKING`、`READY_FOR_EMBEDDING`、`EMBEDDING`、`EXTRACTING`、`VALIDATING`、`READY_FOR_VIEW_GENERATION` だけを対象にします。`DRAFT`、`UPLOADED`、`COMPLETED`、全 Failed Status では停止します。
- View Tabs と Evidence Drawer は Keyboard、Visible Focus、Semantic Heading/Button、Responsive Layout を満たします。
- Tabs は ARIA `tablist/tab/tabpanel`、Arrow Left/Right、Home/End を実装します。Evidence Drawer は Modal `dialog`、Initial Close Focus、Tab Focus Trap、Escape Close、Trigger Focus Restore、Background Overlay を実装し、Task 010 まで Download URL を取得しません。
- PDF 操作時だけ Read URL を取得し、URL を永続 Cache/Log/Analytics に送りません。
- PDF.js は version-matched bundled Worker を使い、PDF Embedded JavaScript、Tool Request、Automatic External Navigation を実行しません。
- Task 010 は Citation Evidence の操作後にだけ既存 Read Presign API を直接呼び、Response を TanStack Query Cache、Browser Storage、DOM Link、Telemetry に保持しません。Presigned URL は `cache: no-store`、`credentials: omit`、Redirect Reject で一度だけ PDF Bytes の取得に使い、その後 State に残しません。
- Browser Boundary は `Content-Length` がある場合と実 Byte Length の両方を 20 MB 以下に制限し、`application/pdf` Response と `%PDF-` Header を検証します。Failure は URL、Storage Coordinate、Raw PDF Error を含まない安定した日本語 Error に収束し、Retry は新しい Read Presign から開始します。
- Embedded Viewer は `pdfjs-dist@6.2.108` の Main Library と同 Version の bundled Worker を使用し、XFA 無効、Canvas-only Rendering、Annotation/Link/Text/Scripting Layer 非生成で Untrusted PDF Action を無効化します。Evidence の 1-based Page を初期 Page として厳密に検証し、Previous/Next Control で Document 範囲内を移動します。Unmount 時は Render Task と Document Loading Task を破棄します。
- Task 010 では Web Package に Workspace 既存 Version の `pdfjs-dist` Direct Runtime Dependency を追加します。Database Migration と Public API 変更はありません。

Task 008 では `@tanstack/react-query@5.102.8` を Server State、`react-hook-form@7.87.0` と `@hookform/resolvers@5.9.1` を Shared Zod Login Form、`zod@4.4.3` と既存 `@stocklens/shared` Workspace Package を Browser Response Boundary に使用します。Session/Query/Form を個別実装せず、既存 Strict Contract と React 19 対応 Library を再利用するための追加です。

## Test Strategy

| Requirement                       | Level                          | Evidence                                                            |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `VIEW-AC-001`〜`VIEW-AC-009`      | Unit + PostgreSQL/Redis/BullMQ | Durable chain、schema、citation、repair/retry、atomicity、race      |
| `VIEW-AC-010`, `AC-013`, `AC-015` | API/Storage Integration        | Bearer A/B、not-ready、real read presign、missing object、redaction |
| `VIEW-AC-011`, `AC-012`, `AC-014` | Vitest/RTL + Playwright        | Session recovery、tabs、drawer、keyboard、responsive、PDF page      |
| `VIEW-AC-006`, `AC-016`           | Security Unit/Evaluation       | Advice/impersonation、prompt injection、plain-text render           |

CI は Deterministic Provider を使用します。OpenAI Live Smoke は明示 opt-in の content-free Artifact とし、Passed Artifact がない間 Provider Integration は `Partial` です。Mocked Viewer だけで PDF Navigation を Passed としません。

Task 011 は既存 Real PostgreSQL/Redis/BullMQ/MinIO Integration Matrix と、新しい Playwright Full-stack Browser Flow を一つの `pnpm e2e` Gate で構成します。Playwright Global Setup は Testcontainers の一時 PostgreSQL/Redis/Private MinIO、Migration、Built API/Web、Owner A/B と Completed View/Evidence/PDF Fixture を隔離起動し、終了時に Process/Container を破棄します。固定 Web/API Port が使用中なら既存 Process を停止せず Fail closed にします。

Browser Flow は Login、HttpOnly Refresh Cookie、History/Detail、Three ARIA Tabs、Missing Information、Evidence Drawer、Plain-text Injection Sentinel、Responsive Layout、Real Read Presign/MinIO GET/PDF.js Worker/Exact Page/Next Page、Reload Session Recovery を検証します。Owner B は Analysis/View/Download を同じ `404` とし、API Log/Browser Storage/DOM/URL が Password、Token、Full Excerpt、Storage Key、Presigned URL を含まないことを検査します。

E2E PDF は `.gitignore` 対象の Local IR PDF に依存せず、Test Code が deterministic に生成する Git-tracked Three-page PDF Bytes を MinIO へ Upload します。PDF.js Unit も同じ方式の Real Parser/Page Evidence に変更し、Mock-only Evidence を避けます。

Analysis Views 用 OpenAI Live Harness は既存 Production Adapter と Git-tracked `analysis-views` Prompt を明示 opt-in 時だけ一回呼び、Strict Three-view、Japanese、Direct Citation、Missing Information、Compliance、Prompt Injection Defense を評価します。Result は Version/Usage/Boolean/Count の Content-free JSON のみとし、Passed Artifact がない状態は `Partial` のままです。

Task 011 では Test-only Workspace に `@playwright/test@1.61.1`、既存 Version の Testcontainers/Prisma/Workspace Packages を追加します。Production Runtime Dependency、Database Migration、Public API 変更はありません。

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
