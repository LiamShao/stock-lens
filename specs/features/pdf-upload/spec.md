# PDF Upload Specification

## Metadata

| Field                 | Value                 |
| --------------------- | --------------------- |
| Spec status           | `Approved`            |
| Implementation status | `Implementing`        |
| Verification status   | `Partial`             |
| Approval              | `Approved 2026-07-24` |
| Last updated          | `2026-08-10`          |

## Goal

Authenticated User が最大 3 件の Public IR PDF を自分の Analysis に安全に Upload し、Private Object Storage と Document Metadata に保存できるようにします。

## Non-goals

- OCR
- PDF Text Extraction と Chunking
- Anonymous Upload
- 20 MB を超える File
- PDF 以外の Attachment
- Public Bucket または長期 Presigned URL

## Actors and Preconditions

- User は有効な Bearer Access Token で認証済みです。
- Analysis Resource API と MinIO/S3 Private Bucket が利用可能です。Analysis Resource API は `PDF-Q-007` の決定により独立 Feature として先行実装します。
- `ownerId` は Authenticated User から導出し、Request Body では受け取りません。

## Functional Requirements

| ID           | Requirement                                                                            |
| ------------ | -------------------------------------------------------------------------------------- |
| `PDF-FR-001` | User は自分の Analysis に対してのみ Upload を開始できる                                |
| `PDF-FR-002` | 1 Analysis あたり Active Document は最大 3 件とする                                    |
| `PDF-FR-003` | 1 File の Size は 1 byte 以上 20 MB 以下とする                                         |
| `PDF-FR-004` | Original Filename、Declared MIME、File Header の三つで PDF を検証する                  |
| `PDF-FR-005` | Object は Private Bucket と User/Analysis に衝突しない Storage Key に保存する          |
| `PDF-FR-006` | Presigned URL は Short-lived とし、Database に URL 自体を保存しない                    |
| `PDF-FR-007` | Upload 完了後に Size、SHA-256、Storage Metadata を検証して `uploadedAt` を設定する     |
| `PDF-FR-008` | File Delete は Metadata を Soft Delete し、Object Delete を安全に実行または Queue する |
| `PDF-FR-009` | Upload/Validation/Storage Failure を Stable Error と Status で追跡できる               |

## Security Requirements

| ID            | Requirement                                                                            |
| ------------- | -------------------------------------------------------------------------------------- |
| `PDF-SEC-001` | Extension は case-insensitive `.pdf` だけを許可する                                    |
| `PDF-SEC-002` | Declared MIME は `application/pdf` だけを許可する                                      |
| `PDF-SEC-003` | Object の先頭 Byte が `%PDF-` で始まることを Trusted Server-side Code で検証する       |
| `PDF-SEC-004` | Presigned Operation は Bucket、Key、Content Length/Type、Expiry を必要最小限に制限する |
| `PDF-SEC-005` | Filename を Storage Key として直接使用せず、Log に Full Object Content を記録しない    |
| `PDF-SEC-006` | Cross-user Analysis/Document は Not Found と同等に扱う                                 |
| `PDF-SEC-007` | Uploaded PDF Content を Instruction として扱わない                                     |

## Approved Upload Flow

User は 2026-07-24 に次の Two-step Flow を承認しました。具体的な Endpoint Path と Schema は Technical Plan で確定します。

1. Authenticated Client が Filename、MIME、Size、SHA-256 を送信して Upload Session と Short-lived Presigned URL を取得します。
2. Client が Object Storage に直接 PUT します。
3. Client が Completion API を呼び、Server が Object Metadata、File Header、Size、SHA-256 を検証して Document を Finalize します。

Analysis の作成・履歴・取得・削除は独立した Analysis Management Feature とし、PDF Upload より先に Approved/Implemented します。Document の Upload、Finalize、List、Delete と Object Cleanup は本 Feature の Scope とします。

## Error and Edge Cases

| Case                                      | Expected behavior                                   |
| ----------------------------------------- | --------------------------------------------------- |
| 4 件目の Active Document                  | Stable Limit Error、URL/Document を作成しない       |
| `.pdf` だが MIME 不一致                   | Validation Error                                    |
| Extension/MIME は PDF だが Header 不一致  | Object を無効化・削除し Document を Finalize しない |
| Presigned URL Expired                     | 新しい Intent/URL を安全に再発行できる              |
| Completion 未実行                         | TTL 後に Orphan Cleanup 対象とする                  |
| Cross-user Analysis ID                    | Not Found 相当                                      |
| 同一 Analysis の Active Duplicate SHA-256 | Stable Duplicate Error とし Finalize しない         |

## Approved Decisions

User は 2026-07-24 に以下を承認しました。

1. API Process を通して File 本体を Proxy せず、Direct Presigned Upload + Finalize を採用します。
2. Incomplete/Invalid Object を `Document` として扱わないため、明示的な Lifecycle を持つ `DocumentUpload` Session Entity を追加します。Session は少なくとも `PENDING`、`VALIDATING`、`COMPLETED`、`REJECTED`、`EXPIRED` を区別し、Completed Session から Finalized `Document` を一意に追跡します。
3. Client SHA-256 と Object Storage Metadata は Hint とし、Finalize 時に Trusted Server-side Code が Object を Streaming Read して SHA-256、Size、`%PDF-` Header を再検証します。
4. 同一 User/Analysis 内の Active Duplicate SHA-256 は Finalize せず Stable Error で拒否します。同じ File の別 Analysis への Upload は許可し、User/Analysis 間で Object を共有しません。
5. Presigned URL TTL は 5 分、未 Finalize Object/Session の Expiry は 24 時間とし、Retry 可能な Cleanup Job で削除します。
6. Analysis は Upload Intent より前に Owner が作成します。Finalize 時の暗黙作成は行いません。
7. Analysis Management を独立 Feature として先に Spec/Implement し、Analysis 作成・履歴・取得・削除と HTTP Owner Isolation を検証します。Document Storage Lifecycle は PDF Upload Feature に残します。

## Acceptance Criteria

| ID           | Given / When / Then                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `PDF-AC-001` | Given Owner の Analysis と有効な PDF Metadata、When Upload Start、Then制限付き Short-lived URL を返す |
| `PDF-AC-002` | Given 4 件目、When Upload Start、Then Document/Object Intent を作成せず拒否する                       |
| `PDF-AC-003` | Given Size 0 または 20 MB 超、When Upload Start、Then拒否する                                         |
| `PDF-AC-004` | Given不正 Extension/MIME、When Upload Start、Then拒否する                                             |
| `PDF-AC-005` | Given不正 `%PDF-` Header、When Finalize、Then `uploadedAt` を設定せず Object Cleanup を行う           |
| `PDF-AC-006` | Given Owner B、When Owner A の Analysis に Upload、Then Not Found 相当で何も作成しない                |
| `PDF-AC-007` | Given有効 Object、When Finalize、Then Trusted Metadata/SHA-256 を保存し Upload 完了にする             |
| `PDF-AC-008` | Given Active Document、When Owner が Delete、Then Query から消え Object Cleanup が追跡可能になる      |

## Open Questions

| ID          | Question                                                                                 | Impact                | Status                                          |
| ----------- | ---------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------- |
| `PDF-Q-001` | Direct Presigned Upload + Post-upload Validation を採用するか、API Proxy Upload にするか | Architecture/Security | `Resolved` — Presigned Two-step                 |
| `PDF-Q-002` | Upload Intent 用に Document Status / Upload Session Entity を追加するか                  | Database/Status       | `Resolved` — Dedicated `DocumentUpload` Session |
| `PDF-Q-003` | SHA-256 は Client Claim を Server が Streaming 再計算するか、S3 Checksum を信頼するか    | Integrity/Cost        | `Resolved` — Server-side Streaming Verification |
| `PDF-Q-004` | 同一 User/Analysis の Duplicate SHA-256 を拒否、再利用、許可のどれにするか               | Product/Data          | `Resolved` — Active Duplicate を拒否            |
| `PDF-Q-005` | Presigned URL と Orphan Object の TTL/Cleanup Timing                                     | Operation/Cost        | `Resolved` — URL 5 min、Orphan 24 h             |
| `PDF-Q-006` | Analysis は Upload Intent 前に作成するか、Finalize 時に作成するか                        | API/Status Machine    | `Resolved` — Intent 前に明示的作成              |
| `PDF-Q-007` | Analysis Management API を独立 Feature として先行実装するか、本 Feature に含めるか       | Scope/Sequence        | `Resolved` — 独立 Feature として先行実装        |

## Dependencies

- Authentication Specification
- Owner-scoped Data Access Specification
- Analysis Management Specification (`PDF-Q-007` の承認後に作成)
- MinIO / AWS S3 Adapter
- `docs/security.md`, `docs/database-design.md`

Analysis Management Feature の API Contract を承認後、本 Feature の Technical Plan と Tasks を作成します。
