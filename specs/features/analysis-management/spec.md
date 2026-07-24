# Analysis Management Specification

## Metadata

| Field                 | Value                 |
| --------------------- | --------------------- |
| Spec status           | `Approved`            |
| Implementation status | `Implemented`         |
| Verification status   | `Verified`            |
| Approval              | `Approved 2026-07-24` |
| Last updated          | `2026-07-24`          |

## Goal

Authenticated User が自分の Analysis を Upload 前に作成し、History の一覧・詳細参照・名称変更・削除を安全に実行できるようにします。

## Non-goals

- PDF Upload、Finalize、Document List/Delete、Object Cleanup
- PDF Parsing、AI Pipeline、Analysis View の生成
- Company Master の作成・検索 API
- Analysis の Hard Delete
- Anonymous Access または User 間の共有

## Actors and Preconditions

- User は有効な Bearer Access Token で認証済みです。
- `ownerId` は Authenticated User から導出し、Request Body、Path、Query から受け取りません。
- Company は System-wide Reference Data です。`companyId` は省略または `null` を許可し、指定時は存在を検証します。

## Functional Requirements

| ID                | Requirement                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ANALYSIS-FR-001` | User は Trim 後 1〜120 文字の Title と Optional `companyId` で自分の Analysis を作成できる                          |
| `ANALYSIS-FR-002` | 新規 Analysis は Upload 前の状態を表す `DRAFT` で作成する                                                           |
| `ANALYSIS-FR-003` | User は自分の Active Analysis History を `createdAt DESC, id DESC` の安定順序で Cursor Pagination できる            |
| `ANALYSIS-FR-004` | History は Optional Status Filter を受け付ける                                                                      |
| `ANALYSIS-FR-005` | User は自分の Active Analysis Metadata を ID で取得できる                                                           |
| `ANALYSIS-FR-006` | User は自分の Active Analysis の Title を変更できる                                                                 |
| `ANALYSIS-FR-007` | User は自分の Active Analysis を Soft Delete でき、以後の通常 Query から除外される                                  |
| `ANALYSIS-FR-008` | Analysis Delete は所有する Active Document も Transaction 内で Soft Delete し、Object Cleanup は PDF Feature に渡す |

## Security and Compliance Requirements

| ID                 | Requirement                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `ANALYSIS-SEC-001` | 全 Endpoint に Bearer Authentication を必須とする                                                        |
| `ANALYSIS-SEC-002` | Controller は Authenticated User ID だけを Service に渡し、Client 指定の `ownerId` を受理しない          |
| `ANALYSIS-SEC-003` | Cross-user、Missing、Soft-deleted Analysis は同じ `404 ANALYSIS_NOT_FOUND` として扱う                    |
| `ANALYSIS-SEC-004` | Controller/Service は Prisma を直接呼ばず Owner-scoped Repository を使用する                             |
| `ANALYSIS-SEC-005` | Body、Path、Query は Zod で検証し、Title の Control Character と不正 UUID/Cursor/Limit/Status を拒否する |
| `ANALYSIS-SEC-006` | Response と Log に `ownerId`、Token、AI Output、Full Document Text を含めない                            |
| `ANALYSIS-SEC-007` | Error は統一 API Error Format と Sanitized Stable Code を使用する                                        |

## Approved API and Data Contract

User は 2026-07-24 に以下を承認しました。Base Path は `/api` です。

| Method   | Path                    | Request / Query                                   | Success        |
| -------- | ----------------------- | ------------------------------------------------- | -------------- |
| `POST`   | `/analyses`             | `{ "title": string, "companyId"?: UUID \| null }` | `201` Resource |
| `GET`    | `/analyses`             | `limit?`, `cursor?`, `status?`                    | `200` Page     |
| `GET`    | `/analyses/:analysisId` | UUID Path                                         | `200` Resource |
| `PATCH`  | `/analyses/:analysisId` | `{ "title": string }`                             | `200` Resource |
| `DELETE` | `/analyses/:analysisId` | None                                              | `204`          |

Analysis Resource は `id`、`title`、`companyId`、`status`、Sanitized `failureCode` / `failureMessage`、`completedAt`、`createdAt`、`updatedAt` だけを返します。AI View Output と Document は別 Feature/API の Scope とします。

History Page は `items` と Optional `nextCursor` を返します。Cursor は Client が内部値へ依存できない Opaque String とし、Default Limit は 20、Maximum Limit は 50 とします。

## Status Contract

Status Machine の先頭へ `DRAFT` を追加します。

```text
DRAFT
UPLOADED
PARSING
CHUNKING
EMBEDDING
EXTRACTING
VALIDATING
COMPLETED
FAILED_PARSING
FAILED_CHUNKING
FAILED_EMBEDDING
FAILED_EXTRACTION
FAILED_VALIDATION
```

Analysis Management は `DRAFT` を作成します。PDF Upload は最初の Document Finalize 後に `UPLOADED` へ遷移させます。それ以降の遷移は Async Pipeline Feature が管理します。

## Error and Edge Cases

| Case                                         | Expected behavior                                             |
| -------------------------------------------- | ------------------------------------------------------------- |
| Missing/Invalid Bearer Token                 | `401 UNAUTHORIZED`                                            |
| Blank、121 文字以上、Control Character Title | `400 VALIDATION_ERROR`                                        |
| Invalid UUID、Cursor、Limit、Status          | `400 VALIDATION_ERROR`                                        |
| Unknown `companyId`                          | `404 COMPANY_NOT_FOUND`                                       |
| Cross-user/Missing/Soft-deleted Analysis     | `404 ANALYSIS_NOT_FOUND`                                      |
| 同一 Analysis の二重 Delete                  | 2 回目は `404 ANALYSIS_NOT_FOUND`                             |
| Processing 中の Delete                       | Soft Delete し、後続 Job と Object Cleanup を安全に収束させる |

## Approved Decisions

User は 2026-07-24 に以下を承認しました。

1. `DRAFT` を Analysis Status Machine の初期状態として追加し、最初の Document Finalize で `UPLOADED` に遷移します。
2. Create API は Optional `companyId` を受理し、省略または `null` を許可します。指定時は System-wide Company の存在を検証します。
3. History は Offset ではなく Opaque Cursor Pagination を採用し、Default 20、Maximum 50 とします。
4. Analysis は Status にかかわらず Owner が削除可能とします。Soft Delete 後に Worker は各 Step Boundary で停止し、Document Object は Retry 可能な Cleanup へ渡します。
5. Analysis Management Response は Metadata のみに限定し、Documents、AI Outputs、Findings、Evidence は各 Feature の API で返します。

## Acceptance Criteria

| ID                | Given / When / Then                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ANALYSIS-AC-001` | Given Authenticated User と有効な Title、When Create、Then Owner-scoped `DRAFT` Analysis を `201` で返す                       |
| `ANALYSIS-AC-002` | Given Optional Valid Company、When Create、Then Relation を保存し、省略時は `null` を保存する                                  |
| `ANALYSIS-AC-003` | Given複数 User の Analysis、When List、Then Bearer User 自身の Active Resource だけを安定順序で返す                            |
| `ANALYSIS-AC-004` | Given Page Size を超える History、When Cursor で次 Page、Then重複・欠落なく続きを返す                                          |
| `ANALYSIS-AC-005` | Given Owner の Analysis、When Get/Rename/Delete、Then成功し、Delete 後は通常 Query から消える                                  |
| `ANALYSIS-AC-006` | Given別 Owner の Analysis ID、When Get/Rename/Delete、Then同じ `404` で存在を漏らさず Data を変更しない                        |
| `ANALYSIS-AC-007` | Given Invalid Body/Path/Query、When Request、Then統一 `400 VALIDATION_ERROR` を返す                                            |
| `ANALYSIS-AC-008` | Given Missing/Invalid Bearer Token、When任意 Endpoint、Then `401` を返す                                                       |
| `ANALYSIS-AC-009` | Given Analysis Delete、When Active Documents が存在、Then Metadata を同一 Transaction で Soft Delete する                      |
| `ANALYSIS-AC-010` | Given OpenAPI Document、When Contract を確認、Then Success/Error/Pagination/Bearer Schema が具体的に定義されている             |
| `ANALYSIS-AC-011` | Given Testcontainers PostgreSQL、When HTTP Integration Test、Then Create/List/Get/Rename/Delete と Cross-user Isolation が通る |

## Open Questions

| ID               | Question                                                            | Impact                   | Status                              |
| ---------------- | ------------------------------------------------------------------- | ------------------------ | ----------------------------------- |
| `ANALYSIS-Q-001` | Pre-upload State として `DRAFT` を Status Machine に追加するか      | Database/API/Worker      | `Resolved` — `DRAFT` を追加         |
| `ANALYSIS-Q-002` | Create で Optional `companyId` を受理するか、Title のみに限定するか | API/Product              | `Resolved` — Optional + 存在確認    |
| `ANALYSIS-Q-003` | History Pagination を Cursor、Offset、固定件数のどれにするか        | API/Performance          | `Resolved` — Opaque Cursor          |
| `ANALYSIS-Q-004` | Processing 中の Analysis Delete を許可するか                        | Lifecycle/Data integrity | `Resolved` — Soft Delete + Job 停止 |
| `ANALYSIS-Q-005` | Analysis Response に Documents/AI Outputs を含めるか                | API/Scope                | `Resolved` — Metadata のみに限定    |

## Dependencies

- Authentication Specification
- Owner-scoped Data Access Specification
- Approved PDF Upload Specification
- `docs/api-conventions.md`
- `docs/database-design.md`
- `docs/security.md`

Technical Plan と Tasks は 2026-07-24 に作成・承認しました。
