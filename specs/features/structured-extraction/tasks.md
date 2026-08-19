# Structured Extraction Tasks

## Rules

- Task は Requirement ID または Acceptance Criterion ID を参照します。
- 完了は Code 作成ではなく Verification Evidence までを含みます。
- OpenAI Live Evidence がない場合、Production Adapter Verification は `Partial` とします。

## Tasks

- [x] `EXTRACT-TASK-001` (`EXTRACT-Q-001`〜`EXTRACT-Q-007`) Approval、Spec、Technical Plan、Tasks、Deviation Resolution
- [x] `EXTRACT-TASK-002` (`EXTRACT-FR-002`, `EXTRACT-FR-005`, `EXTRACT-SEC-005`〜`EXTRACT-SEC-007`) Shared Strict Structured Output / Compliance / Budget Contract
- [x] `EXTRACT-TASK-003` (`EXTRACT-FR-001`, `EXTRACT-FR-012`, `EXTRACT-SEC-001`, `EXTRACT-SEC-008`) Handoff Status、Owner-consistent Schema/Migration、Shared Status Contract
- [x] `EXTRACT-TASK-004` (`EXTRACT-FR-004`, `EXTRACT-FR-013`) Git Prompt Asset、Explicit Activation CLI、PromptVersion/AiUsage Audit
- [x] `EXTRACT-TASK-005` (`EXTRACT-FR-006`, `EXTRACT-AC-006`, `EXTRACT-AC-007`) Deterministic P0 Financial Metric Parser/Calculator/Fixture
- [x] `EXTRACT-TASK-006` (`EXTRACT-FR-002`〜`EXTRACT-FR-004`, `EXTRACT-FR-010`, `EXTRACT-FR-011`) Provider Interface、Deterministic Provider、OpenAI Responses Structured Output Adapter
- [x] `EXTRACT-TASK-007` (`EXTRACT-FR-003`, `EXTRACT-FR-005`, `EXTRACT-SEC-002`, `EXTRACT-SEC-003`, `EXTRACT-SEC-007`) Bounded Map/Merge、Untrusted Context、Prompt Injection Evaluation
- [x] `EXTRACT-TASK-008` (`EXTRACT-FR-007`〜`EXTRACT-FR-010`, `EXTRACT-SEC-001`, `EXTRACT-SEC-006`, `EXTRACT-SEC-008`) Evidence/Compliance Validator と Atomic Finding/Evidence Publish
- [x] `EXTRACT-TASK-009` (`EXTRACT-FR-001`, `EXTRACT-FR-009`〜`EXTRACT-FR-012`) Durable Metric/Extract/Validate Queue、Retry/Repair、Idempotent Handoff
- [x] `EXTRACT-TASK-010` (`EXTRACT-AC-001`〜`EXTRACT-AC-014`) Unit、PostgreSQL/Redis/BullMQ Integration、Security、Race Tests
- [ ] `EXTRACT-TASK-011` (`EXTRACT-Q-007`) Opt-in OpenAI Live Smoke/Evaluation Harness と Honest Partial/Passed Reporting
- [ ] `EXTRACT-TASK-012` Documentation、Verification、Traceability、Deviation Audit、Full Quality Gate
