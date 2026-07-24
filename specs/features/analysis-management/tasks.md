# Analysis Management Tasks

## Rules

- Task は Analysis Requirement または Acceptance Criterion を参照します。
- Controller は HTTP/OpenAPI、Service は Business Logic、Repository は Data Access に限定します。
- Verification Evidence と Traceability 更新まで完了扱いにしません。

## Tasks

- [x] `ANALYSIS-TASK-001` (`ANALYSIS-FR-002`) `DRAFT` Enum/Default Migration と Prisma Client 更新
- [x] `ANALYSIS-TASK-002` (`ANALYSIS-FR-001`〜`ANALYSIS-FR-006`, `ANALYSIS-SEC-005`) Shared Zod Contract を追加
- [x] `ANALYSIS-TASK-003` (`ANALYSIS-FR-001`〜`ANALYSIS-FR-007`, `ANALYSIS-SEC-004`) Analysis Repository を拡張
- [x] `ANALYSIS-TASK-004` (`ANALYSIS-FR-001`〜`ANALYSIS-FR-008`) Analysis Service と Stable Error を実装
- [x] `ANALYSIS-TASK-005` (`ANALYSIS-SEC-001`〜`ANALYSIS-SEC-007`) Controller、Bearer Guard、OpenAPI を実装
- [x] `ANALYSIS-TASK-006` (`ANALYSIS-AC-001`〜`ANALYSIS-AC-008`) Unit/Controller Test を追加
- [x] `ANALYSIS-TASK-007` (`ANALYSIS-AC-001`〜`ANALYSIS-AC-011`, `OWN-AC-007`) Testcontainers HTTP Integration Test を追加
- [x] `ANALYSIS-TASK-008` (`ANALYSIS-AC-009`) Transactional Document Soft Delete Regression Test を維持
- [x] `ANALYSIS-TASK-009` API、Database、Architecture、Agent Status Machine Documentation を更新
- [x] `ANALYSIS-TASK-010` Lint、Typecheck、Unit/Integration Test、Build を実行
- [x] `ANALYSIS-TASK-011` Verification、Traceability、Deviation、Progress を更新
