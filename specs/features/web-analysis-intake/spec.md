# Web Analysis Intake Specification

## Metadata

| Field                 | Value         |
| --------------------- | ------------- |
| Spec status           | `Draft`       |
| Implementation status | `Not started` |
| Verification status   | `Not started` |
| Owner                 | `TBD`         |
| Last updated          | `2026-09-02`  |

## Goal

初めて利用する User が Browser だけで Account Registration、Analysis Draft 作成、最大 3 件の Public IR PDF Upload、Document 確認・削除、明示的な Processing Start を完了し、既存 Analysis Detail の Status と三 View へ遷移できる P0 User Journey を提供します。

既存 Authentication、Analysis Management、PDF Upload、Document Processing、Analysis Views の Owner-scoped API Contract を再利用し、Backend API、Database Schema、Object Storage Policy、AI Generation Policy は変更しません。

## Non-goals

- Company Master の作成・検索・編集 UI
- Upload と同時の Analysis 暗黙作成
- OCR、Browser-side PDF Text Extraction、Preview、編集、注釈
- Provider Call の自動開始、Live Provider Evaluation
- Processing 中の Document 追加・削除または Analysis 再設定
- Admin Job UI、Operator Secret の Browser 配布
- Ask This Company、Embedding、Hybrid Retrieval、RAG
- Anonymous Upload、Social/Community、Investment Advice

## Actors and Preconditions

- Unauthenticated Visitor は Registration または Login から開始します。
- Authenticated User の Access Token は Browser Memory だけに保持し、既存 HttpOnly Refresh Cookie で Session を回復します。
- API、Private Object Storage、既存 Presigned Upload/Finalize/Document/Process Endpoint が利用可能です。
- Analysis は Upload 前に Owner-scoped `DRAFT` として明示的に作成します。
- Browser が送る File Metadata と SHA-256 は Hint であり、Finalize 時の Trusted Server-side Streaming Validation を置き換えません。

## Functional Requirements

| ID              | Requirement                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INTAKE-FR-001` | Visitor は Email、12〜128 文字 Password、Optional Display Name を Shared Strict Schema で検証し、既存 Registration API から Session を確立できる                                |
| `INTAKE-FR-002` | Authenticated User は Trim 後 1〜120 文字の Title で Owner-scoped `DRAFT` Analysis を作成し、Company API がない間 `companyId: null` を明示できる                                |
| `INTAKE-FR-003` | Browser は選択時に最大 3 Files、1〜20 MB、case-insensitive `.pdf`、exact `application/pdf`、先頭 `%PDF-` を検証し、不正 File は Upload Session 作成前に拒否する                 |
| `INTAKE-FR-004` | Browser は各 File の lowercase SHA-256 を Web Crypto で計算し、既存 Start API → constrained Presigned PUT → Finalize API の順で Upload する                                     |
| `INTAKE-FR-005` | 最大 3 Files は File ごとに hashing、starting、uploading、finalizing、completed、failed を表示し、成功済み File を失わず Failed File だけを明示 Retry できる                    |
| `INTAKE-FR-006` | Reload 後は既存 Document List API から Finalized Document を復元し、Original Name、Document Type、Size、Uploaded Time を表示し、Processing 開始前は Owner が削除できる          |
| `INTAKE-FR-007` | 1 件以上の Finalized Document があり、全 Client Upload Operation が Terminal の場合だけ、User の明示操作で既存 Process API を一度呼び、Accepted 後は Analysis Detail へ遷移する |
| `INTAKE-FR-008` | Registration、Create、Hash、Upload、Finalize、Delete、Process の各 Failure を Content-free Stable Japanese Message と File/Step 単位の Retry/Recovery Action で表示する         |
| `INTAKE-FR-009` | User は未処理の DRAFT/UPLOADED Analysis を明示的に削除でき、成功後は History へ戻る。Page 離脱だけでは Analysis、Completed Document、Upload Session を Client が暗黙削除しない  |
| `INTAKE-FR-010` | Flow は Keyboard、Visible Focus、Semantic Label/Progress/Status、Mobile Layout、Reduced Motion に対応し、同一情報を Color だけで表現しない                                      |
| `INTAKE-FR-011` | Browser Reload、Access Token Expiry、Concurrent 401 は既存 Memory-only Session/Single-flight Refresh Contract で一回だけ回復し、失敗時は Login へ戻る                           |
| `INTAKE-FR-012` | History Empty State と Authenticated Navigation は新規作成 Flow への明確な入口を持ち、完成済み Analysis の既存 Detail/View Flow を変更しない                                    |

## Security and Compliance Requirements

| ID               | Requirement                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INTAKE-SEC-001` | Analysis、Upload Session、Document、Process の Request は Authenticated Owner の Bearer Access Token を API Origin にだけ送り、`ownerId` を Client Input に含めない       |
| `INTAKE-SEC-002` | Presigned URL は Component State、TanStack Query Cache、Browser Storage、DOM、URL、Log、Analytics に保存せず、一回の Object Storage PUT にだけ使用する                    |
| `INTAKE-SEC-003` | Object Storage PUT は API Bearer/Cookie を送らず、Server が返した Method/Headers だけを使用し、Redirect を許可しない                                                      |
| `INTAKE-SEC-004` | Client Validation は UX Boundary とし、Trusted Extension/MIME/Header/Size/SHA-256/Owner Validation は既存 API/Finalize Contract を常に必須とする                          |
| `INTAKE-SEC-005` | Browser は PDF Text、Embedded JavaScript、Link、Attachment、Form、Metadata を解析・実行せず、Header と SHA-256 に必要な Raw Bytes だけを読む                              |
| `INTAKE-SEC-006` | Password、Token、Full PDF Bytes/Text、SHA-256、Presigned URL、Storage Coordinate、Raw Provider/Storage Error を Log、Error UI、Telemetry に含めない                       |
| `INTAKE-SEC-007` | Registration、Create、Upload、Delete、Process は既存 Rate Limit、Unified API Error、Cross-owner `404` Boundary を維持し、Client は Resource 存在差を補足表示しない        |
| `INTAKE-SEC-008` | Processing は Provider Cost/External Side Effect を伴い得るため User の明示 Click と確認可能な Document Summary を必須とし、Page Load、Finalize、Retry から自動開始しない |
| `INTAKE-SEC-009` | UI は Upload Document と Analysis Result を Public IR Research として扱い、Investment Advice、Recommendation、Target Price、Prediction を追加しない                       |

## API and Data Contract

本 Feature は既存 API だけを使用し、新しい Endpoint、Database Migration、Storage Operation を追加しません。Base Path は `/api` です。

| Step                   | Existing Contract                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Registration           | `POST /auth/register` → `201 AuthResponse` + rotated HttpOnly Refresh Cookie          |
| Analysis Create        | `POST /analyses` with `{ title, companyId: null }` → `201 AnalysisResource`           |
| Upload Start           | `POST /analyses/:analysisId/document-uploads` → Session + constrained Presigned PUT   |
| Upload URL Reissue     | `POST /analyses/:analysisId/document-uploads/:uploadId/presign`                       |
| Upload Finalize        | `POST /analyses/:analysisId/document-uploads/:uploadId/finalize` → Finalized Document |
| Document List/Delete   | `GET /analyses/:analysisId/documents`; `DELETE .../documents/:documentId`             |
| Processing Start       | `POST /analyses/:analysisId/process` → `202 ProcessAnalysisResponse`                  |
| Analysis Delete        | `DELETE /analyses/:analysisId` → `204`                                                |
| Status/View Navigation | Existing `GET /analyses/:analysisId` and completed-only View API                      |

Client File State は Memory-only UI State であり、Server Truth ではありません。`File` Object、Raw Bytes、SHA-256、Presigned URL は Query Cache または Persistent Storage に入れません。Reload 後に Incomplete Local File Upload を自動再開せず、Finalized Document だけを Server から復元します。

## Error and Edge Cases

| Case                                                    | Expected behavior                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Email Duplicate / Invalid Registration                  | Stable Japanese Error、Password を Clear、Session を作らない                                       |
| Analysis Create Failure                                 | Upload UI へ進まず、二重 Submit を抑止して Retry 可能にする                                        |
| 4 Files、0 byte、20 MB 超、Extension/MIME/Header 不一致 | Start API 前に File 単位で拒否し、選択済み Valid File は維持する                                   |
| SHA-256 Browser Failure                                 | URL を要求せず File を Failed とし、再選択/Retry を案内する                                        |
| Presigned URL Expired before PUT                        | Active Session に対して一回の明示 Retry で Re-presign し、同じ File Metadata/Hash を再検証する     |
| Partial Multi-file Success                              | Completed File を維持し、Failed File だけ Retry/除外できる。Processing は User が明示決定する      |
| Finalize rejects Header/SHA/Size/Duplicate              | Raw Detail を表示せず Stable Error、Server Cleanup に委ね、Completed と表示しない                  |
| Reload during incomplete Upload                         | Presigned URL/File Bytes を復元しない。Finalized Document List と Analysis Status だけを再取得する |
| Process double click / repeated response                | Client Mutation を single-flight にし、既存 Server Idempotency Contract に収束させる               |
| Process accepted                                        | Analysis Detail へ遷移し、既存 bounded polling を使用する                                          |
| Cross-owner/Missing Analysis/Document                   | 同じ Not Found 表示、History へ安全に戻れる                                                        |
| Delete during local Upload                              | Active Request を Abort 後に明示 Delete。Server-side Orphan Cleanup Contract を維持する            |

## Acceptance Criteria

| ID              | Given / When / Then                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INTAKE-AC-001` | Given New Visitor、When Valid Registration、Then Refresh Cookie と Memory Access Token で Authenticated Flow へ進み、Token/Password を Storage に保存しない                |
| `INTAKE-AC-002` | Given Authenticated User、When Valid Title で Create、Then `companyId: null` の Owner-scoped `DRAFT` を作成し Intake Route へ進む                                          |
| `INTAKE-AC-003` | Given Invalid Count/Size/Extension/MIME/Header、When File Selection、Then Upload Session/Object Side Effect 前に拒否する                                                   |
| `INTAKE-AC-004` | Given 1〜3 Valid PDFs、When Upload、Then Web Crypto Hash、Start、Presigned PUT、Finalize が成功し、Server Document List と一致する                                         |
| `INTAKE-AC-005` | Given 1 Success / 1 Failure、When Retry、Then成功済み Document を再送せず Failed File だけ Completion に収束する                                                           |
| `INTAKE-AC-006` | Given Reload、When Intake Detail を再表示、Then Finalized Document を復元し、Incomplete Presigned URL/File Bytes/Token を復元しない                                        |
| `INTAKE-AC-007` | Given Owner A Document、When Delete、Then List から消え、Owner B の同じ Request は `404` で Side Effect を持たない                                                         |
| `INTAKE-AC-008` | Given 1 件以上の Finalized Document、When User が明示的に Start、Then Process API は一度だけ `202` となり既存 Detail Polling へ遷移する                                    |
| `INTAKE-AC-009` | Given Finalize/Page Load/Retry、When User が Start を押していない、Then Process API と Provider Pipeline を自動開始しない                                                  |
| `INTAKE-AC-010` | Given Expired URL、401、Storage/API Failure、When Recovery、Then bounded Re-presign/Refresh/Retry を行い Password/Token/URL/Coordinate/Raw PDF Detail を UI/Log に出さない |
| `INTAKE-AC-011` | Given Keyboard と Mobile Viewport、When Registration/Create/Upload/Delete/Start、Then Label、Focus、Status、Progress、Confirmation を操作できる                            |
| `INTAKE-AC-012` | Given Isolated Full Stack、When Register → Create → 3-page PDF Upload → Finalize → Process → Completed、Then三 View と Real Evidence PDF Page まで Browser で到達できる    |
| `INTAKE-AC-013` | Given Owner B、When Owner A Analysis の Upload/List/Delete/Process を直接要求、Thenすべて同じ `404` Boundary で Data/Log を漏らさない                                      |
| `INTAKE-AC-014` | Given Draft/Uploaded Analysis、When Explicit Delete、Then Active Request を Abort し、Server Cleanup を追跡可能なまま History へ戻る                                       |

## Open Questions

| ID             | Question                                                      | Impact                         | Status |
| -------------- | ------------------------------------------------------------- | ------------------------------ | ------ |
| `INTAKE-Q-001` | Intake を一つの Wizard Route にするか、独立 Page に分割するか | UX / Routing / Recovery        | `Open` |
| `INTAKE-Q-002` | Registration 成功後に自動 Login/Redirect するか               | Auth / Session / UX            | `Open` |
| `INTAKE-Q-003` | Company Selection を今回含めるか                              | Scope / API / Data             | `Open` |
| `INTAKE-Q-004` | 2〜3 Files を Sequential または bounded parallel にするか     | UX / Object Storage / Recovery | `Open` |
| `INTAKE-Q-005` | Browser SHA-256 と early `%PDF-` check を必須にするか         | Security / Performance         | `Open` |
| `INTAKE-Q-006` | Finalize 後に Processing を自動開始するか                     | Cost / Side effect / UX        | `Open` |
| `INTAKE-Q-007` | Abandoned Draft を暗黙削除するか明示削除だけにするか          | Data integrity / Recovery      | `Open` |
| `INTAKE-Q-008` | Browser E2E の Provider Boundary                              | Verification / Cost / CI       | `Open` |

## Dependencies

- Approved/Implemented Authentication Specification
- Approved/Verified Analysis Management Specification
- Approved/Implemented PDF Upload Specification
- Approved/Implemented Document Processing Specification
- Approved/Implemented Analysis Views Specification
- Existing `@stocklens/shared` Strict Request/Response Schemas
- Existing Memory-only Web Session and TanStack Query Foundation
- Private S3-compatible Object Storage / MinIO Test Environment
- `docs/api-conventions.md`, `docs/security.md`, `docs/testing-strategy.md`
