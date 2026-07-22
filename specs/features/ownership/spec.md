# Owner-scoped Data Access Specification

## Metadata

| Field                 | Value                                |
| --------------------- | ------------------------------------ |
| Spec status           | `Approved`                           |
| Implementation status | `Implemented at repository boundary` |
| Verification status   | `Partial`                            |
| Approval              | `Approved 2026-07-22`                |
| Last updated          | `2026-07-22`                         |

## Goal

Analysis と Document の Data Access で User A が User B の Resource を Read、List、Create Child、Update、Delete できないことを保証します。

## Non-goals

- PostgreSQL RLS
- 未実装の Analysis/Document HTTP API
- Object Storage Authorization と Object Delete Job
- Phase 3 以降の Child Repository

## Functional Requirements

| ID           | Requirement                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------- |
| `OWN-FR-001` | Active Analysis の Find/List/Rename/Soft Delete は `ownerId` Scope を必須とする             |
| `OWN-FR-002` | Active Document の Find/List/Mark Uploaded/Soft Delete は `ownerId` Scope を必須とする      |
| `OWN-FR-003` | Document 作成は Parent Analysis が同じ Owner に属し、Active である場合だけ許可する          |
| `OWN-FR-004` | Analysis Soft Delete は同じ Owner の Active Document を同一 Transaction で Soft Delete する |
| `OWN-FR-005` | Cross-user 操作は Resource 不在と同等に扱い、存在を区別しない                               |

## Security Requirements

| ID            | Requirement                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `OWN-SEC-001` | Controller は `ownerId` を Request Body から受け取らず、Authenticated User から Service へ渡す |
| `OWN-SEC-002` | Controller/Service は Prisma を直接呼ばず Owner-scoped Repository を使用する                   |
| `OWN-SEC-003` | User-owned Parent/Child は作成時に Owner 一致を検証する                                        |
| `OWN-SEC-004` | Soft-deleted Resource は通常 Query から除外する                                                |
| `OWN-SEC-005` | Cross-user Authorization を実 PostgreSQL と将来の HTTP Integration Test で検証する             |

## Repository Contract

- `AnalysisRepository.create/findActiveById/listActive/rename/softDelete`
- `DocumentRepository.createForAnalysis/findActiveById/listActiveForAnalysis/markUploaded/softDelete`
- Cross-user/Inactive 対象は `null`、`false`、Empty List のいずれかを Method Contract に従って返します。

## Acceptance Criteria

| ID           | Given / When / Then                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `OWN-AC-001` | Given Owner A の Analysis、When Owner B が Find/List、Then A の Resource を返さない                          |
| `OWN-AC-002` | Given Owner A の Analysis、When Owner B が Rename/Soft Delete、Then `false` で Data を変更しない             |
| `OWN-AC-003` | Given Owner A の Analysis、When Owner B の Document を Child として作成、Then作成しない                      |
| `OWN-AC-004` | Given Owner A の Document、When Owner B が Find/List/Mark Uploaded/Soft Delete、Then参照・変更しない         |
| `OWN-AC-005` | Given Owner A の Active Analysis/Document、When A が操作、Then成功する                                       |
| `OWN-AC-006` | Given Owner A の Analysis と Document、When A が Analysis を Soft Delete、Then両方が Active Query から消える |
| `OWN-AC-007` | Given Resource API、When Bearer Token User と別 Owner の ID を指定、Then `404` 相当で存在を漏らさない        |

## Open Questions

| ID          | Question                                                          | Status                          |
| ----------- | ----------------------------------------------------------------- | ------------------------------- |
| `OWN-Q-001` | Parent/Child Owner Equality を Database Composite FK で強制するか | `Resolved` — Composite FK       |
| `OWN-Q-002` | PostgreSQL Integration を Testcontainers に移行する時期           | `Resolved` — CI Gate として導入 |
| `OWN-Q-003` | Concurrent Parent Soft Delete と Child Create の Serialization    | `Resolved` — Serializable Retry |
| `OWN-Q-004` | HTTP Authorization Contract                                       | `Blocked` — Planned API         |

## Dependencies

- Authentication Bearer User
- `docs/database-design.md`
- Prisma `Analysis` / `Document`
