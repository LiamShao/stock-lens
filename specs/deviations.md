# SDD Deviations and Open Decisions

この文書は Spec、Code、Test、Security Rule、Engineering Standard の不一致を隠さず管理する台帳です。解消済み項目も Audit Trail として残します。

## Summary

| ID                 | Area           | Severity | Status              | Recommended disposition                                       |
| ------------------ | -------------- | -------: | ------------------- | ------------------------------------------------------------- |
| `SDD-DEV-001`      | Process        |   Medium | Resolved 2026-07-22 | Backfilled Spec を Review して Baseline 承認                  |
| `SDD-DEV-002`      | Governance     |   Medium | Resolved 2026-07-22 | `AGENTS.md` を Git 管理して SDD Agent Rule を共有             |
| `AUTH-DEV-001`     | Test           |     High | Resolved 2026-07-22 | Auth PostgreSQL / HTTP Integration Test を次作業で追加        |
| `AUTH-DEV-002`     | Security       |   Medium | Resolved 2026-07-22 | Unknown Email でも Dummy Argon2 Verify を実行                 |
| `AUTH-DEV-003`     | Consistency    |      Low | Resolved 2026-07-22 | Login Token 作成と `lastLoginAt` を Transaction 化            |
| `AUTH-DEV-004`     | API Contract   |   Medium | Resolved 2026-07-22 | OpenAPI Response / Error Schema を具体化                      |
| `AUTH-DEV-005`     | Security       |   Medium | Resolved 2026-07-22 | JWT Sign/Verify を `HS256` Allowlist に固定                   |
| `PLATFORM-DEV-001` | Logging        |   Medium | Resolved 2026-07-22 | Client Request ID を長さ・文字種で検証                        |
| `PLATFORM-DEV-002` | Logging        |     High | Resolved 2026-07-22 | Authorization/Cookie/Secret の明示的 Log Redaction を設定     |
| `DEMO-DEV-001`     | Security       |     High | Resolved 2026-07-22 | Production で明示的 Allow Flag と非 Default Password を必須化 |
| `DEMO-DEV-002`     | Security       |   Medium | Resolved 2026-07-22 | Password 更新時に既存 Refresh Token Family を失効             |
| `DEMO-DEV-003`     | Consistency    |      Low | Resolved 2026-07-22 | Concurrent Provision の Unique Conflict を再読込して収束      |
| `DEMO-DEV-004`     | Logging        |   Medium | Resolved 2026-07-22 | Unknown CLI Error を Stable Sanitized Message に変換          |
| `OWN-DEV-001`      | Data integrity |     High | Resolved 2026-07-22 | Composite Ownership Constraint を Migration で追加            |
| `OWN-DEV-002`      | Test isolation |   Medium | Resolved 2026-07-22 | Testcontainers PostgreSQL に移行                              |
| `OWN-DEV-003`      | Concurrency    |      Low | Resolved 2026-07-22 | Parent Check/Create の Isolation Strategy を明示              |
| `OWN-DEV-004`      | Authorization  |     High | Partial             | Analysis HTTP は検証済み、Document HTTP は PDF Feature で検証 |
| `ANALYSIS-DEV-001` | Status model   |     High | Resolved 2026-07-24 | `DRAFT` Status と Default を Migration/Test で検証            |
| `DOC-DEV-001`      | Documentation  |   Medium | Partial             | Architecture/Testing は追加、残り Required Docs/ADR は未作成  |
| `CI-DEV-001`       | CI             |   Medium | Resolved 2026-07-22 | Integration Test を CI Quality Gate に追加                    |

## Resolution Evidence

| Deviation                              | Resolution evidence                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SDD-DEV-001`, `SDD-DEV-002`           | User が Backfilled Baseline を承認。`AGENTS.md` を `.gitignore` から除外し、`specs/` とともに追跡対象化           |
| `AUTH-DEV-001`                         | `auth.integration-spec.ts` が Register/Login/Refresh/Reuse/Logout/Guard/Rate Limit/CORS を隔離 PostgreSQL で検証  |
| `AUTH-DEV-002`〜`AUTH-DEV-005`         | Dummy Argon2id Verify、Atomic Login Repository、Concrete OpenAPI DTO、HS256 Allowlist と Regression Test          |
| `PLATFORM-DEV-001`, `PLATFORM-DEV-002` | Request ID Validator と Pino Secret Redaction の Unit/Emitted Log Test                                            |
| `DEMO-DEV-001`〜`DEMO-DEV-004`         | Production Guard、Transactional Session Revoke、`P2002` Convergence、Stable Error Mapper の Unit/Integration Test |
| `OWN-DEV-001`〜`OWN-DEV-003`           | Fail-fast Migration、Composite FK、Serializable `P2034` Retry、Testcontainers Concurrency/Direct FK Test          |
| `ANALYSIS-DEV-001`                     | Split Enum/Default Migrations、`DRAFT` Create HTTP Test、空 PostgreSQL への全 Migration                           |
| `CI-DEV-001`                           | Tracked GitHub Actions が `spec:check` と Docker-based `test:integration` を必須 Step として実行                  |

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

- Evidence: Analysis / Document Endpoint と Service は未実装のため、Authenticated User ID が Request Body ではなく Access Token から渡ることを HTTP Test できません。
- Impact: Repository Boundary は検証済みですが、End-to-end Authorization は未証明です。
- Current status: Analysis Create/List/Get/Rename/Delete は Bearer User A/B の Testcontainers HTTP Test で検証済みです。Document HTTP API は PDF Upload Feature まで Blocked のため、Deviation 全体は Partial です。

### ANALYSIS-DEV-001 — Pre-upload Analysis has no valid status

- Evidence: Approved `PDF-Q-006` は Analysis を Upload Intent より前に作成しますが、`AnalysisStatus` と `AGENTS.md` の Async Status Machine は `UPLOADED` から始まり、Pre-upload State を持ちません。
- Impact: Document が存在しない Analysis を `UPLOADED` と保存すると API、History、Worker の Status Interpretation が事実と一致しません。
- Options: `A` `DRAFT` Status を追加して最初の Document Finalize 後に `UPLOADED` へ遷移、`B` `UPLOADED` を「Analysis Container Created」の意味に拡張、`C` 別 Draft Entity を追加して Upload 後に Analysis を作成。
- Recommendation: `A`。Approved PDF Flow を保ちつつ、Status の意味と遷移を明示できます。
- Decision: User は 2026-07-24 に `DRAFT` Status の追加と最初の Document Finalize 後の `UPLOADED` 遷移を承認しました。

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
