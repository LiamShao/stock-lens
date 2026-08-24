# Analysis Views Tasks

## Rules

- Task は Requirement ID または Acceptance Criterion ID を参照します。
- 完了は Code 作成ではなく Verification Evidence までを含みます。
- OpenAI Live Passed Artifact がない場合、Production Provider Verification は `Partial` とします。
- Mocked PDF Viewer だけでは Page Navigation を `Passed` としません。

## Tasks

- [x] `VIEW-TASK-001` (`VIEW-Q-001`〜`VIEW-Q-007`) Approval、Spec、Technical Plan、Tasks、Deviation Resolution
- [x] `VIEW-TASK-002` (`VIEW-FR-003`〜`VIEW-FR-008`, `VIEW-SEC-003`〜`VIEW-SEC-005`, `VIEW-SEC-009`) Shared Strict Three-view Output、Budget、Citation、Compliance Contract
- [ ] `VIEW-TASK-003` (`VIEW-FR-002`, `VIEW-FR-006`〜`VIEW-FR-008`, `VIEW-FR-017`, `VIEW-SEC-002`, `VIEW-SEC-006`) Versioned Prompt、Bounded Untrusted Context、One-call Orchestrator、Usage Audit
- [ ] `VIEW-TASK-004` (`VIEW-FR-007`〜`VIEW-FR-011`, `VIEW-SEC-001`, `VIEW-SEC-010`) Owner-scoped Citation Validator、Atomic JSONB Publish、Completion/Input Race
- [ ] `VIEW-TASK-005` (`VIEW-FR-001`, `VIEW-FR-009`〜`VIEW-FR-011`, `VIEW-SEC-009`) Durable `GENERATE_VIEWS` Queue、Repair/Retry、Pending Recovery、Manual Re-run
- [ ] `VIEW-TASK-006` (`VIEW-FR-012`, `VIEW-SEC-001`, `VIEW-SEC-003`) Completed-only Aggregate Read API、Shared Projection、OpenAPI、Owner A/B Integration
- [ ] `VIEW-TASK-007` (`VIEW-FR-015`, `VIEW-SEC-001`, `VIEW-SEC-006`, `VIEW-SEC-007`) Read-only Presign Adapter/API、Expiry、Missing/Provider Failure、Redaction Integration
- [ ] `VIEW-TASK-008` (`VIEW-FR-016`, `VIEW-SEC-008`, `VIEW-AC-014`) Web API Client、In-memory Session、Login/Refresh/Logout、History/Detail Shell
- [ ] `VIEW-TASK-009` (`VIEW-FR-013`, `VIEW-FR-014`, `VIEW-AC-010`〜`VIEW-AC-012`) View Tabs、Status Polling、Responsive/Accessible Evidence Drawer
- [ ] `VIEW-TASK-010` (`VIEW-FR-015`, `VIEW-SEC-007`, `VIEW-AC-013`, `VIEW-AC-016`) PDF.js Embedded Viewer、Page Navigation、Untrusted PDF Action Boundary
- [ ] `VIEW-TASK-011` (`VIEW-AC-001`〜`VIEW-AC-016`) Full PostgreSQL/Redis/BullMQ/Storage/API/Web/E2E/Security Matrix と Opt-in Live Harness
- [ ] `VIEW-TASK-012` Documentation、Verification、Traceability、Deviation Audit、Full Quality Gate
