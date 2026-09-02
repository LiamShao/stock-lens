# Requirement Traceability Matrix

Status は Requirement の実装・検証状況を表します。`Partial` は Code が存在しても Acceptance Evidence が不足する状態です。

## Authentication

| Requirement    | Implementation                                             | Verification                           | Status   |
| -------------- | ---------------------------------------------------------- | -------------------------------------- | -------- |
| `AUTH-FR-001`  | `AuthService.register`, atomic User/Token Repository       | Register HTTP + PostgreSQL             | `Passed` |
| `AUTH-FR-002`  | `AuthService.login`, atomic Token/Audit Repository         | Login HTTP + DB Audit                  | `Passed` |
| `AUTH-FR-003`  | `AuthService.refresh`, `AuthRepository.rotateRefreshToken` | Rotation HTTP Integration              | `Passed` |
| `AUTH-FR-004`  | `AuthService.refresh/revokeFamily`                         | Reuse/Family Revoke HTTP Integration   | `Passed` |
| `AUTH-FR-005`  | `AuthService.logout`, `AuthController.logout`              | Logout HTTP + DB Revoke                | `Passed` |
| `AUTH-FR-006`  | `AccessTokenGuard`, `AuthService.authenticate`             | `/me` Active/Deleted User HTTP         | `Passed` |
| `AUTH-SEC-001` | Shared Zod Schema, `PasswordHasher`                        | Validation + Argon2id DB/Test          | `Passed` |
| `AUTH-SEC-002` | Common Error + Fixed Dummy Argon2id Verify                 | Unknown/Wrong HTTP + Dummy Verify Unit | `Passed` |
| `AUTH-SEC-003` | `TokenService` HS256 Sign/Verify Allowlist                 | HS256 + HS384 Reject Unit Test         | `Passed` |
| `AUTH-SEC-004` | Random Refresh Secret, Hash-only Schema                    | Rotation HTTP + Token Unit Test        | `Passed` |
| `AUTH-SEC-005` | Protected Refresh Cookie                                   | Local/Production Cookie Tests          | `Passed` |
| `AUTH-SEC-006` | Database-backed Active User Check                          | Deleted User HTTP Integration          | `Passed` |
| `AUTH-SEC-007` | Exact-origin Credential CORS                               | Allow/Reject HTTP Integration          | `Passed` |
| `AUTH-SEC-008` | Fastify Global/Route Rate Limit                            | Unified `429` HTTP Integration         | `Passed` |
| `AUTH-SEC-009` | Pino Redaction + Sanitized Error Boundary                  | Emitted JSON Log Regression Test       | `Passed` |

## Demo User

| Requirement    | Implementation                                     | Verification                          | Status   |
| -------------- | -------------------------------------------------- | ------------------------------------- | -------- |
| `DEMO-FR-001`  | `getDemoUserConfig`                                | Config/Production Guard Tests         | `Passed` |
| `DEMO-FR-002`  | Provisioner Create + `P2002` Convergence           | Unit + Testcontainers Create          | `Passed` |
| `DEMO-FR-003`  | No-op Branch                                       | Unit + Testcontainers `unchanged`     | `Passed` |
| `DEMO-FR-004`  | Conditional Update + Transactional Session Revoke  | Unit + Password Rotation Integration  | `Passed` |
| `DEMO-FR-005`  | `provision-demo-user.ts` Structured Projection     | Entrypoint Review + Error Mapper Test | `Passed` |
| `DEMO-SEC-001` | Shared `PasswordHasher`                            | Argon2id Integration                  | `Passed` |
| `DEMO-SEC-002` | `DemoUserConflictError`                            | Unit Test                             | `Passed` |
| `DEMO-SEC-003` | `DeletedDemoUserError`                             | Unit Test                             | `Passed` |
| `DEMO-SEC-004` | Stable Sanitized Error Mapper                      | Known/Unknown Error Unit Test         | `Passed` |
| `DEMO-SEC-005` | Separate CLI Entry Point                           | Code/Module Review                    | `Passed` |
| `DEMO-SEC-006` | Explicit Production Allow + Default Password Guard | Config Unit Test                      | `Passed` |
| `DEMO-SEC-007` | Password Update/Active Refresh Revoke Transaction  | Unit + Testcontainers Integration     | `Passed` |

## Owner-scoped Data Access

| Requirement   | Implementation                                   | Verification                           | Status   |
| ------------- | ------------------------------------------------ | -------------------------------------- | -------- |
| `OWN-FR-001`  | `AnalysisRepository` + Serializable Retry        | Testcontainers PostgreSQL              | `Passed` |
| `OWN-FR-002`  | `DocumentRepository`                             | Testcontainers PostgreSQL              | `Passed` |
| `OWN-FR-003`  | Parent Check + Composite FK + Serializable Retry | Cross-owner FK + Concurrency Test      | `Passed` |
| `OWN-FR-004`  | Transactional Parent/Child Soft Delete           | Integration + Concurrent Create/Delete | `Passed` |
| `OWN-FR-005`  | `null`/`false`/Empty Contract                    | Cross-user Integration                 | `Passed` |
| `OWN-SEC-001` | Analysis/Document Controller Authenticated Owner | Bearer Owner A/B HTTP Passed           | `Passed` |
| `OWN-SEC-002` | Analysis Service + `DatabaseModule` Boundary     | Code Review + Analysis HTTP Test       | `Passed` |
| `OWN-SEC-003` | Composite Owner FK + Repository Parent Check     | Direct Cross-owner Insert Reject       | `Passed` |
| `OWN-SEC-004` | `deletedAt: null` Filters                        | Integration Test                       | `Passed` |
| `OWN-SEC-005` | Testcontainers PostgreSQL + HTTP Owner Tests     | Analysis/Document Bearer A/B Passed    | `Passed` |

## Cross-cutting Gaps

- User 承認と解消 Evidence は `specs/deviations.md` を参照してください。
- PDF Upload 以降は Code 作成前に Draft Spec を承認します。

## PDF Upload

| Requirement   | Implementation                                             | Verification                                | Status    |
| ------------- | ---------------------------------------------------------- | ------------------------------------------- | --------- |
| `PDF-FR-001`  | Owner-scoped Start Controller/Service/Repository + FK      | Bearer Owner A/B HTTP + No Side Effect      | `Passed`  |
| `PDF-FR-002`  | Serializable Start Reservation + Finalize Limit Recheck    | 4th Slot HTTP + Concurrent Reservation      | `Passed`  |
| `PDF-FR-003`  | DB/Zod Boundary + Streaming 20 MB Cutoff                   | Inclusive Unit + HTTP + Stream Cutoff       | `Passed`  |
| `PDF-FR-004`  | Filename/MIME Start Zod + Trusted `%PDF-` Finalize         | Extension/MIME HTTP + Invalid MinIO Header  | `Passed`  |
| `PDF-FR-005`  | Random Private Key + `@stocklens/object-storage`           | Unit + Isolated Private MinIO               | `Passed`  |
| `PDF-FR-006`  | Start/Re-presign API + Signed PUT max 300 seconds          | Real Presigned PUT + Signed Headers         | `Passed`  |
| `PDF-FR-007`  | Trusted Stream + Atomic Document/Upload Finalize           | Real MinIO + HTTP/PostgreSQL Finalize       | `Passed`  |
| `PDF-FR-008`  | Document List/Delete + Atomic Soft Delete/Cleanup Queue    | HTTP + PostgreSQL/Redis/BullMQ/MinIO Worker | `Passed`  |
| `PDF-FR-009`  | Finalize Lifecycle + Expiry Scan + Durable Retry Tracking  | PostgreSQL/Redis/BullMQ/MinIO Retry/Expiry  | `Passed`  |
| `PDF-SEC-001` | Case-insensitive `.pdf` Shared Zod Validation              | Schema Unit + Invalid Extension HTTP        | `Passed`  |
| `PDF-SEC-002` | Exact `application/pdf` Shared Zod Validation              | Schema Unit + Invalid MIME HTTP             | `Passed`  |
| `PDF-SEC-003` | Trusted chunk-safe `%PDF-` Check + Invalid Reject/Cleanup  | Real MinIO Invalid Header + Durable Cleanup | `Passed`  |
| `PDF-SEC-004` | Size/Type/SHA Header-constrained Signed PUT                | Real MinIO Signed PUT                       | `Passed`  |
| `PDF-SEC-005` | Random Key + Bounded Stream + PDF/Storage Log Redaction    | Real Stream + Key/Log Regression            | `Passed`  |
| `PDF-SEC-006` | Owner-scoped Start/Finalize/List/Delete Not Found Boundary | Bearer A/B HTTP + PostgreSQL No Side Effect | `Passed`  |
| `PDF-SEC-007` | Typed/Escaped Untrusted PDF User Context Builder           | Injection Delimiter Unit、Provider planned  | `Partial` |

## Analysis Management

| Requirement        | Implementation                               | Verification                            | Status   |
| ------------------ | -------------------------------------------- | --------------------------------------- | -------- |
| `ANALYSIS-FR-001`  | Shared Schema + Service + Repository         | `ANALYSIS-AC-001`, `ANALYSIS-AC-002`    | `Passed` |
| `ANALYSIS-FR-002`  | Split `DRAFT` Enum/Default Migrations        | Empty DB Migration + `ANALYSIS-AC-001`  | `Passed` |
| `ANALYSIS-FR-003`  | Cursor Repository + List API                 | `ANALYSIS-AC-003`, `ANALYSIS-AC-004`    | `Passed` |
| `ANALYSIS-FR-004`  | Status Query Schema                          | DRAFT Filter HTTP Test                  | `Passed` |
| `ANALYSIS-FR-005`  | Owner-scoped Detail API                      | `ANALYSIS-AC-005`, `ANALYSIS-AC-006`    | `Passed` |
| `ANALYSIS-FR-006`  | Owner-scoped Rename API                      | `ANALYSIS-AC-005`, `ANALYSIS-AC-006`    | `Passed` |
| `ANALYSIS-FR-007`  | Owner-scoped Delete API + Repository         | Owner/Delete/Repeat Delete HTTP         | `Passed` |
| `ANALYSIS-FR-008`  | Transactional Analysis/Document Soft Delete  | HTTP + Repository `ANALYSIS-AC-009`     | `Passed` |
| `ANALYSIS-SEC-001` | AccessTokenGuard on Analysis Controller      | Missing Bearer HTTP Test                | `Passed` |
| `ANALYSIS-SEC-002` | CurrentUser-only Owner Input                 | Unknown Field + Cross-user HTTP Test    | `Passed` |
| `ANALYSIS-SEC-003` | Stable `ANALYSIS_NOT_FOUND`                  | Get/Patch/Delete Owner A/B HTTP Test    | `Passed` |
| `ANALYSIS-SEC-004` | Analysis Service + DatabaseModule Boundary   | Code Review + HTTP Integration          | `Passed` |
| `ANALYSIS-SEC-005` | Shared Zod Body/Path/Query Schema            | Invalid Input Matrix HTTP Test          | `Passed` |
| `ANALYSIS-SEC-006` | Metadata-only Projection                     | Response omits `ownerId` + Schema Parse | `Passed` |
| `ANALYSIS-SEC-007` | ApiException + Stable Analysis/Company Codes | HTTP Error Format Assertions            | `Passed` |

## Document Processing

| Requirement    | Implementation                          | Verification                            | Status    |
| -------------- | --------------------------------------- | --------------------------------------- | --------- |
| `PROC-FR-001`  | Process Controller/Service/Repository   | Owner/Cross-user HTTP                   | `Passed`  |
| `PROC-FR-002`  | Bounded pdfjs Page Extractor            | Unit + 3 Real IR PDFs + Worker E2E      | `Passed`  |
| `PROC-FR-003`  | Empty Page Record Contract              | Mixed empty/text Worker/DB E2E          | `Passed`  |
| `PROC-FR-004`  | Heading v1 Heuristic                    | Code/Unit Review                        | `Partial` |
| `PROC-FR-005`  | Page-bounded Character Chunker          | Chunk Unit + Page/Chunk DB E2E          | `Passed`  |
| `PROC-FR-006`  | Atomic Page/Chunk Repository            | Success/failure Worker/DB E2E           | `Passed`  |
| `PROC-FR-007`  | PARSING/CHUNKING/READY Status           | Migration + HTTP + Worker E2E           | `Passed`  |
| `PROC-FR-008`  | Versioned Idempotency Keys/Set Replace  | Repeated Start + duplicate delivery E2E | `Passed`  |
| `PROC-FR-009`  | Attempt/Failure Classification          | Non-retryable + Attempt 3 recovery E2E  | `Passed`  |
| `PROC-FR-010`  | Active Parent/Owner Recheck             | Code Review、Race Test pending          | `Partial` |
| `PROC-FR-011`  | Pending Analysis Dispatcher             | Missing Redis Job recovery E2E          | `Passed`  |
| `PROC-SEC-001` | Bearer Owner-only Process Endpoint      | Owner A/B HTTP                          | `Passed`  |
| `PROC-SEC-002` | Page/Chunk Composite FK                 | Direct cross-owner insert reject        | `Passed`  |
| `PROC-SEC-003` | Byte-only pdfjs Text Extraction         | Malformed/Valid/501-page Worker E2E     | `Passed`  |
| `PROC-SEC-004` | Explicit Parser Resource Limits         | Exact Text/Stream Unit + 501-page E2E   | `Passed`  |
| `PROC-SEC-005` | Sanitized Failure/Log Boundary          | Stable Error + emitted log redaction    | `Passed`  |
| `PROC-SEC-006` | Existing Untrusted PDF Context Boundary | Existing Regression、Phase 4 pending    | `Partial` |
| `PROC-SEC-007` | Bounded Memory Read/Destroy             | 20 MB/+1 Byte Unit + stream destroy     | `Passed`  |

## Structured Extraction

| Requirement       | Implementation                               | Verification                            | Status    |
| ----------------- | -------------------------------------------- | --------------------------------------- | --------- |
| `EXTRACT-FR-001`  | Metrics/Extract/Validate Durable Runtime     | Real PostgreSQL/Redis/BullMQ chain      | `Passed`  |
| `EXTRACT-FR-002`  | LlmProvider + Deterministic/OpenAI Adapter   | Unit + opt-in live harness; no artifact | `Partial` |
| `EXTRACT-FR-003`  | Strict Source DTO + Bounded Map/Merge        | Order/full coverage/budget Unit         | `Partial` |
| `EXTRACT-FR-004`  | Bound Prompt + Audited Provider Runtime      | CLI DB + runtime usage PostgreSQL       | `Passed`  |
| `EXTRACT-FR-005`  | Strict Finding Schema + Deterministic Dedupe | Bounds/conflicting-key Unit             | `Partial` |
| `EXTRACT-FR-006`  | Versioned Metric Schema + BigInt Parser/YoY  | Four P0/Missing/Ambiguous Fixtures      | `Passed`  |
| `EXTRACT-FR-007`  | Exact Chunk/Page Evidence Validator          | Unit + PostgreSQL lineage publish       | `Passed`  |
| `EXTRACT-FR-008`  | Supported/Insufficient Evidence Rule         | Evidence 1+/0 downgrade Unit + DB       | `Passed`  |
| `EXTRACT-FR-009`  | Atomic Runtime Set/Execution Replace         | Repeat convergence + rollback/chain DB  | `Passed`  |
| `EXTRACT-FR-010`  | Bounded Repair + Stable Failure Runtime      | Repair/exhaustion Redis/BullMQ DB E2E   | `Passed`  |
| `EXTRACT-FR-011`  | Retryable Provider + Durable Dispatcher      | Rate-limit 2nd Attempt BullMQ E2E       | `Passed`  |
| `EXTRACT-FR-012`  | Atomic VALIDATE/Handoff Runtime              | PostgreSQL chain + duplicate no-op      | `Passed`  |
| `EXTRACT-FR-013`  | Strict Content-free Usage Repository         | Usage/Owner-lineage/runtime PostgreSQL  | `Passed`  |
| `EXTRACT-SEC-001` | Owner-scoped Publish + Composite FK          | Cross-owner read/publish/FK PostgreSQL  | `Passed`  |
| `EXTRACT-SEC-002` | Escaped PDF User Context in Orchestrator     | Injection/system separation Unit        | `Passed`  |
| `EXTRACT-SEC-003` | No-tool Adapter + Injection Boundary         | Request Shape + malicious context Unit  | `Passed`  |
| `EXTRACT-SEC-004` | Sanitized Errors + Content-free Usage        | Provider Unit + runtime DB inspection   | `Passed`  |
| `EXTRACT-SEC-005` | Strict Schema/Length/Count Contract          | Provider + Invalid/oversized Unit       | `Passed`  |
| `EXTRACT-SEC-006` | Deterministic Compliance Validator           | Six Categories + pre-persist rejection  | `Passed`  |
| `EXTRACT-SEC-007` | Map/Merge/Provider Budget Ceiling            | Unit + three-call runtime ceiling       | `Passed`  |
| `EXTRACT-SEC-008` | Parent/Input/Prompt Commit Recheck           | PostgreSQL concurrent source race       | `Passed`  |

## Analysis Views

| Requirement    | Implementation                      | Verification                          | Status   |
| -------------- | ----------------------------------- | ------------------------------------- | -------- |
| `VIEW-FR-001`  | Durable fixed-identity Execution    | PostgreSQL/Redis/BullMQ recovery      | `Passed` |
| `VIEW-FR-002`  | Strict Owner-scoped Source DTO      | Unit + active lineage PostgreSQL      | `Passed` |
| `VIEW-FR-003`  | Required Just Tell Me Generation    | Contract + deterministic runtime      | `Passed` |
| `VIEW-FR-004`  | Required Analyst View Generation    | Contract + deterministic runtime      | `Passed` |
| `VIEW-FR-005`  | Required Buffett-Munger Generation  | Contract + deterministic runtime      | `Passed` |
| `VIEW-FR-006`  | Strict Three-view Root/Sections     | Unknown/order/Japanese/bounds Unit    | `Passed` |
| `VIEW-FR-007`  | Direct Owner/Finding Evidence ID    | Unit + lineage PostgreSQL             | `Passed` |
| `VIEW-FR-008`  | Missing Rule + Versioned Prompt     | Live-shaped deterministic + browser   | `Passed` |
| `VIEW-FR-009`  | Durable Atomic Three-JSONB Publish  | Queue + transaction integration       | `Passed` |
| `VIEW-FR-010`  | Bounded Repair/Retry/Failure        | Real BullMQ exhaustion + Attempt 2    | `Passed` |
| `VIEW-FR-011`  | Atomic Completion Status/Time       | PostgreSQL replacement/duplicate      | `Passed` |
| `VIEW-FR-012`  | Completed Aggregate API + Schema    | Owner A/B PostgreSQL HTTP + Unit      | `Passed` |
| `VIEW-FR-013`  | Three-view UI + bounded Polling     | RTL tabs/missing/compliance/status    | `Passed` |
| `VIEW-FR-014`  | Responsive modal Evidence Drawer    | Document/page/excerpt/focus RTL       | `Passed` |
| `VIEW-FR-015`  | Owner Read Presign + PDF.js Canvas  | Real MinIO/API/Web/PDF.js browser E2E | `Passed` |
| `VIEW-FR-016`  | Memory Session/Login/History/Detail | Reload/401/Login/Logout RTL + Unit    | `Passed` |
| `VIEW-FR-017`  | Immutable Prompt + Usage Audit      | Per-call content-free PostgreSQL      | `Passed` |
| `VIEW-SEC-001` | Owner-scoped Generation/Read Query  | Worker + Owner A/B API PostgreSQL     | `Passed` |
| `VIEW-SEC-002` | Escaped Single Untrusted Block      | Injection/system separation Unit      | `Passed` |
| `VIEW-SEC-003` | Strict Zod + React Text Node Render | Schema + HTML-like source RTL         | `Passed` |
| `VIEW-SEC-004` | Shared Advice Compliance Scanner    | Six category View Unit                | `Passed` |
| `VIEW-SEC-005` | View Framework Validator            | Impersonation/endorsement Unit        | `Passed` |
| `VIEW-SEC-006` | Content-free Provider Usage         | Runtime DB allowlist inspection       | `Passed` |
| `VIEW-SEC-007` | Owner/HEAD/GetObject 300s Presign   | MinIO + operation-only browser fetch  | `Passed` |
| `VIEW-SEC-008` | Memory Token + HttpOnly Rotation    | No Storage/single-flight/replay Tests | `Passed` |
| `VIEW-SEC-009` | AI + 5s/5m Client Polling Budget    | Unit + BullMQ + Web Boundary Tests    | `Passed` |
| `VIEW-SEC-010` | Parent/Input/Prompt Commit Recheck  | PostgreSQL race matrix                | `Passed` |

## Web Analysis Intake

| Requirement      | Implementation                              | Verification                             | Status   |
| ---------------- | ------------------------------------------- | ---------------------------------------- | -------- |
| `INTAKE-FR-001`  | Register route + Session `applyAuth`        | Client Unit + Register RTL/E2E           | `Passed` |
| `INTAKE-FR-002`  | Title-only Create + ID Intake route         | Create RTL + Browser E2E                 | `Passed` |
| `INTAKE-FR-003`  | Count/size/name/MIME/header boundary        | Invalid matrix Unit/RTL                  | `Passed` |
| `INTAKE-FR-004`  | Web Crypto + Start/PUT/Finalize             | Hash Unit + Real MinIO Browser E2E       | `Passed` |
| `INTAKE-FR-005`  | Per-file bounded parallel state/retry       | Partial success/retry RTL                | `Passed` |
| `INTAKE-FR-006`  | Server document restore/delete              | Reload/delete RTL + Owner B E2E          | `Passed` |
| `INTAKE-FR-007`  | Explicit single process + detail polling    | No-auto RTL + Full BullMQ Browser E2E    | `Passed` |
| `INTAKE-FR-008`  | Stable safe errors + bounded recovery       | Re-presign/401/failure Unit + RTL        | `Passed` |
| `INTAKE-FR-009`  | Abort + explicit analysis delete            | Intake delete RTL                        | `Passed` |
| `INTAKE-FR-010`  | Semantic responsive intake controls         | RTL + 390px Chromium Journey             | `Passed` |
| `INTAKE-FR-011`  | Memory session + one 401 replay             | Storage/refresh/client Unit + E2E        | `Passed` |
| `INTAKE-FR-012`  | Header/history/login entry points           | Shell RTL + Browser journey              | `Passed` |
| `INTAKE-SEC-001` | Owner-free client input + API-only Bearer   | Request Unit + Owner B E2E               | `Passed` |
| `INTAKE-SEC-002` | Imperative ephemeral upload presign         | PUT Unit + Storage/DOM review            | `Passed` |
| `INTAKE-SEC-003` | Credential-omit/no-store/redirect-error PUT | Fetch option Unit + Real MinIO E2E       | `Passed` |
| `INTAKE-SEC-004` | Client UX checks + trusted server Finalize  | Invalid Unit + Real Finalize E2E         | `Passed` |
| `INTAKE-SEC-005` | Header/hash-only browser PDF byte handling  | PDF boundary Unit + code review          | `Passed` |
| `INTAKE-SEC-006` | Content-free UI/session/storage boundary    | Storage Unit + E2E log/DOM assertions    | `Passed` |
| `INTAKE-SEC-007` | Unified error + uniform owner 404           | Safe error Unit + four-route Owner B E2E | `Passed` |
| `INTAKE-SEC-008` | Finalized summary + explicit process only   | No-auto/single-call RTL + E2E            | `Passed` |
| `INTAKE-SEC-009` | Public-research/compliance-only copy        | UI review + rendered disclaimer tests    | `Passed` |

## Job Re-run

| Requirement     | Implementation                      | Verification                            | Status    |
| --------------- | ----------------------------------- | --------------------------------------- | --------- |
| `RERUN-FR-001`  | Inspect CLI/Repository              | Real CLI Cleanup Integration            | `Passed`  |
| `RERUN-FR-002`  | FAILED → QUEUED Transaction         | Cleanup CLI + Parse DB Integration      | `Passed`  |
| `RERUN-FR-003`  | Same Execution/Audit Attempt        | Cleanup CLI → Attempt 4 Worker success  | `Passed`  |
| `RERUN-FR-004`  | Status/Target Fail-closed           | Status/allowlist/deleted DB Matrix      | `Passed`  |
| `RERUN-FR-005`  | Durable QUEUED + Dispatcher         | Missing Redis Job recovery E2E          | `Passed`  |
| `RERUN-FR-006`  | JobOperationAudit                   | CLI/DB Atomic Audit Integration         | `Passed`  |
| `RERUN-FR-007`  | Stable JSON CLI + Runbook           | Real JSON CLI + Runbook Review          | `Passed`  |
| `RERUN-SEC-001` | Enable/Secret Production Guard      | Config Unit                             | `Partial` |
| `RERUN-SEC-002` | Five-step Allowlist/ID-only Payload | Phase 4 allowlist DB + dispatch mapping | `Passed`  |
| `RERUN-SEC-003` | Sanitized CLI/Audit Projection      | Real CLI/Audit Redaction Regression     | `Passed`  |
| `RERUN-SEC-004` | Row Lock Transition/5 Limit         | Concurrent PostgreSQL + limit DB        | `Passed`  |
| `RERUN-SEC-005` | Parent/Target Revalidation          | Deleted Target + ownership DB FK        | `Passed`  |

`PDF-DEV-002` は real Cleanup CLI → Audit → Worker Attempt 4 Success、`EXTRACT-DEV-002` は Option A の Phase 4 Allowlist/Dispatch/Audit Verification により解消しました。`RERUN-SEC-001` の Workload IAM/Secrets Manager 実体は Phase 7 Deployment Evidence 待ちです。
