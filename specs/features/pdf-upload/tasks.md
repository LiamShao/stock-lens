# PDF Upload Tasks

## Rules

- Task は PDF Requirement または Acceptance Criterion を参照します。
- Analysis Management Feature と `ANALYSIS-DEV-001` の承認・実装前に Production Behavior を変更しません。
- Mocked Storage Test だけでは Integration Acceptance を完了扱いにしません。

## Dependency and Planning

- [x] `PDF-TASK-001` (`PDF-FR-001`, `PDF-AC-006`) Analysis Management API と HTTP Owner Isolation を先行実装
- [x] `PDF-TASK-002` (`PDF-FR-005`, `PDF-FR-006`, `PDF-SEC-004`) Technical Plan の Endpoint、Storage、Queue Contract を承認

## Database and Storage

- [x] `PDF-TASK-003` (`PDF-FR-009`) `DocumentUpload` Status/Entity、Constraint、Index、Migration を追加
- [x] `PDF-TASK-004` (`PDF-FR-005`, `PDF-FR-006`) S3-compatible Storage Interface と MinIO/AWS Adapter を追加
- [x] `PDF-TASK-005` (`PDF-FR-008`, `PDF-FR-009`) Idempotent Object Cleanup Queue、Worker、Retry Tracking を追加

## API

- [x] `PDF-TASK-006` (`PDF-FR-001`〜`PDF-FR-006`) Upload Session Start/Presign API、Zod Validation、OpenAPI を実装
- [x] `PDF-TASK-007` (`PDF-FR-003`, `PDF-FR-004`, `PDF-FR-007`, `PDF-SEC-001`〜`PDF-SEC-005`) Streaming Finalize Validation を実装
- [ ] `PDF-TASK-008` (`PDF-FR-002`, `PDF-FR-007`, `PDF-FR-009`) Transactional Limit、Duplicate、Idempotent Finalize を実装
- [ ] `PDF-TASK-009` (`PDF-FR-008`, `PDF-SEC-006`) Document List/Delete と Cleanup Enqueue を実装
- [ ] `PDF-TASK-010` (`PDF-SEC-006`, `PDF-SEC-007`) Cross-user Not Found、Log Redaction、Untrusted Content Boundary を実装

## Verification and Documentation

- [ ] `PDF-TASK-011` (`PDF-AC-001`〜`PDF-AC-004`) Start/Validation Unit + HTTP Integration Test を追加
- [ ] `PDF-TASK-012` (`PDF-AC-005`, `PDF-AC-007`) MinIO Storage Integration Test を追加
- [ ] `PDF-TASK-013` (`PDF-AC-006`) Cross-user HTTP Authorization Test を追加
- [ ] `PDF-TASK-014` (`PDF-AC-008`) Delete/Cleanup Worker Integration Test を追加
- [ ] `PDF-TASK-015` Concurrency、Retry、Repeated Finalize、Orphan Expiry Test を追加
- [ ] `PDF-TASK-016` API、Database、Security、Architecture、Environment Documentation を更新
- [ ] `PDF-TASK-017` Lint、Typecheck、Unit/Integration Test、Build、Verification、Traceability を完了
