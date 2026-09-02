# StockLens AI 開発進捗

## 2026-09-02

### P0 Web Analysis Intake Draft

- Browser-only P0 Journey を監査し、Backend Registration/Analysis/Upload/Process API が存在する一方、Web は Login/History/Read Flow に限定され、新規 User が Analysis を作成できない `INTAKE-DEV-001` を記録しました。
- `specs/features/web-analysis-intake/spec.md` と `decision-request.md` を Draft として作成し、Registration、Explicit Analysis Create、最大 3 PDF の Direct Upload/Finalize、Document Delete、明示的 Process Start、Full Browser Acceptance を Requirement 化しました。
- Route、Registration Redirect、Company Scope、Parallel Upload、Browser Integrity、Explicit Processing、Draft Cleanup、E2E Provider Boundary を `INTAKE-Q-001`〜`008` として可視化しました。Approval 前のため Technical Plan、Tasks、Runtime は変更していません。

### Phase 5 Analysis Views Final Audit

- Approved `VIEW-TASK-012` として Architecture、AI Pipeline、Evidence Model、Feature Verification、Traceability、Deviation を実装状態へ同期しました。新規 Deviation、Database Migration、Public API、Dependency、Production Code 変更はありません。
- `INSUFFICIENT_EVIDENCE` を含む Live-shaped Deterministic Harness と Browser の Missing Information 表示を `VIEW-FR-008` / `VIEW-AC-003` の Evidence に反映し、全 Acceptance Criterion を `Passed` に収口しました。
- Final Gate は Prisma Generate/Validate、Format、Spec Check 9 Features / 146 Requirements、8 Lint Tasks、11 Typecheck Tasks、297 Unit/Component Tests、Real PostgreSQL/Redis/BullMQ/MinIO Integration 12 Suites / 75 Tests、7 Build Tasks、Playwright Chromium 2 Tests が成功しました。
- Production OpenAI Live Passed Artifact、5 社 / 15 PDF Golden Dataset、Firefox/WebKit Coverage は未取得のため、Feature は `Implemented` / `Partial` です。

## 2026-09-01

### Phase 5 Full-stack Analysis Views E2E and Live Harness

- Approved `VIEW-TASK-011` として `apps/e2e` Playwright Workspace を追加し、`pnpm e2e` を Real Integration → Production Build → Full-stack Browser Acceptance の一つの Gate にしました。
- E2E は専用 PostgreSQL/Redis/Private MinIO、空 Migration、Built API/Web、Owner A/B を起動します。追跡対象 Test Code が生成する Valid 3-page PDF を Presigned PUT し、Login/HttpOnly Refresh Cookie/History/Detail、Three-view Keyboard、Mobile Drawer、Plain-text Injection、Real Presigned GET/PDF.js Page 2 → 3、Reload Recovery、Cross-owner 404、URL/Storage/DOM/Log Redaction を Chromium で検証します。
- `VIEW-DEV-004` で検出した ignored Local IR PDF 依存を削除し、Fresh Checkout で再現可能な Synthetic Real-PDF + Browser Evidence に置換しました。
- Analysis Views 専用の `pnpm openai:live-analysis-views` を追加しました。明示 opt-in 後だけ Production Adapter を 1 Call 使用し、Content-free Report で Three-view、Japanese、Citation、Lineage、Missing、Compliance、Injection Defense を評価します。Deterministic Harness 2 Tests と opt-in 無効時の Pre-network Fail-closed を確認しました。Live Passed Artifact は未取得です。
- Test-only Dependency として `@playwright/test@1.61.1` を追加しました。Database Migration、Production Dependency、Public API 変更はありません。Chromium 以外の Browser Engine と 5社/15 PDF Golden Dataset は残存 Gap です。
- Task 011 Full Gate は Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、8 Lint Tasks、11 Typecheck Tasks、297 Unit/Component Tests、Real PostgreSQL/Redis/BullMQ/MinIO Integration 12 Suites / 75 Tests、7 Build Tasks、Playwright Chromium 2 Tests が成功しました。次は Approved `VIEW-TASK-012` の Documentation、Verification、Traceability、Deviation Audit です。

### Phase 5 Evidence PDF.js Viewer

- Approved `VIEW-TASK-010` として、Evidence Drawer の明示操作時だけ Owner-scoped Read Presign を取得し、PDF.js Embedded Canvas Viewer で Evidence の 1-based Page を開く Flow を実装しました。Previous/Next Page Navigation と Request/Render/Document Cleanup を持ちます。
- Presigned URL は Query Cache、Browser Storage、DOM、Log に保存せず、`no-store` / Credential Omit / Redirect Reject の一回の Byte Fetch に限定します。Browser Boundary で `application/pdf`、20 MB、`%PDF-` を再検証し、Storage/API/PDF Error は固定日本語 Message に収束します。
- PDF.js は `pdfjs-dist@6.2.108` の Version-matched bundled Worker、XFA 無効、Canvas-only Rendering を使用し、Annotation/Link/Text/Scripting Layer を生成しません。Web Package に Workspace 既存 Version の直接 Runtime Dependency を追加しました。Database Migration と Public API 変更はありません。
- Web Targeted Gate は 8 Files / 28 Tests、Lint、Typecheck、Production Build が成功し、Build Asset に bundled PDF Worker を確認しました。Real Repository IR PDF の第 10 Page Load、Evidence Page 12 → 13 Canvas Navigation、URL No-DOM、Abort、既存 Real MinIO/Owner Boundary を検証しています。
- Full Gate は Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、7 Lint Tasks、10 Typecheck Tasks、295 Unit/Component Tests、7 Build Tasks、Real PostgreSQL/Redis/BullMQ/MinIO Integration 12 Suites / 75 Tests が成功しました。Sandbox 内 Workspace Build は Turbopack/PostCSS の Port Bind 制限で失敗し、承認済み Sandbox 外再実行が成功しました。
- Task 010 Review で新規 Deviation は検出しませんでした。Full Browser Cross-service E2E は Approved `VIEW-TASK-011` に残します。

### Phase 5 Analysis View Tabs and Evidence Drawer

- Approved `VIEW-TASK-009` として、Analysis Metadata の 5 秒間隔・最大 5 分・Active Status 限定 Polling、`COMPLETED` 後だけ有効になる Strict View Query、三 View の Responsive ARIA Tabs を実装しました。
- Section/Block、Missing Information、Compliance Notice、Buffett-Munger Non-impersonation/Non-endorsement Disclaimer と Citation Trigger を Plain Text で描画し、Evidence Drawer に Document Name、1-based Page、Original Excerpt を表示します。
- Drawer は Initial Focus、Tab Focus Trap、Escape/Overlay Close、Trigger Focus Restore、Body Scroll Lock を持ちます。Read Presign/PDF.js は Task 010 まで呼びません。Database Migration、Public API、新規 Dependency はありません。
- `VIEW-DEV-003` として Client Polling 未実装時の `VIEW-SEC-009 Passed` 過早表記を記録し、bounded Polling Implementation/Test と Traceability 修正で解消しました。
- Full Gate は Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、7 Lint Tasks、10 Typecheck Tasks、287 Unit/Component Tests、7 Build Tasks、Real PostgreSQL/Redis/BullMQ/MinIO Integration 12 Suites / 75 Tests が成功しました。次は Approved `VIEW-TASK-010` の PDF.js Embedded Viewer、Page Navigation、Untrusted PDF Action Boundary です。

### Phase 5 Browser Session and Metadata Shell

- Approved `VIEW-TASK-008` として、`credentials: include` / `cache: no-store` の Strict Web API Client、Memory-only Access Token、Initial Refresh、Concurrent `401` single-flight Rotation、各 Request 一回 Replay、Failure 時の Session/Query Cache Clear を実装しました。
- React Hook Form + Shared Zod の `/login`、TanStack Query の Owner-scoped `/analyses` History と `/analyses/:analysisId` Detail Shell、Logout、Stable Japanese Error と Compliance Notice を追加しました。View/Drawer/PDF.js は Task 009/010 へ維持しています。
- `@tanstack/react-query`、`react-hook-form`、`@hookform/resolvers`、`zod` と既存 Shared Workspace Package を Web Dependency に追加しました。Database Migration と Public API 変更はありません。
- Full Gate は Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、7 Lint Tasks、10 Typecheck Tasks、278 Unit/Component Tests、7 Build Tasks、Real PostgreSQL/Redis/BullMQ/MinIO Integration 12 Suites / 75 Tests が成功しました。次は Approved `VIEW-TASK-009` の View Tabs、Status Polling、Responsive/Accessible Evidence Drawer です。

## 2026-08-31

### Phase 5 Private PDF Read Presign

- Approved `VIEW-TASK-007` として `POST /api/analyses/:analysisId/documents/:documentId/download-url`、Shared Strict Response、Owner-scoped Repository/Service、Concrete OpenAPI を実装しました。
- Active Owner/Analysis/Finalized Document、Runtime Bucket、Object Existence を確認してから、単一 PDF `GetObject` の URL を最大 300 秒で発行し、`Cache-Control: no-store` を返します。
- Cross-user/Missing は `404`、Missing Object/Provider Failure/Bucket Mismatch は Storage Detail を除去した `503 DOCUMENT_DOWNLOAD_UNAVAILABLE` に収束し、Download URL の Logger Redaction を追加しました。
- Full Gate は Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、7 Lint Tasks、10 Typecheck Tasks、267 Unit/Component Tests、7 Build Tasks、Real PostgreSQL/Redis/BullMQ/MinIO Integration 12 Suites / 75 Tests が成功しました。Database Migration と新規 Dependency はありません。
- 次は Approved `VIEW-TASK-008` の Web API Client、In-memory Session、Login/Refresh/Logout、History/Detail Shell です。

## 2026-08-30

### Phase 5 Completed-only Analysis Views Read API

- Approved `VIEW-TASK-006` として `GET /api/analyses/:analysisId/views`、Shared Strict Aggregate Schema、Owner-scoped Repository/Service、Concrete OpenAPI を実装しました。
- `COMPLETED` と `completedAt`、三 JSONB、Compliance、Direct Citation を Read 時に再検証し、Active FindingEvidence/Document/Page Lineage から Unique Evidence を投影します。Cross-user/Missing は `404`、未完成は `409`、Corrupt/Missing Lineage は Sanitized `500 INTERNAL_SERVER_ERROR` で全体を Fail closed にします。
- Shared/API Unit 147 Tests と Targeted Real PostgreSQL HTTP 1 Suite / 6 Tests が成功しました。Database Migration と新規 Dependency はありません。
- Full Gate は Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、7 Lint Tasks、10 Typecheck Tasks、256 Unit/Component Tests、7 Build Tasks、Integration 12 Suites / 74 Tests が成功しました。
- 次は Approved `VIEW-TASK-007` の Read-only Presign Adapter/API、5 分 Expiry、Missing/Provider Failure、Redaction Integration です。

## 2026-08-28

### Phase 5 Durable Analysis View Generation

- Approved `VIEW-TASK-005` として、Phase 4 Atomic Publish から Exact Source Hash、Active Prompt/Schema、Provider/Model Runtime Hash を固定した一意の Durable `GENERATE_VIEWS` Execution を同一 Transaction で作成する Handoff を実装しました。
- View Worker は Owner-scoped Source を Database から再解決し、Initial 1 + Repair 最大 2 Calls、BullMQ 最大 3 Attempts、Content-free Usage Audit、Sanitized `FAILED_VALIDATION` / `FAILED_EXTRACTION` を実装しました。
- Pending Dispatcher と Guarded Operator CLI は `GENERATE_VIEWS` を扱い、Redis Dispatch Failure、Process Restart、Manual Re-run を同一 Execution/Idempotency Key と Audit へ収束させます。
- Real PostgreSQL/Redis/BullMQ で Pending Recovery → Citation Repair → Atomic Completion、Transient Attempt 2 Success、Validation Exhaustion → Manual Re-run Attempt 2 Success、No Duplicate Execution を検証しました。
- Full Gate は Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、7 Lint Tasks、10 Typecheck Tasks、248 Unit/Component Tests、7 Build Tasks、Integration 12 Suites / 73 Tests が成功しました。次は Approved `VIEW-TASK-006` の Completed-only Aggregate Read API、Shared Projection、OpenAPI、Owner A/B Integration です。

## 2026-08-24

### Phase 5 Analysis Views Draft

- Phase 4 の次の最小 SDD Step として `analysis-views` Draft Spec と Decision Request を作成しました。Approval 前のため Runtime、Public API、Database、Object Storage、Web Behavior は変更していません。
- Just Tell Me、Analyst View、Buffett-Munger Lens、Atomic View Publish、Direct Evidence Citation、Owner-scoped Read API、Evidence Drawer、PDF Page Navigation、Browser Session Boundary を Requirement/Acceptance Criteria 化しました。
- Web が Phase 1 Landing Page のみで Auth/History/Detail が未実装の `VIEW-DEV-001`、Phase 5/6 の View 分割に対して Partial Completion Status がない `VIEW-DEV-002` を検出し、隠さず Open Deviation として記録しました。
- 次は `VIEW-Q-001`〜`VIEW-Q-007` の User Decision です。承認後に Technical Plan と Requirement-linked Tasks を作成し、実装を開始します。
- User は `VIEW-Q-001`〜`VIEW-Q-007` の Option `A` をすべて承認しました。三 View One-call/Atomic Publish、Direct Evidence ID、Completed-only Aggregate API、最小 Web Foundation、PDF.js Viewer、Deterministic CI + Opt-in Live を Baseline とします。
- `VIEW-TASK-002` として、三 View の固定 Required Section、Strict Japanese Block、Direct/Unique Evidence ID、Missing Information、Count/Character/Call/Timeout Budget を Shared Zod Contract に固定しました。
- 既存 Investment Advice Scanner を安全に再利用し、Buffett/Munger Impersonation と Buffett/Munger/Berkshire False Endorsement の deterministic validator を追加しました。新規 Dependency はありません。
- Format、Spec Check 9 Features / 146 Requirements、Lint、Typecheck、233 Unit/Component Tests、7-package Build が成功しました。次は Approved `VIEW-TASK-003` の Versioned Prompt、Bounded Untrusted Context、One-call Orchestrator、Usage Audit です。
- `VIEW-TASK-003` として Git-tracked Analysis Views Prompt、Strict Finding/Evidence/Metric Source DTO、stable ordering、escaped single untrusted block、One-call `AnalysisViewsOrchestrator` を実装しました。
- Full Source が Context/Conservative UTF-8 Token Limit を超える場合は Provider Call 前に失敗し、Output は Shared Schema、custom Authored Character Budget、Compliance を再検証します。Usage Result は Content-free Metadata だけです。
- Worker 20 Suites / 89 Tests、Workspace Format、Spec、Lint、Typecheck、241 Unit/Component Tests、7-package Build が成功しました。次は Approved `VIEW-TASK-004` の Owner-scoped Citation Validator、Atomic JSONB Publish、Completion/Input Race です。
- `VIEW-TASK-004` として Active Owner/Analysis/FindingEvidence/Document/Page/Chunk/Excerpt/Financial Metrics を再解決する View Source Repository と Exact Input Hash、Direct Citation Validator を実装しました。
- Unknown/Unlinked/Cross-owner Evidence、Compliance Violation、Input/Prompt/Delete Race を Persist 前に拒否し、成功時だけ三 View JSONB、`COMPLETED`、`completedAt` を Serializable Transaction で原子的に保存します。新規 Dependency/Database Migration/API 変更はありません。
- Citation Unit 1 Test と Real PostgreSQL Integration 4 Tests を追加しました。Full Gate は Format、Spec Check 9 Features / 146 Requirements、Prisma Validate/Generate、7 Lint Tasks、10 Typecheck Tasks、242 Unit/Component Tests、7 Build Tasks、Integration 11 Suites / 70 Tests が成功しました。次は Approved `VIEW-TASK-005` の Durable `GENERATE_VIEWS` Queue、Repair/Retry、Pending Recovery、Manual Re-run です。

## 2026-08-20

### Phase 4 OpenAI Live Evaluation Harness

- Approved `EXTRACT-TASK-011` として、Production `OpenAiLlmProvider`、Git-tracked Prompt、malicious instruction を含む synthetic source を使用する opt-in Live Evaluation CLI を追加しました。
- `ALLOW_OPENAI_LIVE_EVALUATION=true`、API Key、Model が明示された場合だけ Responses API を 1 回呼び、Schema、Japanese Output、Evidence Coverage、Exact Source Lineage、Compliance、Prompt Injection Defense を評価します。
- Result は Provider/Model/Prompt/Schema Version、Token、Latency、Provider Request ID、Check Boolean だけの content-free JSON とし、Prompt、Source、Generated Text を含めません。
- Worker Lint、Typecheck、19 Suites / 81 Tests が成功し、未 opt-in CLI が Provider Call 前に Stable Sanitized Error で終了することを確認しました。
- Credential/Cost を伴う Live Call は実行していないため、Approved `EXTRACT-Q-007` に従い Provider Integration は `Partial` を維持します。次は `EXTRACT-TASK-012` の Documentation/Traceability Audit と Full Quality Gate です。
- `EXTRACT-TASK-012` として AI Pipeline、Evidence Model、Evaluation 文書を追加し、README、Architecture、Security、Testing Strategy、Verification、Traceability、Deviation を現行 Runtime に同期しました。
- 最終 Gate は Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Workspace Lint/Typecheck、219 Unit/Component Tests、7-package Build、Integration 10 Suites / 66 Tests が成功しました。Phase 4 Implementation は完了し、Live/Golden Evidence Gap により Verification は `Partial` です。

## 2026-08-18

### Phase 4 Bounded Map/Merge Security Boundary

- Approved `EXTRACT-TASK-007` として Strict Source DTO と Pure `StructuredExtractionOrchestrator` を実装し、Document/Page/Chunk の stable order を保って全 Chunk を bounded Map/Merge します。
- Default 3 Provider Calls は最大 2 Map + 1 Merge に固定し、Call/Chunk/Character/Conservative Estimated Token/Output/Timeout Limit を超える入力は Silent Truncation せず Stable Failure にします。
- PDF Text は Metadata 付きの Escaped Single Untrusted User Block、Map Candidate は Escaped Untrusted Merge Block に限定し、System Prompt への混入、Delimiter Override、競合 Finding Key の Silent Overwrite を拒否します。
- Orchestrator Security 8 Tests を追加し、全 Workspace 195 Unit/Component Tests、Docker Integration 7 Suites / 56 Tests、Format、Spec、Prisma、Lint、Typecheck、Build が成功しました。新規 Deviation はありません。
- 次は Approved `EXTRACT-TASK-008` の Evidence/Compliance Validator と Atomic Finding/Evidence Publish です。Owner-scoped Active Chunk DB Resolution と Durable Provider/Usage 接続は `EXTRACT-TASK-009` のため Feature は `Partial` を維持します。

### Phase 4 Provider Adapter Foundation

- Approved `EXTRACT-TASK-006` として `LlmProvider` Interface、Deterministic Provider、Official OpenAI SDK Responses Structured Output Adapter を実装しました。
- OpenAI Request は Environment 必須 Model、Zod `zodTextFormat`、Output/Timeout Budget、`store: false`、No Tools に固定し、API Key は Worker Config だけが保持します。
- Refusal、Incomplete/Length、Malformed Output、Authentication、Permission、Rate Limit、Timeout、5xx/Connection を Retryable/Non-retryable Stable Error Code に分類し、Raw Provider Error/Response/Context を Error Object に保持しません。
- Provider 17 Tests と Config 3 Tests を追加し、Responses Request Shape、Strict Fixture、Content-free Usage、Error Sanitization、Optional Embedding Boundary を検証しました。
- Production Dependency として Official `openai@7.5.0`、Runtime Schema/Official Helper の Direct Dependency として既存 Version と同じ `zod@4.4.3` を Worker に追加しました。
- Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、187 Unit/Component Tests、Build、Docker Integration 7 Suites / 56 Tests が成功しました。
- 次は Approved `EXTRACT-TASK-007` の Bounded Map/Merge、Untrusted Context Integration、Prompt Injection Evaluation です。Pipeline Runtime/Live Provider Verification 前のため Feature は `Partial` を維持します。

### Phase 4 Deterministic Financial Metrics

- Approved `EXTRACT-TASK-005` として Revenue、Operating Profit、Net Income、Operating Cash Flow の Versioned Strict Snapshot Contract と Deterministic Parser/Calculator を実装しました。
- Japanese Annual/Quarterly Period、円/千円/百万円/億円、連結/個別、Profit/Loss Sign を明示的に解決し、JPY Normalization と YoY Amount/Rate は `bigint` だけで計算します。
- Document/Page/Chunk/Exact Row、Raw/Normalized Value、Unit、Period、Scope、Formula を監査可能に保持し、Missing/Ambiguous/Conflict/Zero Previous は推測せず `UNKNOWN` / `PARTIAL` にします。
- Metric Contract 2 Tests、Parser/Golden Fixture 7 Tests を追加し、`EXTRACT-AC-006` / `EXTRACT-AC-007` と `EXTRACT-FR-006` を `Passed` に更新しました。新規 Deviation はありません。
- Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、167 Unit/Component Tests、Build、Docker Integration 7 Suites / 56 Tests が成功しました。
- 次は Approved `EXTRACT-TASK-006` の Provider Interface、Deterministic Provider、OpenAI Responses Structured Output Adapter です。Metric Snapshot の Durable/Atomic Persist は `EXTRACT-TASK-009` で接続します。

## 2026-08-17

### Phase 4 Prompt / Usage Audit Foundation

- Approved `EXTRACT-TASK-004` として Git-tracked Structured Extraction Prompt、SHA-256 Asset Loader、Explicit/Idempotent Activation CLI を実装しました。
- Prompt Activation は Name ごとの PostgreSQL Advisory Lock、Active Partial Unique Index、Immutable-content Trigger を使用し、Repeated/Concurrent Run、Version Switch、Content Mutation Reject を検証しました。
- Strict Content-free AI Usage Contract と Repository、Owner/Analysis/Job Composite FK を追加し、Token、Latency、Cost、Operation、Prompt/Provider/Model/Request ID だけを保存します。
- Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、158 Unit/Component Tests、Build、Docker Integration 7 Suites / 56 Tests が成功しました。
- 次は Approved `EXTRACT-TASK-005` の Deterministic P0 Financial Metric Parser/Calculator/Fixture です。Provider Runtime 接続前のため `EXTRACT-FR-004` / `013` と Feature Verification は正確に `Partial` を維持します。

## 2026-08-14

### 次回引き継ぎ

- Phase 4 Structured Extraction は User 承認済み `EXTRACT-Q-001`〜`EXTRACT-Q-007` Option `A` を Baseline とし、`EXTRACT-TASK-001`〜`003` が完了しています。
- Shared Strict Finding/Evidence Schema、Budget、Compliance Validator、`READY_FOR_VIEW_GENERATION`、Finding/Evidence/Link Composite FK、Importance Check は実装済みです。
- 最新 Gate は Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、154 Unit/Component Tests、Build、Docker Integration 6 Suites / 52 Tests、Owner/Lineage Targeted 17 Tests が成功しています。
- Working Tree は本日の Phase 3 Security Acceptance と Phase 4 Task 001〜003 の未 Commit Changes を保持しています。再開時に既存差分を破棄・上書きしません。
- 次回は Approved `EXTRACT-TASK-004` から開始し、Git-tracked Prompt Asset、Explicit Idempotent Activation CLI、PromptVersion/AiUsage Audit Foundation を実装します。
- OpenAI SDK/Runtime Adapter、Live Provider Call、Metric Parser、Map/Merge、Evidence Content Validation、Durable Phase 4 Queue はまだ未実装です。Live Provider Evidence がない限り OpenAI Integration は `Partial` とします。

### Phase 4 Structured Extraction Draft

- `specs/features/structured-extraction/spec.md` を Draft として作成し、Finding、Evidence、Deterministic Financial Metrics、Prompt/Usage Audit、Zod/Evidence/Compliance Validation、Untrusted PDF Boundary を Requirement/Acceptance Criteria 化しました。
- Phase 4 完了時点では Phase 5/6 View が未生成であるのに既存 Status が `COMPLETED` しか持たない `EXTRACT-DEV-001` を検出し、Decision 前に Runtime/Database を変更せず記録しました。
- Handoff Status、Pre-embedding Long-document Strategy、Production Provider、Metric Scope、Prompt Activation、Repair/Retry Budget、Live Verification の 7 Decisions を `decision-request.md` に提示しました。
- User は `EXTRACT-Q-001`〜`EXTRACT-Q-007` の Option `A` をすべて承認しました。Spec を `Approved` とし、Technical Plan と 12 Tasks を作成、`EXTRACT-DEV-001` を `READY_FOR_VIEW_GENERATION` Decision で解消しました。
- `EXTRACT-TASK-002` として Shared Strict Finding/Evidence Zod Schema、32 Chunks / 48,000 Characters / 4,096 Output Tokens / 3 Calls / 60 Seconds の Budget Contract、6 Category の Deterministic Investment-advice Compliance Validator を追加しました。
- Compliance Scan は Model-authored Title/Body だけを対象とし、Original Evidence Excerpt に同じ表現が含まれても Source Data を改変または誤 Reject しません。
- Spec Check 8 Features / 119 Requirements、Lint、Typecheck、153 Unit/Component Tests、Build が成功しました。Database/API Runtime は未変更のため Docker Integration は再実行していません。
- `EXTRACT-TASK-003` として `READY_FOR_VIEW_GENERATION` Enum/Migration/Shared Contract、Finding Importance Check、Finding/Evidence/Link の Owner/Analysis/Document/Page/Chunk Composite FK を追加しました。
- Fresh PostgreSQL Migration と Owner Repository 17 Tests で Valid Lineage、Cross-owner Finding/Evidence、Cross-document Page/Chunk、Importance Check、Handoff Status を検証しました。
- Task 003 Full Gate は Format、Spec Check 8 Features / 119 Requirements、Prisma Validate/Generate、Lint、Typecheck、154 Unit/Component Tests、Build、Docker Integration 6 Suites / 52 Tests が成功しました。

### Phase 3 Parser Security Acceptance

- `PROC-TASK-014` として deterministic Password-required PDF、JavaScript `OpenAction` / External URI / Instruction-like Text を含む malicious PDF を Test 内で生成し、実 `pdfjs-dist` の Non-retryable Classification と Inert Data Boundary を検証しました。
- 2 MiB/Page、50 MiB/Document、20 MB Object の Inclusive Boundary と +1 Byte Failure、Over-limit Stream Cleanup を Unit Test で固定しました。Production Limit と Dependency は変更していません。
- Emitted JSON Log で malicious `pageText`、URI、Storage Coordinate、Filename、Presigned URL が Redact される Regression を追加しました。
- `PROC-AC-007` と `PROC-AC-011`、`PROC-SEC-004`、`PROC-SEC-005`、`PROC-SEC-007` は `Passed` へ更新しました。
- Permission-encrypted CI Fixture、Heading Semantic Review、Active Parent Race、Phase 4 Untrusted Context E2E は残るため Document Processing 全体は正確に `Partial` を維持します。
- Format Check、Spec Check 7 Features / 98 Requirements、Lint、Typecheck、143 Unit/Component Tests、Build、Docker Integration 6 Suites / 51 Tests が成功しました。

## 2026-08-13

### 次回引き継ぎ（2026-08-14 再開予定）

- Phase 3 の Core Runtime、Failure Recovery、Operator Re-run は実装済みです。Working Tree は未 Commit の Phase 3 Changes を保持しているため、再開時に既存差分を破棄・上書きしません。
- User 承認 Decision は `PROC-Q-001`〜`PROC-Q-007` の Option `A`、`RERUN-Q-001`〜`RERUN-Q-003` の Option `A`、`TEST-DEV-002` Option `C`、`RERUN-DEV-002` Option `B` です。
- `RERUN-DEV-002` は `READ COMMITTED` + `JobExecution` Row Lock で解消済みです。Concurrent Re-run は 1 `queued` / 1 Stable `not-rerunnable` / 1 Audit に収束します。
- `PDF-DEV-002` は real Cleanup CLI Inspect/Re-run/Audit → same Execution Attempt 4 Worker Success により解消済みです。
- Local `test-data/` の Public IR PDFs 3 Files / 509 Pages は Parser Probe に成功し、Git Ignore 済みです。原文 PDF は Commit しません。
- 最終 Quality Gate は Spec Check 7 Features / 98 Requirements、Lint、Typecheck、137 Unit/Component Tests、Build、Docker Integration 6 Suites / 51 Tests が成功しています。
- Document Processing の残 Gap は Password-required PDF Fixture、20 MB / 50 MiB Text Limit、Malicious PDF / Log Security Evaluation、Heading Heuristic Semantic Review です。
- Job Re-run の残 Gap は Phase 7 Workload IAM / Secrets Manager Deployment Evidence です。`TEST-DEV-002` の Production Concurrent Upload Retry Exhaustion Risk は User 承認済みで維持します。
- 次回は `specs/features/document-processing/verification.md` の Partial 項目を再確認し、Password/Limit/Security Test を Spec → Plan → Task 順に補完します。その後 Full Quality Gate を再実行し、Phase 4 Structured Extraction の Decision Draft に進みます。

### Phase 3 Document Processing / Job Re-run Core

- User 承認済み全 Option `A` に基づき、Document Processing と Job Re-run Spec、Technical Plan、Tasks を Approved としました。
- Owner-scoped Process API、Durable Parse/Chunk Job、Pending Recovery、`READY_FOR_EMBEDDING` Status を実装しました。
- `pdfjs-dist` を Worker Runtime Dependency として追加し、OCR なしの Page Text Extraction、Resource Limit、Heading Heuristic、Page-bounded 1,200 Character / 150 Overlap Chunking を実装しました。
- `DocumentPage` / `DocumentChunk` の Composite Ownership FK と `JobOperationAudit` Migration を追加しました。
- CLI-only Inspect/Re-run、Explicit Enable/Secret Guard、3 Step Allowlist、5 Manual Re-run Limit、Sanitized JSON Output、Runbook を追加しました。
- API 88 Unit Tests、Worker 16 Unit Tests、全 Workspace 137 Unit/Component Tests、Lint/Typecheck/Build は成功しました。
- User は `TEST-DEV-002` に Option `C` を選択しました。Production の Serializable 3 Attempt を変更せず、既存 Concurrent Upload Acceptance Harness にだけ bounded `P2034` Retry を追加し、Production の瞬時 Failure Risk を明示的に保持します。
- User は `PROC-DEV-002` に Option `A` を承認しました。Password/明示的復号が不要な Permission-encrypted PDF は通常 Limit 内で受け入れ、Local Real IR 3 Files / 509 Pages の Direct Parser Probe が成功しました。
- Real Presigned PUT / MinIO → Redis/BullMQ Parse/Chunk Worker → PostgreSQL Page/Chunk → `READY_FOR_EMBEDDING` の Happy-path End-to-end Test を追加しました。
- Empty Page、Malformed/501-page Failure、Attempt 3 Recovery、Duplicate Delivery、Missing Redis Job Recovery、Page/Chunk Composite Ownership FK を Infrastructure Integration で検証しました。
- Cleanup の real CLI Inspect/Re-run/Audit/Attempt 4 Success、Parse Attempt 4 Recovery、CHUNK Re-dispatch、5 Manual Limit、Status/Allowlist/deleted Target Fail-closed を検証しました。
- User 承認済み `RERUN-DEV-002` Option `B` として `READ COMMITTED` + `JobExecution` Row Lock を実装し、Concurrent Re-run は 1 `queued` / 1 Stable `not-rerunnable` / 1 Audit に収束しました。
- Full Docker Integration は PostgreSQL/Redis/BullMQ/MinIO 6 Suites / 51 Tests が成功しました。Open-handle 診断付き再実行も 6 Suites / 50 Tests 時点で成功し、Leak は再現しませんでした。
- Spec Check は 7 Features / 98 Requirements で成功しました。Document Processing は Password/50 MiB/Security Evaluation、Job Re-run は Phase 7 Workload IAM/Secrets Manager Evidence のため `Partial` を維持します。

## 2026-08-12

### PDF Upload Final Quality Gate / Traceability

- Approved `PDF-TASK-017` として PDF Upload の全 Requirement、8 Acceptance Criteria、Implementation Evidence、Verification Evidence、Deviation を再監査しました。
- `PDF-FR-003` は Inclusive Zod/Database Boundary、Invalid Size HTTP、20 MB + 1 Streaming Cutoff の Evidence により `Passed` へ更新しました。
- Spec の Implementation Status を `Implemented` とし、`PDF-TASK-001`〜`017` を完了しました。
- `PDF-SEC-007` は Untrusted Context Builder/Regression Unit まで実装済みですが、Parse/LLM Provider 接続と End-to-end Evaluation が Phase 4 Dependency のため Verification は `Partial` を維持します。
- User 承認済み `PDF-DEV-002` Option `C` は統一 Job Re-run Feature の Follow-up として保持します。
- Format、Spec Check、Prisma Validate/Generate、Lint、Typecheck、129 Unit/Component Tests、Build と、PostgreSQL/Redis/BullMQ/MinIO Integration 5 Suites / 37 Tests が成功しました。

### PDF Upload Documentation

- Approved `PDF-TASK-016` として API、Database、Security、Architecture、Environment Documentation を現在の PDF Upload 実装へ同期しました。
- Upload Start/Re-presign/Finalize、Document List/Delete、Stable Error、Trusted Validation、Concurrency、24-hour Expiry、Durable Cleanup、3 Attempt History を文書化しました。
- Root/Docker README に MinIO Private Bucket の明示的作成手順を追加し、Host/Compose/AWS の Endpoint、Credential、IAM/CORS Boundary を整理しました。
- Documentation Review で、FAILED Cleanup の内部 Retry Contract に Operator-facing CLI/API/Runbook がない `PDF-DEV-002` を検出しました。挙動を拡張せず Open Deviation として記録しています。
- Public API、Database Schema、Runtime Dependency、Production Behavior の変更はありません。
- Format、Spec Check、Lint、Typecheck、129 Unit/Component Tests、Build、Prisma Validate が成功しました。Runtime Code は `PDF-TASK-015` から不変のため Docker Integration Test は再実行していません。

### PDF Upload Manual Re-run Decision

- User は `PDF-DEV-002` に Option `C` を選択し、FAILED Cleanup の Operator-facing CLI/API/Runbook を Phase 3 の統一 Job Re-run Feature まで延期しました。
- Automatic 3 Attempt、Durable FAILED State、Sanitized Attempt History と内部 Reset/Retry Contract は維持します。
- PDF Upload Feature の Public API を拡張せず、将来 Feature で Authorization、Audit、Stable Operator Output を承認してから実装します。

### PDF Upload Concurrency、Retry、Orphan Expiry Acceptance

- Approved `PDF-TASK-015` として Concurrent Start/Finalize/Delete、Repeated Finalize、Automatic Cleanup Retry、24-hour Orphan Expiry を実装・検証しました。
- 4 件の Concurrent Start は 3 Created / 1 Limit に収束し、同一 Upload の Concurrent Finalize は PostgreSQL Unique Conflict 後も同じ Document を返して重複を作りません。
- Repeat Finalize は MinIO Head/Stream を再実行せず、Finalize/Delete Race は 1 Cleanup Execution に収束しました。
- Worker に bounded `ExpiredDocumentUploadScanner` を追加し、起動時と 60 秒 Interval に期限切れ `PENDING` / `VALIDATING` を `EXPIRED` と Stable Cleanup Job へ原子的に遷移させます。
- Redis/BullMQ の 3 Attempt Exponential Backoff、Sanitized Failure History、3 回目の MinIO Delete Success と、未 Finalize Orphan の Scan から Object Delete までを Automated Integration Test で確認しました。
- Review で検出した `PDF-DEV-001` は同 Task で解消しました。Public API、Database Schema、Production Dependency の変更はありません。
- Full Workspace の Format、Spec Check、Prisma Validate/Generate、Lint、Typecheck、129 Unit/Component Tests、Build と、PostgreSQL/Redis/BullMQ/MinIO Integration 5 Suites / 37 Tests が成功しました。

## 2026-08-10

### PDF Upload Redis/BullMQ Cleanup Acceptance

- Approved `PDF-TASK-014` として、Owner の HTTP Document Delete から PostgreSQL、Redis/BullMQ、Worker、Production `S3ObjectStorageAdapter`、MinIO Object Delete までの Automated Integration Test を追加しました。
- Delete は `204`、Document List からの除外、`deletedAt`、Stable `QUEUED OBJECT_CLEANUP` を先に確定し、Queue Payload は `jobExecutionId` UUID のみを保持します。
- Worker は Database Relation から Storage Target を解決し、Object Delete 後に `JobExecution` と `JobAttempt` を 1 Attempt の `SUCCEEDED`、Error Detail なしへ収束させました。
- MinIO Object がすでに存在しない場合も同じ実 Worker 経路で成功扱いとなる Idempotency を検証しました。
- Test-only Redis Container Support を追加しました。Production Dependency、Database Schema、Public API Contract の変更はありません。
- Targeted PostgreSQL/Redis/BullMQ/MinIO Integration 1 Suite / 4 Tests が成功しました。Full Workspace の Format、Spec Check、Prisma Validate/Generate、Lint、Typecheck、127 Unit/Component Tests、Build と、Self-bootstrapping Integration 5 Suites / 33 Tests も成功しました。

### Integration PostgreSQL Image Bootstrap

- `pnpm test:integration` が Local-only `stocklens-postgres:16-pgvector` の事前 Build を暗黙に要求し、Image Tag がないと Testcontainers が Docker Hub Pull を試みて失敗する問題を解消しました。
- Root Command に Cacheable `test:integration:prepare` を組み込み、`docker/postgres` の Build/再 Tag と Testcontainers Suite を単一 Command で実行します。
- GitHub Actions の重複 Build Step を統合し、README、Docker README、Testing Strategy を Self-bootstrapping Contract に更新しました。
- Self-bootstrapping `pnpm test:integration` は Docker Layer Cache を使用して Image を準備し、PostgreSQL/MinIO 5 Suites / 31 Tests に成功しました。Format、Spec Check、Lint、Typecheck、127 Unit/Component Tests、Build も成功しました。
- Production Runtime、Database Schema、API Contract、Test Data Isolation に変更はありません。

### PDF Upload HTTP Authorization Acceptance

- Approved `PDF-TASK-013` として Bearer User A/B の Start、Re-presign、Finalize、List、Delete を Testcontainers PostgreSQL の HTTP 実経路で検証しました。
- Cross-user Start は Missing Analysis と同じ `404 ANALYSIS_NOT_FOUND` となり、Upload Session と Presign Call を作成しません。
- Cross-user Re-presign/Finalize は `404 DOCUMENT_UPLOAD_NOT_FOUND` となり、Presign、Head、Stream、Session Status、Document に Side Effect を発生させません。
- Cross-user List/Delete は `404 ANALYSIS_NOT_FOUND` となり、Document Metadata を返さず、Soft Delete と Cleanup Job を作成しません。
- `PDF-AC-006`、`PDF-FR-001`、`PDF-SEC-006`、`OWN-AC-007` を Passed とし、`OWN-DEV-004` を解消しました。Owner-scoped Data Access Feature は `Verified` です。
- Targeted HTTP Integration 1 Suite / 6 Tests が成功しました。Full Workspace の Format、Spec Check、Lint、Typecheck、127 Unit/Component Tests、Build、Prisma Validate/Generate と、PostgreSQL/MinIO Integration 5 Suites / 31 Tests が成功しました。

### PDF Upload MinIO Storage Acceptance

- Approved `PDF-TASK-012` として Official MinIO Image、専用 Private Bucket、Production `S3ObjectStorageAdapter` を使用する Automated Integration Test を追加しました。
- API が返す Real Presigned URL と Signed Content Length/Type/SHA Headers で PDF を PUT し、MinIO Head/Stream と Trusted Finalize を実経路で検証しました。
- Valid PDF は `DocumentUpload.COMPLETED`、Trusted `Document.sha256/sizeBytes/uploadedAt`、`Analysis.UPLOADED` に原子的に収束しました。
- Invalid `%PDF-` Header は `422 INVALID_PDF`、No Document、`REJECTED / INVALID_PDF_HEADER`、Durable `QUEUED OBJECT_CLEANUP` に収束しました。実 Redis/BullMQ Worker Delete は `PDF-TASK-014` に残します。
- `testcontainers` を API の Test-only Direct Dependency として追加しました。Production Dependency、Database Schema、Public API Contract の変更はありません。
- Targeted MinIO Integration 1 Suite / 2 Tests が成功しました。Full Workspace の Format、Spec Check、Lint、Typecheck、127 Unit/Component Tests、Build、Prisma Validate/Generate と、PostgreSQL/MinIO Integration 5 Suites / 29 Tests が成功しました。

## 2026-08-07

### PDF Upload Start / Validation HTTP Acceptance

- Approved `PDF-TASK-011` として Upload Start を Bearer Guard、Global Zod Pipe、Controller、Service、Repository、Testcontainers PostgreSQL の HTTP 実経路で検証しました。
- Valid Start は Storage-safe `PENDING` Session、Expected PUT Headers、5 分 Expiry、Owner-scoped Database Record、Random Storage Key を返します。
- 4 件目は `DOCUMENT_LIMIT_EXCEEDED` となり Intent/Presign が増えず、Size 0 / 20 MB 超 / Invalid Extension / MIME は `VALIDATION_ERROR` かつ Database/Presign Side Effect なしです。
- Shared Zod Test に 1 byte と 20 MB の Inclusive Boundary を追加しました。
- HTTP Integration 1 Suite / 4 Tests と Shared 4 Suites / 19 Tests が成功しました。Real MinIO Acceptance は `PDF-TASK-012` に残します。
- Full Workspace の Format、Spec Check、Lint、Typecheck、127 Unit/Component Tests、Build、Prisma Validate と、PostgreSQL Integration 4 Suites / 27 Tests が成功しました。

### PDF Upload Security Boundary

- Approved `PDF-TASK-010` として Start/Re-presign/Finalize/List/Delete の Stable Cross-user Not Found Boundary を Service Test 上で `PDF-SEC-006` に追跡可能にしました。Bearer User A/B HTTP Acceptance は `PDF-TASK-013` に残します。
- Structured Logger は Presigned URL、Storage Coordinate、Original Filename、Object Body、Full PDF/Page/Chunk Text を Nested Field でも Redact し、実際の JSON Log に値が残らないことを検証しました。
- Shared Package に Zod-validated `buildUntrustedPdfContext` を追加し、Uploaded Text を `role: user`、`trust: untrusted`、`instructionsAllowed: false` に固定しました。
- Prompt Injection が偽の Delimiter や `<system>` Markup を含んでも Escape され、単一の Untrusted Data Block 外へ出られないことを Unit Test で検証しました。
- Parse/LLM Provider 接続は本 Task の Scope 外です。`PDF-SEC-007` は Boundary Unit Evidence により Blocked から Partial へ進み、Provider Integration と End-to-end Evaluation を Phase 4 に残します。
- Full Workspace の Format、Spec Check、Lint、Typecheck、125 Unit/Component Tests、Build、Prisma Validate と、PostgreSQL Integration 3 Suites / 23 Tests が成功しました。

## 2026-08-06

### PDF Upload Document List / Delete API

- Approved `PDF-TASK-009` として Owner-scoped Document List/Delete Endpoint と `{ items: DocumentResource[] }` Contract を追加しました。
- List は Active Finalized Document だけを返し、Owner ID、Bucket、Storage Key を Response に含めません。Cross-user/Missing Analysis は `ANALYSIS_NOT_FOUND` に収束します。
- Delete は Document Soft Delete と Stable `OBJECT_CLEANUP` JobExecution を同一 Serializable Transaction に保存し、Redis Dispatch Failure 時も Durable `QUEUED` State を保持します。
- Cross-user Analysis、Cross-analysis/Missing/Deleted Document、Repeated Delete を Stable Not Found に収束させました。
- Full Workspace の Format、Spec Check、Lint、Typecheck、121 Unit Tests、Build、Prisma Validate と、PostgreSQL Integration 3 Suites / 23 Tests が成功しました。HTTP Bearer A/B と Real Redis/MinIO Cleanup Acceptance は `PDF-TASK-013`、`PDF-TASK-014` に残ります。

### PDF Upload Transactional Finalize API

- Approved `PDF-TASK-008` として Owner-scoped Finalize Endpoint と storage-safe `DocumentResource` Contract を追加しました。
- Upload Session を Serializable Transaction で `PENDING → VALIDATING` に Claim し、Valid Object は Document 作成、Upload `COMPLETED`、`uploadedAt`、Analysis `DRAFT → UPLOADED` を原子的に保存します。
- Completed Session の再 Finalize は Storage を再読込せず同じ Document を返します。Active Duplicate SHA と 3 Document Limit は Finalize Transaction で再確認します。
- Invalid、Expired、Duplicate、Limit は終端 Status と Durable `OBJECT_CLEANUP` JobExecution を同一 Transaction に保存します。Redis Delivery Failure は Worker の Pending Scan から回復できます。
- Storage Read Failure は Provider Detail を返さず `PENDING` に戻して `STORAGE_VALIDATION_FAILED` とし、再 Finalize 可能にしました。
- Full Workspace の Format、Spec Check、Lint、Typecheck、111 Unit Tests、Build、Prisma Validate と、PostgreSQL Integration 3 Suites / 21 Tests が成功しました。Concurrent/HTTP/MinIO Acceptance は `PDF-TASK-011`〜`PDF-TASK-015` に残ります。

## 2026-08-05

### PDF Upload Trusted Streaming Validator

- Approved `PDF-TASK-007` として Object Head と Readable Stream を用いる Internal `PdfObjectValidator` を追加しました。
- Exact Content Type、Content Length、Signed SHA Metadata、Actual Size、Actual SHA-256、先頭 `%PDF-` を相互検証します。
- Full Object を保持せず、20 MB + 1 byte、Invalid Header を検出した時点で Stream を破棄します。
- Missing Object と Provider/Stream Failure は Retryable Storage Failure、Content Mismatch は Invalid Result として構造化・脱敏しました。
- Public Finalize と Status/Document/Cleanup Transaction は `PDF-TASK-008`、Automated MinIO Acceptance は `PDF-TASK-012` に残ります。
- Full Workspace の Format、Spec Check、Lint、Typecheck、102 Unit Tests、Build、Prisma Validate と、PostgreSQL Integration 3 Suites / 18 Tests が成功しました。

### PDF Upload Start / Presign API

- Approved `PDF-TASK-006` として Owner-scoped Upload Session Start と Active Session Re-presign Endpoint を追加しました。
- Shared Zod Schema は 1〜20 MB、case-insensitive `.pdf`、exact `application/pdf`、lowercase SHA-256、safe Filename を URL 発行前に検証します。
- Active Document、未期限 `PENDING`、実行中 `VALIDATING` の合計 3 枠を Serializable Transaction で予約します。
- Response から Bucket、Storage Key、Credential を除外し、5 分の PUT URL と必要な Signed Header のみを返します。
- 初回 Presign Failure は `REJECTED` と Stable Error に収束して枠を解放し、再 Presign Failure は `PENDING` を維持します。
- Full Workspace の Format、Spec Check、Lint、Typecheck、90 Unit Tests、Build、Prisma Validate が成功しました。既存 PostgreSQL Integration 3 Suites / 18 Tests も成功しました。Upload HTTP/Concurrency/MinIO Acceptance は後続 Verification Task に残ります。

## 2026-08-04

### PDF Upload Object Cleanup Queue

- Approved `PDF-TASK-005` として `OBJECT_CLEANUP` JobStep、Upload Cleanup Relation、Target Constraint Migration を追加しました。
- PostgreSQL の `JobExecution` を Durable Source、BullMQ を Dispatch Layer とし、Queue Payload を `jobExecutionId` のみに限定しました。
- Worker は Database から Object Target を解決し、Idempotent Delete、最大 3 回の Exponential Backoff、Attempt History、Sanitized Failure を実装しました。
- Redis Dispatch Failure は `QUEUED` State を失わず、Worker が Startup と 60 秒 Interval で再送します。最終失敗 Job の Manual Retry にも対応しました。
- Full Workspace の Format、Spec Check、Lint、Typecheck、72 Unit Tests、Build、Prisma Validate が成功しました。
- Testcontainers PostgreSQL 3 Suites / 18 Tests が成功し、空 Database への Split Migration、Cleanup Target Constraint、Stable Idempotency を確認しました。Real Redis/MinIO Cleanup Integration は後続 Task です。
- Upload/Finalize/Delete API との接続は `PDF-TASK-006`〜`PDF-TASK-009`、Real Redis/MinIO Cleanup Acceptance は `PDF-TASK-014` に残ります。

## 2026-07-28

### PDF Upload Object Storage Foundation

- Approved `PDF-TASK-004` として API/Worker 共通の `@stocklens/object-storage` Package を追加しました。
- AWS S3 と S3-compatible MinIO に対する Presigned PUT、Head、Streaming Read、Idempotent Delete Interface を実装しました。
- Object Key は Owner/Analysis/Upload Session Prefix と Random UUID で生成し、Original Filename を使用しません。
- Presigned PUT は最大 5 分、1〜20 MB、`application/pdf`、Claimed SHA-256 Metadata に制限し、必要 Header を AWS Signature に含めます。
- AWS Runtime は Default Credential Provider Chain、Local MinIO は Custom Endpoint、Static Credential、Path-style Access を使用できます。
- AWS SDK v3 は S3 Client と Presigner の最小 2 Package のみを追加し、Automatic Empty-body Checksum を無効化して Actual Upload Body と競合しないようにしました。

### 検証

- Object Storage Unit Test 3 Suites / 13 Tests が成功しました。
- Project-owned MinIO で Presigned PUT `200`、Head Metadata、Streaming Body、Delete、Delete 後 Not Found を確認しました。Temporary Object は削除済みで、検証前に停止していた MinIO Container も停止状態へ戻しました。
- Full Workspace の Format、Spec Check、Lint、Typecheck、61 Unit Tests、17 PostgreSQL Integration Tests、Build、Prisma Validate が成功しました。
- Cleanup Queue、Upload/Finalize API、Automated MinIO Acceptance Test は次 Task 以降であり、PDF Upload Feature 全体は `Implementing` / `Partial` です。

## 2026-07-24

### PDF Upload Database Foundation

- Approved `PDF-TASK-003` として `DocumentUploadStatus`、`DocumentUpload` Entity、Migration を追加しました。
- Upload Session は Owner/Analysis Composite FK と Finalized Document Composite FK/Unique Constraint を持ち、Cross-owner/Cross-analysis Relation と同一 Document の重複 Finalize を Database で拒否します。
- Database `CHECK` で 1〜20 MB、Lowercase SHA-256、Expiry、Required Metadata、Completion/Failure Lifecycle を強制します。
- Cleanup Scan、Ownership/List、Duplicate Lookup 用 Index を追加しました。
- Testcontainers PostgreSQL で Migration、Constraint、Index、One-to-one Finalization を検証しました。
- Storage Adapter、Cleanup Queue、Upload API、Streaming Finalize は次 Task 以降であり、PDF Upload Feature 全体は `Implementing` / `Partial` です。

### Analysis Management

- User が Analysis Management Spec と PDF Upload Technical Plan を承認しました。
- Pre-upload Analysis 用の `DRAFT` Status を追加し、最初の Document Finalize 後に `UPLOADED` へ遷移する Contract を確定しました。
- Bearer Authentication 必須の Analysis Create、History、Detail、Rename、Soft Delete API を追加しました。
- History は `createdAt DESC, id DESC` の Opaque Cursor Pagination、Default 20、Maximum 50 としました。
- Optional `companyId` は指定時に存在を検証し、Unknown Company を Stable `COMPANY_NOT_FOUND` として扱います。
- Cross-user、Missing、Soft-deleted Analysis は同じ `ANALYSIS_NOT_FOUND` とし、Response は Metadata のみに限定しました。
- Analysis Delete は所有する Active Document も同一 Serializable Transaction で Soft Delete します。
- PostgreSQL Enum 追加と Default 変更は、PostgreSQL の Safe Enum Use 制約に合わせて二つの Migration に分割しました。

### 検証

- Unit Test 13 Suites / 44 Tests が成功しました。
- Testcontainers Integration Test 3 Suites / 17 Tests が成功しました。
- 空 PostgreSQL への全 Migration、Analysis CRUD、Cursor Pagination、Cross-user HTTP Authorization、Transactional Delete、OpenAPI Contract を確認しました。

## 2026-07-22

### 承認済み SDD 整改 15 項目

- User が `specs/decision-request.md` の 15 Recommendation をすべて承認し、Decision Log と Deviation Status に反映しました。
- Authentication は Dummy Argon2id Verify、Atomic Login Audit/Token、HS256 Allowlist、Concrete OpenAPI Contract を追加しました。
- Request ID Validation と Authorization/Cookie/Password/Token の Structured Log Redaction を追加しました。
- Demo User は Production Explicit Allow、Default Password Guard、Password Rotation 時の Session Revoke、Concurrent Create Convergence、Sanitized CLI Error を追加しました。
- `Analysis(ownerId, id)` / `Document(ownerId, analysisId)` Composite FK と Fail-fast Migration Audit を追加しました。
- Parent Delete/Child Create は Serializable Transaction + 限定 `P2034` Retry で収束させました。
- Integration Test を Testcontainers に移行し、空 PostgreSQL への Migration、Auth HTTP、Demo、Ownership/Constraint/Concurrency を 2 Suites 9 Tests で検証しました。
- GitHub Actions は SDD Check、Integration Database Image Build、Integration Test を Quality Gate として実行します。
- `docs/architecture.md` と `docs/testing-strategy.md` を追加しました。残る Required ADR/AI/Evaluation/Deployment 文書は `DOC-DEV-001` として継続管理します。

### Spec-Driven Development Baseline

- `specs/` に Feature Spec、Technical Plan、Tasks、Verification の Lifecycle と Template を追加しました。
- Authentication、Demo User、Owner-scoped Data Access を既存 Code/Test から Backfill しました。
- Requirement ID と `specs/traceability.md` による Code/Test Traceability を導入しました。
- 不足 Test、Security Risk、Data Integrity Gap、未決定事項を `specs/deviations.md` に記録しました。User Decision 前に挙動は変更しません。
- 次 Feature の PDF Upload は `Draft` Spec だけを作成し、Open Questions の承認前には Technical Plan/Tasks/Implementation を開始しません。
- `pnpm spec:check` で必須 Artifact、Requirement Traceability、Acceptance Verification Entry を検証します。

## 2026-07-17

### Phase 2 Authentication Foundation

- Email Registration、Login、Logout、`GET /api/auth/me` を追加しました。
- Password は Argon2id で Hash 化し、12 文字以上の入力を Zod で検証します。
- Access Token は短期 JWT、Refresh Token は `HttpOnly` / `SameSite=Strict` Cookie としました。
- Refresh Token の平文は保存せず、Hash、Family、Rotation 履歴を保存します。
- Refresh Token Rotation を Transaction で Claim し、再利用検出時は Family 全体を失効します。
- Active User を確認する Bearer Token Guard を追加しました。
- API 全体と Auth Endpoint に基本 Rate Limit を追加しました。
- Credential CORS、統一 API Error Format、Request Validation Pipe を追加しました。
- `docs/security.md` と `docs/api-conventions.md` に決定事項を記録しました。

### 検証

- Argon2id Hash / Verify、JWT、Refresh Token Rotation、Reuse Detection を Unit Test で確認しました。
- HTTP Test で Email / Display Name の正規化、Cookie 属性、Validation Error Format を確認しました。

### Phase 2 の次の作業

- PDF Upload Validation と MinIO Presigned URL
- Document / Analysis API と History

### Demo User Provisioning

- `pnpm demo:user:provision` で明示的に実行する Demo User Provisioning CLI を追加しました。
- `DEMO_USER_EMAIL`、`DEMO_USER_PASSWORD`、`DEMO_USER_DISPLAY_NAME` は Zod で検証・正規化します。
- 再実行時に同じ設定なら Database Write を行わず、設定変更時のみ Demo User を更新します。
- 通常 User の上書きと、Soft Delete 済み Demo User の暗黙的な復元を拒否します。
- Password は既存 Auth と同じ Argon2id Hasher を使用し、CLI の構造化出力には Password を含めません。

### Owner-scoped Repository と Authorization Integration Test

- `AnalysisRepository` と `DocumentRepository` を追加し、Active Resource の Read、List、Update、Soft Delete に `ownerId` Scope を必須化しました。
- Document 作成時は、関連する Analysis が同じ Owner に所属し、Soft Delete されていないことを Transaction 内で確認します。
- Analysis の Soft Delete と所属 Document の Soft Delete を同一 Transaction で実行します。
- `DatabaseModule` に Prisma と Repository Provider を集約しました。Controller から Prisma を直接呼び出さない Boundary として使用します。
- Local PostgreSQL を使用する Integration Test で、Cross-user Read、List、Create、Update、Delete の拒否と、Owner 自身の操作成功を確認しました。
- Integration Test は Random UUID の Test Data だけを削除し、既存 Local Data を Truncate しません。

## 2026-07-15

### Phase 2 Database Design Draft

- `docs/database-design.md` を追加し、Prisma Model 実装前の論理データモデルを定義しました。
- Required Entity、Ownership、Soft Delete、Index、JSONB、pgvector、Full Text Search の方針を整理しました。
- Analysis、Document、Page、Chunk、Finding、Evidence をページ単位で追跡できる Relation を定義しました。
- Refresh Token Rotation、Job Retry、Idempotency、Prompt Version、AI Usage Audit の保存方針を定義しました。
- `Company` と `PromptVersion` を System-wide Reference Data、それ以外のユーザーデータを Owner-scoped Data としました。

### 次のレビュー項目

- Access Token / Refresh Token の Transport 方針
- Soft-deleted User の Email 再利用方針
- Embedding Model と Dimension
- 日本語 Full Text Search の MVP Strategy
- JSONB View Output を将来別 Table に分離する条件

この設計レビューを経て、次節の Prisma Schema と Migration を実装しました。

### Phase 2 Domain Schema

- 論理 Database Design を `prisma/schema.prisma` に反映しました。
- Required Entity に加え、Evidence Link 用 Join Table と Retry 履歴用 `JobAttempt` を追加しました。
- User-owned Data に直接 `ownerId` を持たせ、Repository で Owner Scope を強制できる構造にしました。
- pgvector Extension、Domain Table、Foreign Key、Index、Check Constraint を作成する最初の Migration を追加しました。
- `DocumentChunk.embedding` は Provider 未決定のため Dimension 未固定の `vector` とし、HNSW Index は延期しました。
- Local PostgreSQL に Migration を適用し、19 Domain Table、pgvector `0.8.4`、`vector` Column の作成を確認しました。
- Root Script に `db:migrate:dev` と `db:migrate:deploy` を追加しました。

### Database 検証済み

- `prisma validate` が成功します。
- Prisma Client の生成が成功します。
- 最初の Migration が空の Prisma Migration History から適用できます。
- `DocumentChunk.embedding` が PostgreSQL の `vector` Type です。

## 2026-07-13

### Phase 1 基盤

- Git リポジトリを初期化し、デフォルト Branch を `main` に設定しました。
- pnpm と Turborepo による Monorepo 構成を追加しました。
- Next.js、NestJS/Fastify、BullMQ Worker の初期アプリケーションを追加しました。
- 共通 TypeScript、ESLint、Zod Schema、Database Tooling、UI Package を追加しました。
- Prisma 6 の Tooling と、意図的に Model を持たない初期 Schema を追加しました。
- API Liveness Endpoint `/api/health/live` を追加しました。
- OpenAPI ドキュメント `/api/docs` を追加しました。
- API、Worker、Frontend の初期テストを追加しました。
- Format、Lint、Typecheck、Test、Build を実行する GitHub Actions Workflow をローカルに用意しました。GitHub Credential に Workflow 更新権限を設定するまでは、Git の追跡対象から除外しています。
- Root の開発用 README を追加しました。

### 意図的に延期している項目

- Domain Database Model と Migration は、Database Design のレビュー後に追加します。
- Phase 3 の Pipeline 実装までは、Worker が Analysis Job を明示的に失敗させます。
- Authentication、Object Storage Integration、Upload、Analysis API は Phase 2 で実装します。

### 検証済み

- Prisma Schema の検証と Client 生成が成功します。
- Format、Lint、TypeScript Strict Check、初期テスト 5 件がすべて成功します。
- Web、API、Worker、Internal Package の Production Build が成功します。
- 起動した API の `/api/health/live` が HTTP 200 を返し、構造化 JSON Log に Request ID が記録されます。

## 2026-07-10

### 完了

- プロジェクト目標、Engineering Standard、Security Rule、AI Pipeline 制約、Evidence Citation Rule、Development Phase、Agent Workflow を定義した `AGENTS.md` を作成しました。
- StockLens AI 用の Docker ベース Local Infrastructure を追加しました。
- 外部の `expense-postgres` Container を再利用しない構成に変更しました。
- プロジェクト専用 PostgreSQL Service を追加しました。
  - Container: `stocklens-postgres`
  - Image: `stocklens-postgres:16-pgvector`
  - Host Port: `15433`
  - Database: `stocklens_ai`
  - User: `stocklens`
  - Data Volume: `stocklens-ai_postgres-data`
- `docker/postgres/Dockerfile` を使用し、pgvector をプロジェクトの PostgreSQL Image に組み込みました。
- 初期 Database Script を追加しました。
  - `docker/postgres/init/01-enable-pgvector.sql`
  - Database の初回初期化時に `CREATE EXTENSION IF NOT EXISTS vector;` を実行します。
- BullMQ 用 Redis を追加しました。
  - Container: `stocklens-redis`
  - Host Port: `6379`
  - Volume: `stocklens-ai_redis-data`
- Local S3 Compatible Storage として MinIO を追加しました。
  - Container: `stocklens-minio`
  - API: `localhost:9000`
  - Console: `localhost:9001`
  - Volume: `stocklens-ai_minio-data`
- Local Development 用 Connection String を含む `.env.example` を追加しました。
- Local Environment の手順を記載した `docker/README.md` を追加しました。
- `.gitignore` を追加しました。

### 検証済み

- `docker compose config` が成功します。
- `stocklens-postgres` が Healthy です。
- `stocklens_ai` に接続できます。
- `stocklens_ai` で pgvector が有効です。
- pgvector Version は `0.8.4` です。
- 次の Vector Distance Query が成功します。
  - `SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance;`
- `stocklens-redis` が Healthy です。
- `stocklens-minio` が Healthy です。
- Local Node Tooling が利用できます。
  - Node.js `v23.9.0`
  - npm `10.9.2`
  - Corepack `0.31.0`
  - pnpm `10.5.2`

### 現在のローカルサービス

```text
PostgreSQL:   localhost:15433
Redis:        localhost:6379
MinIO API:    localhost:9000
MinIO Console localhost:9001
```

ホスト上で使用する Connection String:

```text
DATABASE_URL=postgresql://stocklens:stocklens-dev-password@localhost:15433/stocklens_ai?schema=public
```

Docker Compose Network 内で使用する Connection String:

```text
DATABASE_URL=postgresql://stocklens:stocklens-dev-password@postgres:5432/stocklens_ai?schema=public
```

### 重要事項

- `docker compose down` は Container を削除しますが、Named Volume は保持します。
- `docker compose down -v` は Local Database、Redis、MinIO のデータを削除します。
- pgvector はプロジェクトの PostgreSQL Image に含まれているため、Container を再作成しても利用できます。
- 以前の外部 `expense-postgres` Container は StockLens の構成に含まれません。
- Local では Node `v23.9.0` を利用できますが、Ecosystem の安定性を考慮し、プロジェクトの対応範囲は Node `>=22 <24` とします。

### 当時の次のステップ

Phase 1 の Engineering Initialization を開始する計画でした。

1. pnpm Monorepo を初期化する。
2. Root の `package.json`、`pnpm-workspace.yaml`、`turbo.json` を追加する。
3. 次の Application Skeleton を作成する。
   - `apps/web`
   - `apps/api`
   - `apps/worker`
4. `packages/shared` を作成する。
5. TypeScript Strict の Base Config を追加する。
6. PostgreSQL Connection を使用する Prisma を追加する。
7. 最小限の Health Check Endpoint を追加する。
8. ESLint、Prettier、初期 GitHub Actions Workflow を追加する。
