# SDD Deviations and Open Decisions

この文書は Spec、Code、Test、Security Rule、Engineering Standard の不一致を隠さず管理する台帳です。解消済み項目も Audit Trail として残します。

## Summary

| ID                 | Area              | Severity | Status              | Recommended disposition                                         |
| ------------------ | ----------------- | -------: | ------------------- | --------------------------------------------------------------- |
| `SDD-DEV-001`      | Process           |   Medium | Resolved 2026-07-22 | Backfilled Spec を Review して Baseline 承認                    |
| `SDD-DEV-002`      | Governance        |   Medium | Resolved 2026-07-22 | `AGENTS.md` を Git 管理して SDD Agent Rule を共有               |
| `AUTH-DEV-001`     | Test              |     High | Resolved 2026-07-22 | Auth PostgreSQL / HTTP Integration Test を次作業で追加          |
| `AUTH-DEV-002`     | Security          |   Medium | Resolved 2026-07-22 | Unknown Email でも Dummy Argon2 Verify を実行                   |
| `AUTH-DEV-003`     | Consistency       |      Low | Resolved 2026-07-22 | Login Token 作成と `lastLoginAt` を Transaction 化              |
| `AUTH-DEV-004`     | API Contract      |   Medium | Resolved 2026-07-22 | OpenAPI Response / Error Schema を具体化                        |
| `AUTH-DEV-005`     | Security          |   Medium | Resolved 2026-07-22 | JWT Sign/Verify を `HS256` Allowlist に固定                     |
| `PLATFORM-DEV-001` | Logging           |   Medium | Resolved 2026-07-22 | Client Request ID を長さ・文字種で検証                          |
| `PLATFORM-DEV-002` | Logging           |     High | Resolved 2026-07-22 | Authorization/Cookie/Secret の明示的 Log Redaction を設定       |
| `DEMO-DEV-001`     | Security          |     High | Resolved 2026-07-22 | Production で明示的 Allow Flag と非 Default Password を必須化   |
| `DEMO-DEV-002`     | Security          |   Medium | Resolved 2026-07-22 | Password 更新時に既存 Refresh Token Family を失効               |
| `DEMO-DEV-003`     | Consistency       |      Low | Resolved 2026-07-22 | Concurrent Provision の Unique Conflict を再読込して収束        |
| `DEMO-DEV-004`     | Logging           |   Medium | Resolved 2026-07-22 | Unknown CLI Error を Stable Sanitized Message に変換            |
| `OWN-DEV-001`      | Data integrity    |     High | Resolved 2026-07-22 | Composite Ownership Constraint を Migration で追加              |
| `OWN-DEV-002`      | Test isolation    |   Medium | Resolved 2026-07-22 | Testcontainers PostgreSQL に移行                                |
| `OWN-DEV-003`      | Concurrency       |      Low | Resolved 2026-07-22 | Parent Check/Create の Isolation Strategy を明示                |
| `OWN-DEV-004`      | Authorization     |     High | Resolved 2026-08-10 | Analysis/Document Bearer A/B HTTP Test を追加                   |
| `ANALYSIS-DEV-001` | Status model      |     High | Resolved 2026-07-24 | `DRAFT` Status と Default を Migration/Test で検証              |
| `DOC-DEV-001`      | Documentation     |   Medium | Partial             | Architecture/Testing は追加、残り Required Docs/ADR は未作成    |
| `CI-DEV-001`       | CI                |   Medium | Resolved 2026-07-22 | Integration Test を CI Quality Gate に追加                      |
| `TEST-DEV-001`     | Test bootstrap    |   Medium | Resolved 2026-08-10 | Integration Command 内で PostgreSQL Image を自動 Build          |
| `PDF-DEV-001`      | Lifecycle         |     High | Resolved 2026-08-12 | 24-hour Orphan Expiry の Worker Scan と Integration Test を追加 |
| `PDF-DEV-002`      | Operations        |   Medium | Resolved 2026-08-13 | Real CLI/Audit/Worker Manual Re-run を追加                      |
| `PROC-DEV-001`     | Status model      |     High | Resolved 2026-08-13 | `READY_FOR_EMBEDDING` を追加する                                |
| `PROC-DEV-002`     | PDF compatibility |   Medium | Resolved 2026-08-13 | Password 不要の Permission-encrypted PDF を受け入れる           |
| `RERUN-DEV-001`    | Authorization     |     High | Resolved 2026-08-13 | CLI + Workload Identity/Secret + DB Audit を採用する            |
| `RERUN-DEV-002`    | Concurrency       |   Medium | Resolved 2026-08-13 | `JobExecution` Row Lock で Concurrent CLI を直列化              |
| `TEST-DEV-002`     | Test/Concurrency  |   Medium | Accepted 2026-08-13 | Production 3 Attempt を維持し Test-side Retry のみ追加          |
| `EXTRACT-DEV-001`  | Status model      |     High | Resolved 2026-08-14 | `READY_FOR_VIEW_GENERATION` を Phase 4 Handoff に追加           |
| `EXTRACT-DEV-002`  | Operations        |   Medium | Resolved 2026-08-19 | Phase 4 Metrics/Extract を既存 Manual Re-run Allowlist に追加   |
| `VIEW-DEV-001`     | Frontend scope    |   Medium | Resolved 2026-08-24 | Phase 5 に最小 Web Auth/History/Detail Foundation を含める      |
| `VIEW-DEV-002`     | Status model      |     High | Resolved 2026-08-24 | 三 View の Atomic Publish 後だけ `COMPLETED` とする             |

2026-08-10 の `PDF-TASK-012`〜`PDF-TASK-014` Review では新規 Deviation は検出されませんでした。Real MinIO Storage、Document Bearer A/B HTTP、Redis/BullMQ Worker Cleanup の Acceptance Evidence を追加し、`OWN-DEV-004` を解消しました。

2026-08-12 の `PDF-TASK-015` Review で、期限切れ Session は Finalize Request 時にのみ `EXPIRED` へ遷移し、未 Finalize Object を自動検出する Worker Scan が存在しない `PDF-DEV-001` を検出しました。Approved `PDF-Q-005` と Technical Plan の 24-hour Cleanup Contract を満たす最小修正として、Worker Scan と実 PostgreSQL/Redis/MinIO Verification を追加します。

2026-08-12 の `PDF-TASK-016` Documentation Review で、FAILED Cleanup を Reset/Retry する内部 Repository/Publisher Contract は存在する一方、Operator が実行できる CLI/API/Runbook が存在しない `PDF-DEV-002` を検出しました。Manual Re-run Requirement の Operational Acceptance には Surface と Authorization/Audit Contract の明示的決定が必要です。

2026-08-13 の Phase 3 Draft で、Parse/Chunk 完了後に次の未実装 Phase へ渡す際、既存 Status Enum だけでは「現在実行中」と「次 Step 待機中」を正確に区別できない `PROC-DEV-001` を記録しました。また `PDF-DEV-002` を解消する Operator CLI は Authentication と Audit の Security Contract が未決定のため `RERUN-DEV-001` として明示します。いずれも Draft Approval 前に Production Behavior は変更しません。

2026-08-13 の Phase 3 Quality Gate で、既存 `PDF-TASK-015` Concurrent Upload Reservation Test が 3 回の Full Integration Run のうち 2 回、3 回の Serializable `P2034` Retry を使い切りました。Phase 3 HTTP Integration 自体と他 4 Suites / 37 Tests は成功しています。既存 Concurrency Policy の Retry/Backoff 変更は Scope と運用挙動に影響するため `TEST-DEV-002` として記録し、黙って変更しません。

2026-08-13 の Real IR PDF Probe で、3 Files は PDF Metadata 上 Encryption/Permission Restriction を持つ一方、Password 入力なしで現行 `pdfjs-dist` Parser が全 509 Pages を抽出できました。Approved Spec は `encrypted` を一律 Non-retryable Failure と読めるため、実装との差を `PROC-DEV-002` として記録し、Decision 前に Spec または Runtime Behavior を変更しません。

User は同日 `PROC-DEV-002` Option `A` を承認しました。Password/明示的復号を必要とする PDF のみ Reject し、Password 不要で安全に抽出できる Permission-encrypted PDF を受け入れるよう Spec と Verification Boundary を更新しました。

2026-08-13 の `RERUN-TASK-007` Integration で、同じ FAILED Execution への 2 Concurrent Re-run の一方が `QUEUED` + 1 Audit に正しく収束する一方、他方は PostgreSQL Serializable `P2034` を返し、Stable `not-rerunnable` Result にならない `RERUN-DEV-002` を検出しました。重複 Mutation/Audit はありませんが、Approved Concurrency Contract と CLI Stable Output を満たさないため Decision 前に Production Retry/Lock Behavior を変更しません。

2026-08-14 の `PROC-TASK-014` Security Acceptance Review では新規 Deviation は検出されませんでした。Password-required/JavaScript/URI PDF は Test 内で deterministic に生成し、Resource Limit は Production 値を変えず Pure Boundary と実 Stream で検証しました。Permission-encrypted CI Fixture、Heading Semantic Review、Active Parent Race、Phase 4 Untrusted Context E2E は既存 Verification Gap として可視化を維持します。

2026-08-14 の Phase 4 Draft で、Structured Finding/Evidence Validation 完了後も Phase 5/6 の View Output は未生成である一方、既存 `AnalysisStatus` は `VALIDATING` の次に `COMPLETED` しか持たない `EXTRACT-DEV-001` を検出しました。`COMPLETED` を使用すると API が三つの View Completion を誤表示し、`VALIDATING` を維持すると実行中と待機中を混同します。Public Status/Database Migration に影響するため、`READY_FOR_VIEW_GENERATION` の追加を推奨し、User Decision 前に Runtime/Schema を変更しません。

User は同日 `EXTRACT-Q-001` Option `A` を承認しました。Phase 4 Validation 成功後は `READY_FOR_VIEW_GENERATION` とし、Phase 5 の未開始状態を `VALIDATING` / `COMPLETED` から区別します。Migration、Shared/API Status Schema、Worker Handoff は Approved Technical Plan に従って同時に更新します。

2026-08-14 の `EXTRACT-TASK-003` Database Integrity Review では新規 Deviation は検出されませんでした。Migration は Existing Row の Owner/Lineage 不整合を Fail-fast し、Finding/Evidence/Link の Cross-owner、Cross-analysis、Cross-document Relation と Importance 範囲外を PostgreSQL Constraint で拒否します。

2026-08-17 の `EXTRACT-TASK-004` Prompt/Usage Audit Review では新規 Deviation は検出されませんでした。Git Asset、Explicit CLI、Concurrent/Repeated Activation、Immutable Content、Content-free Usage、Cross-owner Usage Reject を Fresh PostgreSQL で検証しました。Provider Runtime が Prompt/Usage Repository を呼ぶ End-to-end Evidence は後続 `EXTRACT-TASK-006` 以降の既知 Gap として Verification に保持します。

2026-08-18 の `EXTRACT-TASK-005` Deterministic Metric Review では新規 Deviation は検出されませんでした。四つの Approved P0 Metric と Missing/Ambiguous Boundary は Library/Fixture で検証済みです。`Analysis.financialMetrics` への Atomic Persist は Approved Task 分割どおり `EXTRACT-TASK-009` の既知 Gap として Verification に保持します。

2026-08-18 の `EXTRACT-TASK-006` Provider Review では新規 Deviation は検出されませんでした。Official OpenAI SDK `responses.parse` / Zod Structured Output、No-tool/No-store Request、Stable Error Classification は Unit Test で検証済みです。Pipeline Runtime 接続と Live Evidence は Approved `EXTRACT-TASK-007`〜`011` の既知 Gap として Verification に保持します。

2026-08-18 の `EXTRACT-TASK-007` Bounded Map/Merge Security Review では新規 Deviation は検出されませんでした。全 Chunk Coverage、Stable Ordering、Call/Context/Estimated Token Limit、PDF/Intermediate Candidate の Untrusted User Boundary、Prompt Injection Delimiter Escape を Pure Orchestrator Test で検証しました。Owner-scoped Active Chunk DB Resolution と Durable Runtime/Usage Audit は Approved `EXTRACT-TASK-009` の既知 Gap として Verification に保持します。

2026-08-19 の `EXTRACT-TASK-008` Evidence/Compliance/Atomic Publish Review では新規 Deviation は検出されませんでした。Exact Chunk/Page Excerpt、Server-side Lineage、Supported/Insufficient Rule、Forbidden Advice Reject、Owner/Input/Prompt Commit Recheck、Atomic Replace/Rollback を Unit と実 PostgreSQL で検証しました。Durable Repair/Queue 接続と Concurrent Runtime Race は Approved `EXTRACT-TASK-009`〜`010` の既知 Gap として Verification に保持します。

2026-08-19 の `EXTRACT-TASK-009` Durable Runtime Review で、Global Manual Re-run Requirement と Phase 4 Retry/Re-run Idempotency に対し、Approved Job Re-run Allowlist は `OBJECT_CLEANUP/PARSE/CHUNK` のみに固定されている `EXTRACT-DEV-002` を検出しました。Security/Cost Policy を黙って拡張せず、Automatic Retry と Duplicate Delivery Recovery を実装し、Manual `CALCULATE_FINANCIAL_METRICS/EXTRACT` Re-run は `EXTRACT-Q-008` Decision まで無効のまま維持します。

2026-08-20 の `EXTRACT-TASK-011` Live Evaluation Review では新規 Deviation は検出されませんでした。Harness は明示 opt-in、Production Adapter、Versioned Prompt、1 Call 上限、Content-free JSON Result に限定し、Credential がない状態で Live 成功を主張せず `EXTRACT-FR-002` を `Partial` に維持します。

2026-08-20 の `EXTRACT-TASK-012` Documentation/Traceability/Full Gate Review では新規 Deviation は検出されませんでした。Phase 4 実装は完了しましたが、Live Passed Artifact、Golden Dataset、Phase 7 Deployment/ADR Evidence は既知 Gap として残し、Verification を `Partial` に維持します。

2026-08-24 の Phase 5 Draft Review で、Backend Auth/Analysis History は実装済みである一方、`apps/web` は Phase 1 Landing Page のみで、Login Session、History、Analysis Detail が存在しない `VIEW-DEV-001` を検出しました。Evidence Drawer/PDF Navigation の End-to-end Verification に必要なため、Phase 5 Scope に最小 Foundation を含めるか、独立 Feature を先行するかを `VIEW-Q-005` で決定します。

同 Review で、Development Phases は Phase 5 に Just Tell Me/Analyst、Phase 6 に Buffett-Munger Lens を配置する一方、三 View はすべて P0 Core View であり、既存 Status は `READY_FOR_VIEW_GENERATION` と `COMPLETED` の間に Partial Completion を表す値を持たない `VIEW-DEV-002` を検出しました。二 View 完了を `COMPLETED` と誤表示せず、不要な公開 Status も増やさない案として三 View を Phase 5 で原子的に生成する Option A を `VIEW-Q-001` で推奨します。User Decision 前に Status/Runtime は変更しません。

User は同日 `VIEW-Q-001`〜`VIEW-Q-007` Option `A` を承認しました。Phase 5 は三 View の Atomic Publish 後だけ既存 `COMPLETED` へ進め、最小 Web Login/Refresh/Logout、History、Analysis Detail Shell を同 Feature に含めます。これにより `VIEW-DEV-001` / `VIEW-DEV-002` の Material Decision は解消しました。Runtime Evidence は Approved Tasks で追加します。

2026-08-24 の `VIEW-TASK-002` Shared Contract Review では新規 Deviation は検出されませんでした。Three-view Required Section、Direct Citation Shape、Missing Information、Budget、Advice/Impersonation/Endorsement Compliance は Unit Evidence を持ちますが、Provider Runtime、Database Lineage、Atomic Publish、Web Plain-text Rendering は後続 Approved Task の Gap として可視化を維持します。

同日の `VIEW-TASK-003` Prompt/Orchestrator Review では新規 Deviation は検出されませんでした。Versioned Prompt、Strict Source DTO、stable full-source order、One-call Provider Request、Context/Output Budget、single untrusted block、content-free Usage Result は Unit Evidence を持ちますが、Owner-scoped Database Resolution、Usage Persist、Repair/Retry、Atomic Publish は後続 Approved Task の Gap として維持します。

2026-08-27 の `VIEW-TASK-004` Owner-scoped Citation/Atomic Publish Review では新規 Deviation は検出されませんでした。Active FindingEvidence と Original Document/Page/Chunk/Excerpt の再解決、Unknown/Unlinked/Cross-owner Citation Reject、三 JSONB + Completion Atomic Publish、Input/Prompt/Delete Race は Unit/Real PostgreSQL Evidence を持ちます。Durable Queue、Repair/Retry、Usage Persist、Manual Re-run は Approved `VIEW-TASK-005` の既知 Gap として維持します。

2026-08-28 の `VIEW-TASK-005` Durable Generation Review では新規 Deviation は検出されませんでした。Fixed Source/Prompt/Schema/Runtime Identity、Pending Recovery、Bounded Repair、Transient Retry、Content-free Usage、Sanitized Exhaustion、同一 Execution Manual Re-run、Atomic Completion は Unit と Real PostgreSQL/Redis/BullMQ Evidence を持ちます。Read API、Storage、Web は Approved `VIEW-TASK-006` 以降の既知 Scope として維持します。

2026-08-30 の `VIEW-TASK-006` Aggregate Read API Review では新規 Deviation は検出されませんでした。Completed-only Strict Projection、Owner A/B 404 Boundary、Not-ready 409、Corrupt/Missing Lineage Fail-closed、OpenAPI は Unit と Real PostgreSQL HTTP Evidence を持ちます。Storage、Browser Session/UI、PDF.js は Approved `VIEW-TASK-007`〜`010` の既知 Scope として維持します。

## Resolution Evidence

| Deviation                              | Resolution evidence                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SDD-DEV-001`, `SDD-DEV-002`           | User が Backfilled Baseline を承認。`AGENTS.md` を `.gitignore` から除外し、`specs/` とともに追跡対象化           |
| `AUTH-DEV-001`                         | `auth.integration-spec.ts` が Register/Login/Refresh/Reuse/Logout/Guard/Rate Limit/CORS を隔離 PostgreSQL で検証  |
| `AUTH-DEV-002`〜`AUTH-DEV-005`         | Dummy Argon2id Verify、Atomic Login Repository、Concrete OpenAPI DTO、HS256 Allowlist と Regression Test          |
| `PLATFORM-DEV-001`, `PLATFORM-DEV-002` | Request ID Validator と Pino Secret Redaction の Unit/Emitted Log Test                                            |
| `DEMO-DEV-001`〜`DEMO-DEV-004`         | Production Guard、Transactional Session Revoke、`P2002` Convergence、Stable Error Mapper の Unit/Integration Test |
| `OWN-DEV-001`〜`OWN-DEV-003`           | Fail-fast Migration、Composite FK、Serializable `P2034` Retry、Testcontainers Concurrency/Direct FK Test          |
| `OWN-DEV-004`                          | Analysis と Document Start/Re-presign/Finalize/List/Delete の Bearer User A/B HTTP Test                           |
| `ANALYSIS-DEV-001`                     | Split Enum/Default Migrations、`DRAFT` Create HTTP Test、空 PostgreSQL への全 Migration                           |
| `CI-DEV-001`                           | Tracked GitHub Actions が `spec:check` と Docker-based `test:integration` を必須 Step として実行                  |
| `TEST-DEV-001`                         | Root `test:integration` が Project PostgreSQL Image を準備してから Testcontainers Suite を実行                    |
| `PDF-DEV-001`                          | Worker の bounded Expiry Scan、Stable Cleanup Upsert、Redis/BullMQ/MinIO End-to-end Orphan Delete Test            |
| `PDF-DEV-002`                          | Cleanup Attempt 3 FAILED → Real CLI Inspect/Re-run → Audit → same Execution Attempt 4 Worker Success              |
| `PROC-DEV-002`                         | `PROC-Q-007` Approved A、Real IR 3 Files / 509 Pages Direct Parser Probe、Spec/Plan/Acceptance Boundary Update    |
| `RERUN-DEV-002`                        | Approved B、`READ COMMITTED` + `FOR UPDATE`、Concurrent 1 queued / 1 not-rerunnable / 1 Audit Integration         |
| `EXTRACT-DEV-001`                      | `EXTRACT-Q-001` Approved A、Phase 4 Handoff を `READY_FOR_VIEW_GENERATION` として Spec/Plan に固定                |
| `VIEW-DEV-001`, `VIEW-DEV-002`         | `VIEW-Q-001` / `VIEW-Q-005` Approved A、三 View Completion と最小 Web Foundation を Scope に固定                  |

## Detail

以下は発見時の Evidence、Impact、Options を保存した履歴です。現在 Status と実装 Evidence は上記 Summary/Resolution Evidence を正とします。

### SDD-DEV-001 — Existing features preceded approved specifications

- Evidence: Authentication、Demo User、Owner-scoped Repository は Feature Spec と Requirement ID がない状態で実装されました。
- Impact: 既存 Code と Test が Product Intent を完全に満たすか、実装時点で Review 可能ではありませんでした。
- Current action: As-is Spec、Plan、Tasks、Verification を Backfill しました。
- Decision required: Backfilled Spec を現行 Baseline として承認するか、修正 Requirement を指定してください。

### SDD-DEV-002 — AGENTS.md is intentionally ignored by Git

- Evidence: `.gitignore` は `AGENTS.md` を Local AI Agent Instructions として除外しています。
- Impact: 今回追加した Agent 向け SDD Workflow は Local Workspace では有効ですが、Clone、Collaborator、CI には伝播しません。追跡対象の `specs/README.md` に同じ Core Workflow はあります。
- Options: `A` `.gitignore` から除外を外して Track、`B` Local のまま維持し `specs/README.md` だけを共有 Source とする。
- Recommendation: `A`。Repository 固有の Agent Governance を再現可能にします。

### AUTH-DEV-001 — Authentication acceptance coverage is incomplete

- Evidence: Unit Test は Password、JWT、Refresh Rotation の一部を検証していますが、実 PostgreSQL での Register/Login/Logout/Rotation、Reuse Race、Rate Limit、CORS、Production Cookie、Guard の HTTP Flow は未検証です。
- Conflict: `AGENTS.md` は API Integration Test、Testcontainers PostgreSQL、Auth Test を要求します。
- Options: `A` 次 Feature 前に補完、`B` PDF Upload と同時に共通 Test Harness を構築、`C` Phase 7 まで延期。
- Recommendation: `B`。Testcontainers Harness を再利用し、Auth と Upload を同時に Integration Gate へ載せます。

### AUTH-DEV-002 — Login timing can reveal unknown email paths

- Evidence: `AuthService.login` は User が存在しない場合に Argon2 Verify を実行しません。
- Impact: Error Message は共通ですが、十分な測定が可能な攻撃者に Timing Difference を与える可能性があります。
- Options: `A` Dummy Hash Verify、`B` 現状維持して Rate Limit のみ、`C` Risk Acceptance を期限付きで記録。
- Recommendation: `A`。

### AUTH-DEV-003 — Login audit update is not atomic with token persistence

- Evidence: Refresh Token 作成後に別 Query で `lastLoginAt` を更新します。
- Impact: 後段 Update 失敗時に Client へ返らない有効 Token Record が残ります。Secret は失われるため直ちに悪用されませんが、Audit と Cleanup の整合性が崩れます。
- Options: `A` Transaction 化、`B` Token 成功を優先し Audit Update Failure を Log、`C` 現状維持。
- Recommendation: `A`。

### AUTH-DEV-004 — OpenAPI contract is descriptive rather than structural

- Evidence: Auth Endpoint は Success Description を持ちますが、共通 Response/Error Schema、Cookie、各 Stable Error Code が OpenAPI Schema として定義されていません。
- Impact: Spec と生成 API Contract の機械的比較ができません。
- Recommendation: Shared Schema から OpenAPI DTO/Schema を定義し、Error Response を列挙します。

### AUTH-DEV-005 — JWT algorithm is not explicitly allowlisted

- Evidence: Token は Default `HS256` で Sign されますが、Verify Option に `algorithms: ['HS256']` がありません。Library は Symmetric Key で利用可能な Algorithm を受理し得ます。
- Impact: 現在の Shared Secret 構成で直ちに Key-type Confusion になるわけではありませんが、Token Contract が意図より広く、将来の Config 変更時に Risk になります。
- Recommendation: Sign/Verify 双方で `HS256` を明示し、別 Algorithm の Token を拒否する Test を追加します。

### PLATFORM-DEV-001 — Client request IDs are trusted without bounds

- Evidence: `x-request-id` が String なら、そのまま Fastify Request ID と Structured Log に使用します。
- Impact: 極端に長い値や制御文字による Log 品質低下、Storage 増加、相関 ID の不正確化があり得ます。
- Recommendation: ASCII/UUID または限定文字種、最大長を Spec 化して、不正値は Server UUID に置換します。

### PLATFORM-DEV-002 — Structured logger has no explicit secret redaction policy

- Evidence: Fastify Logger と Nest JSON Logger は有効ですが、`authorization`、`cookie`、`set-cookie`、Password Field 等の Redaction Path が明示されていません。
- Conflict: `AGENTS.md` は Token、Password、Sensitive Data を Log しないことと Log Redaction を要求します。
- Impact: Default Serializer が現在 Header 全体を出さなくても、Error/Plugin/将来の Logger 変更で Secret が記録される Regression を防げません。
- Recommendation: Logger Redaction Config と Automated Log Capture Test を PDF Upload 前に追加します。

### DEMO-DEV-001 — Production provisioning has no explicit safety gate

- Evidence: CLI は `NODE_ENV=production` でも実行でき、`.env.example` には既知の Local Demo Credential があります。
- Impact: Local Default を誤って Production に投入すると、既知 Credential の Account を作成できます。
- Options: `A` Production 禁止、`B` `ALLOW_DEMO_USER_PROVISIONING=true` と Default 以外の Credential を必須化、`C` 現状維持。
- Recommendation: `B`。Portfolio Demo Environment を許可しつつ誤実行を防止します。

### DEMO-DEV-002 — Password update does not revoke existing sessions

- Evidence: Provisioner は `passwordHash` を更新しますが、既存 Refresh Token Family を失効しません。
- Impact: Credential Rotation 後も旧 Session が Refresh 可能です。
- Options: `A` Password 変更時のみ全 Family 失効、`B` Demo User の全実行時に失効、`C` 現状維持。
- Recommendation: `A`。

### DEMO-DEV-003 — Concurrent provisioning does not converge cleanly

- Evidence: 二つの Process が同時に不存在を確認すると、一方は User Email Unique Conflict で失敗します。
- Impact: Deployment Automation の Retry は必要ですが、Data Corruption は発生しません。
- Recommendation: Unique Conflict 後に再読込し、通常の Existing User Rule を適用します。

### DEMO-DEV-004 — CLI forwards unknown error messages

- Evidence: `provision-demo-user.ts` は Catch した任意の `Error.message` を Structured Error Output にそのまま含めます。
- Impact: Prisma/Driver/Runtime Error が Connection Detail、Query Detail、内部 Path を含む場合に Log へ露出する可能性があります。
- Options: `A` Stable Generic Message + Error Code のみ、`B` Development のみ Detail を出す、`C` 現状維持。
- Recommendation: `A`。Debug Detail は Secret-redacted Internal Logger に限定します。

### OWN-DEV-001 — Database does not enforce parent/child owner equality

- Evidence: `Document.ownerId` と `Analysis.ownerId` は個別 Foreign Key であり、Owner Equality の Composite Foreign Key はありません。Repository は Transaction で検証しますが、Worker、Script、将来の Repository が Bypass できます。
- Impact: 不整合 Data が作成されると Repository Filter と Parent Relation の意味が分離します。
- Options: `A` Composite Unique/FK を User-owned Parent/Child に段階導入、`B` Repository/Service Test のみ、`C` PostgreSQL RLS を追加。
- Recommendation: `A`。MVP では Analysis→Document から開始し、Phase 3 Child Table に拡張します。

### OWN-DEV-002 — Integration tests use the shared local database

- Evidence: `pnpm test:integration` は起動済み `stocklens_ai.public` に Random Test Data を作成し、終了時に ID Scope で削除します。
- Conflict: `AGENTS.md` は Testcontainers PostgreSQL を要求します。
- Impact: 強制終了時の残存、Local Environment 依存、並列 CI の分離不足があります。
- Recommendation: Testcontainers PostgreSQL を導入し、Migration を毎回適用します。追加 Dependency と Docker-based CI が必要です。

### OWN-DEV-003 — Parent check and child creation use default isolation

- Evidence: `DocumentRepository.createForAnalysis` は同一 Transaction で Parent を確認して Child を作成しますが、PostgreSQL Default `READ COMMITTED` では確認後に別 Transaction が Parent を Soft Delete できます。
- Impact: Soft-deleted Analysis に Active Document が作成される小さな Race Window があります。
- Options: `A` Parent Row Lock、`B` Serializable Transaction + Retry、`C` Upload Service の Status/Finalization Check で収束。
- Recommendation: `A` または、Prisma の制約が大きければ `B`。

### OWN-DEV-004 — HTTP authorization is not yet verifiable

- Evidence: 発見時は Analysis / Document Endpoint と Service が未実装で、Authenticated User ID が Request Body ではなく Access Token から渡ることを HTTP Test できませんでした。
- Impact: Repository Boundary は検証済みですが、End-to-end Authorization は未証明です。
- Resolution: Analysis Create/List/Get/Rename/Delete と Document Start/Re-presign/Finalize/List/Delete は Bearer User A/B の Testcontainers HTTP Test で検証済みです。Cross-user Request は Stable Not Found となり、Database、Storage、Cleanup Side Effect を発生させません。

### TEST-DEV-001 — Integration test depends on a manually built local image

- Evidence: `startMigratedPostgres` は Local-only `stocklens-postgres:16-pgvector` を参照しますが、Root `test:integration` は Image を Build しませんでした。CI と README だけが別の Manual Build Step を持っていました。
- Impact: Docker Image Tag が存在しない Environment では Testcontainers が Local-only Name を Registry から Pull しようとして `pull access denied` で失敗し、Application Test に到達しません。
- Resolution: Root `test:integration` に Cacheable `test:integration:prepare` を組み込み、Local/CI/Agent の単一 Command で Image Build と Test を完結させました。CI の重複 Build Step と README の Manual Prerequisite を削除しました。

### PDF-DEV-001 — Expired orphan uploads are not discovered automatically

- Evidence: `DocumentUploadRepository.claimForFinalize` は Request 時に期限切れ Session を `EXPIRED` にして Cleanup を保存しますが、Worker は既存 `QUEUED` Cleanup の Redis Dispatch だけを Scan し、期限切れ `PENDING` / `VALIDATING` Session 自体を検索しません。
- Conflict: Approved `PDF-Q-005` は未 Finalize Object/Session を 24 時間で Expire し、Retry 可能な Cleanup Job で削除することを要求します。
- Impact: Client が Finalize を呼ばない場合、Private Bucket の孤児 Object と Upload Slot が永続的に残る可能性があります。
- Disposition: `PDF-TASK-015` で bounded / idempotent Worker Expiry Scan を追加し、PostgreSQL State、Stable Cleanup Execution、Redis/BullMQ Dispatch、MinIO Delete を Integration Test で検証します。Public API と Database Schema は変更しません。
- Resolution: Worker 起動時と 60 秒 Interval の Scan を追加しました。Status/Expiry 条件付き Update と Cleanup Upsert を Serializable Transaction にまとめ、同じ Scan の再実行が Job を増やさないこと、および実 Redis/BullMQ Worker が MinIO Object を削除することを検証しました。

### PDF-DEV-002 — Failed cleanup has no operator-facing manual re-run surface

- Evidence: `ObjectCleanupRepository.markQueuedForRetry`、`ObjectCleanupQueuePublisher.enqueue`、BullMQ `retry()` は FAILED Execution の再利用を Unit Test していますが、Operator が Target/Execution を指定して呼べる CLI、Admin API、Runbook はありません。
- Conflict: Cross-cutting Async Status Machine は Failed Job の Manual Re-run を要求し、Technical Plan も最終失敗後の明示的 Retry を Contract としています。
- Impact: Automatic 3 Attempt を使い切った Object は、Application Code を直接追加・実行しない限り運用者が安全に Cleanup へ戻せません。
- Options: `A` Authenticated Admin/Operator CLI と Audit Log、`B` Internal Admin API と専用 Authorization、`C` Phase 3 の統一 Job Re-run Feature まで期限付き Risk Acceptance。
- Recommendation: `A`。MVP の Public User API を広げず、Execution ID、対象確認、Audit、Stable Output を持つ CLI を Spec 化します。
- Decision: User は 2026-08-12 に Option `C` を選択しました。PDF Upload Feature では新しい CLI/API を追加せず、Operator-facing Manual Re-run を Phase 3 の統一 Job Re-run Feature へ延期します。
- Accepted risk: Automatic 3 Attempt 後に FAILED のまま残る Cleanup は Durable Record と Sanitized Attempt History を保持しますが、現時点では Operator が Supported Surface から再実行できません。
- Follow-up owner: Phase 3 Job Execution / Manual Re-run Specification。Public API、Authorization、Audit、Runbook を実装前に承認します。
- Resolution: Phase 3 で CLI-only Inspect/Re-run、Production Guard、`JobOperationAudit`、Redis Recovery を実装し、Cleanup Attempt 3 FAILED から同一 Execution Attempt 4 Success まで real PostgreSQL/Redis/BullMQ/MinIO Integration で検証しました。

### ANALYSIS-DEV-001 — Pre-upload Analysis has no valid status

- Evidence: Approved `PDF-Q-006` は Analysis を Upload Intent より前に作成しますが、`AnalysisStatus` と `AGENTS.md` の Async Status Machine は `UPLOADED` から始まり、Pre-upload State を持ちません。
- Impact: Document が存在しない Analysis を `UPLOADED` と保存すると API、History、Worker の Status Interpretation が事実と一致しません。
- Options: `A` `DRAFT` Status を追加して最初の Document Finalize 後に `UPLOADED` へ遷移、`B` `UPLOADED` を「Analysis Container Created」の意味に拡張、`C` 別 Draft Entity を追加して Upload 後に Analysis を作成。
- Recommendation: `A`。Approved PDF Flow を保ちつつ、Status の意味と遷移を明示できます。
- Decision: User は 2026-07-24 に `DRAFT` Status の追加と最初の Document Finalize 後の `UPLOADED` 遷移を承認しました。

### PROC-DEV-001 — Phase 3 handoff has no unambiguous status

- Evidence: 現行 `AnalysisStatus` は `CHUNKING` の次を `EMBEDDING` としますが、Embedding Processor は Phase 4 まで未実装です。`CHUNKING` のままでは実行中に見え、`EMBEDDING` のままでは未稼働 Step が実行中に見えます。
- Impact: User-facing Status、Worker Recovery Scan、Manual Re-run、Phase 4 Handoff が同じ値を異なる意味で扱う可能性があります。
- Options: `A` `READY_FOR_EMBEDDING` を追加、`B` Phase 3 Runtime を Feature Flag で無効にして Phase 4 と同時 Release、`C` `EMBEDDING` を Queued/Waiting も含む Status として仕様化し Job Status で実行中を区別。
- Recommendation: `A`。State の意味が最も明確ですが、Database/API Enum 変更を伴います。
- Decision: User は 2026-08-13 に Option `A`、`READY_FOR_EMBEDDING` の追加を承認しました。

### RERUN-DEV-001 — Operator authentication and audit persistence are undecided

- Evidence: `PDF-DEV-002` は Operator-facing Supported Surface を要求しますが、Application に Admin Role/Audit Table はなく、AWS IAM/Deployment Design も Phase 7 です。
- Impact: Environment access だけで Production Mutation を許可するか、Application-level Authorization/Audit を追加するかで Security、Schema、運用 Scope が大きく変わります。
- Options: `A` CLI-only + Workload IAM/Secrets + 専用 DB Audit Table、`B` Admin Role + Internal API + Audit Table、`C` CLI-only + Central Structured Log Audit。
- Recommendation: `A`。Public Attack Surface を増やさず、Durable Queryable Audit を保持します。
- Decision: User は 2026-08-13 に Option `A`、CLI-only + Workload Identity/Secret + Production Enable Flag + `JobOperationAudit` を承認しました。

### PROC-DEV-002 — Permission-encrypted PDFs have an ambiguous acceptance boundary

- Evidence: `test-data/` の 3 Public IR PDFs は `pdfinfo` 上 Encryption/Permission Restriction を持ちますが、Password は不要で Copy が許可され、現行 Byte-only `pdfjs-dist` Parser は 63 / 124 / 322 Pages を正常抽出しました。
- Conflict: Approved `PROC-AC-007` と Edge Case 表は `encrypted` PDF を Non-retryable `FAILED_PARSING` としますが、Non-goal は「Password 付きまたは暗号化 PDF の解除」であり、解除を必要としない Permission-encrypted PDF を Reject するかは明確ではありません。
- Impact: 一律 Reject は一般的な Public IR PDF を不要に排除する可能性があり、現行 Accept は Acceptance Criterion の字面と一致しません。
- Options: `A` Password 入力または復号を要求する PDF のみ Reject し、Password 不要で安全に Text 抽出できる Permission-encrypted PDF は Accept、`B` Encryption Flag がある PDF を一律 Reject、`C` 現行挙動を暫定維持して Phase 7 Compatibility Policy まで延期。
- Recommendation: `A`。Security Boundary を維持しつつ、実際の Public IR Dataset と互換性があります。承認後に Spec/Test を更新します。
- Decision: User は 2026-08-13 に Option `A` を承認しました。Password/明示的復号が必要な PDF のみ Reject し、Password 不要で安全に抽出できる Permission-encrypted PDF は通常 Limit 内で受け入れます。
- Resolution evidence: Approved Spec/Plan/Acceptance を更新し、Local Real IR 3 Files / 509 Pages の Direct Parser Probe が成功しました。Repeatable CI Fixture と Full Worker E2E は Verification Gap として維持します。

### RERUN-DEV-002 — Concurrent re-run exposes a serializable conflict

- Evidence: Isolated PostgreSQL Integration で同じ FAILED `PARSE` Execution に 2 Concurrent `rerun` を実行すると、一方は `QUEUED` + 1 `JobOperationAudit` に成功し、他方は Prisma `P2034` で Reject されました。
- Conflict: `RERUN-AC-003` / `RERUN-SEC-004` は Concurrent Duplicate Command が一つの Transition に収束し、Supported CLI が Stable Result/Error を返すことを要求します。
- Impact: Data/監査の重複はありませんが、競合した Operator は Generic `JOB_OPERATION_FAILED` を受け、実際には同 Job が Queue 済みか判断できません。
- Options: `A` Repository 内で `P2034` を最大 3 回 bounded retry し、再読込後 `not-rerunnable` へ収束、`B` Execution Row を `SELECT ... FOR UPDATE` で直列化、`C` 現状を Risk Accept して `RERUN-AC-003` を Partial のまま維持。
- Recommendation: `A`。CLI は低頻度 Operation で、Schema/Architecture を変えず既存 Serializable Contract と Stable Result を満たします。
- Decision: User は 2026-08-13 に Option `B` を承認しました。`READ COMMITTED` Transaction 内で対象 `JobExecution` を `SELECT ... FOR UPDATE` し、Lock 待機後に Status/Limit/Target を再読込します。
- Resolution: Option `B` の `READ COMMITTED` + `SELECT ... FOR UPDATE` を実装しました。Concurrent PostgreSQL Regression は 1 `queued` / 1 Stable `not-rerunnable` / 1 Audit に成功し、Full Integration Gate 6 Suites / 51 Tests も成功しました。

### TEST-DEV-002 — Serializable retry exhaustion is flaky under concurrent upload reservation

- Evidence: `PDF-TASK-015` の 4 Concurrent Start は Serializable Transaction を使用しますが、同時 Retry が再衝突し、現行 3 Attempt を使い切る Run があります。2026-08-13 の Full Integration 3 Runs は 1 Passed / 2 Failed でした。
- Impact: Data Corruption や 3 File Limit 違反は観測されませんが、正当な Concurrent Request の一つが Stable Limit Result ではなく Internal Failure になります。CI Gate も非決定的です。
- Options: `A` 5 Attempt + bounded jittered backoff、`B` Parent Row Lock で Slot Reservation を直列化、`C` 現行 3 Attempt を維持して Test Retry のみ追加。
- Recommendation: `A`。Architecture を変えず Thundering Retry を分散できます。ただし Production Retry Latency の変更なので User Approval 前に実装しません。
- Decision: User は 2026-08-13 に Option `C` を選択しました。Production の 3 Attempt は維持し、`PDF-TASK-015` Acceptance Harness だけが外側で `P2034` を最大 3 回再試行します。
- Accepted risk: Production Request は高競合時に 3 Attempt を使い切り、Stable Limit Result ではなく Sanitized Internal Failure になる可能性があります。Data Corruption や 3 File Limit 違反は許容しません。
- Verification: Option `C` 適用後の Full Integration 5 Suites / 38 Tests は成功しました。これは Production Retry Exhaustion Risk を解消した Evidence ではなく、明示的 Risk Acceptance 下の Test Gate Stabilization です。

### EXTRACT-DEV-002 — Phase 4 failed jobs are outside the manual re-run allowlist

- Evidence: Structured Extraction は failed `CALCULATE_FINANCIAL_METRICS` / `EXTRACT` Execution を作成しますが、Approved `RERUN-Q-004` は CLI Allowlist を `OBJECT_CLEANUP/PARSE/CHUNK` に固定しています。
- Conflict: Global Async Requirement は Failed Job の Manual Re-run を求め、`EXTRACT-FR-009` は Re-run Idempotency を要求します。一方、Job Re-run Spec は Future Step の追加を Feature ごとの明示決定に委ねています。
- Impact: Automatic 3 Attempts を使い切った Phase 4 Execution は Durable Failure/Audit を保持しますが、Supported Operator CLI から再実行できません。
- Options: `A` `CALCULATE_FINANCIAL_METRICS` と `EXTRACT` を既存 CLI Allowlist に追加、`B` Provider Cost を伴う `EXTRACT` だけ追加、`C` 現行 Allowlist を維持して Phase 7 Operations へ延期。
- Recommendation: `A`。既存 CLI-only、Production Guard、Workload IAM、Audit、5回上限を再利用し、新しい Network Surface を追加しません。
- Decision: User は 2026-08-19 に `EXTRACT-Q-008` Option `A` を承認しました。
- Resolution: `CALCULATE_FINANCIAL_METRICS` と `EXTRACT` を既存 CLI Allowlist と Analysis Queue Dispatch に追加しました。同一 Execution、Workload IAM/Secret Guard、Audit、5 回上限を再利用し、`VALIDATE` は Fail-closed のまま維持します。
- Verification: PostgreSQL Integration で両 Step の `FAILED → QUEUED` + Audit と `VALIDATE` Reject、Unit で Stable BullMQ Job Name/Queue Routing を確認します。

### DOC-DEV-001 — Required cross-cutting documents are incomplete

- Evidence: `docs/architecture.md`、`testing-strategy.md`、`ai-pipeline.md`、`evidence-model.md`、`evaluation.md`、`deployment.md` と Required ADR の多くが未作成です。
- Impact: Phase 0 Documentation は完了扱いにできません。
- Disposition: Feature Delivery を止めず、関連 Phase に入る前に該当文書を作成します。Architecture と Testing Strategy は PDF Upload Plan 前に優先します。

### CI-DEV-001 — Integration tests are not a CI gate

- Evidence: Local `test:integration` Script はありますが、Repository の追跡対象に Integration CI Workflow がありません。
- Impact: Cross-user Isolation Regression を Remote Change Gate で検出できません。
- Options: `A` Testcontainers 導入と同時に CI 化、`B` Local PostgreSQL Service Container で先に CI 化、`C` Phase 7 まで延期。
- Recommendation: `A`。

## Decision Log

2026-07-22 に User が Recommended Disposition 15 項目をすべて承認しました。

| Date       | Deviation ID                           | Decision                         | Consequence                                                                     |
| ---------- | -------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| 2026-07-22 | `SDD-DEV-001`, `SDD-DEV-002`           | Recommended disposition approved | Backfilled Baseline を承認し、`AGENTS.md` と CI Workflow を Track する          |
| 2026-07-22 | `AUTH-DEV-001`〜`AUTH-DEV-005`         | Recommended disposition approved | Auth Hardening、OpenAPI、Integration Coverage を実装する                        |
| 2026-07-22 | `PLATFORM-DEV-001`, `PLATFORM-DEV-002` | Recommended disposition approved | Request ID Validation と Log Redaction を実装する                               |
| 2026-07-22 | `DEMO-DEV-001`〜`DEMO-DEV-004`         | Recommended disposition approved | Production Guard、Session Revoke、Concurrency、Error Sanitization を実装する    |
| 2026-07-22 | `OWN-DEV-001`〜`OWN-DEV-003`           | Recommended disposition approved | Composite FK、Testcontainers、Serializable Retry を実装する                     |
| 2026-07-22 | `CI-DEV-001`                           | Recommended disposition approved | Integration Test を CI Gate に追加する                                          |
| 2026-07-24 | `ANALYSIS-DEV-001`                     | `DRAFT` Status approved          | Pre-upload Analysis を `DRAFT`、最初の Document Finalize 後を `UPLOADED` とする |
| 2026-08-12 | `PDF-DEV-002`                          | Option `C` approved              | Operator Manual Re-run を統一 Job Re-run Feature まで延期                       |
| 2026-08-13 | `RERUN-DEV-002`                        | Option `B` approved              | `READ COMMITTED` + `JobExecution` Row Lock で Concurrent CLI を直列化           |
| 2026-08-19 | `EXTRACT-DEV-002`                      | Option `A` approved              | Metrics/Extract を既存 CLI-only Manual Re-run Allowlist に追加                  |
