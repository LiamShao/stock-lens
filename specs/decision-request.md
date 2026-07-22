# Backfill Decision Request

この文書は Backfill Audit で発見した未決定事項への User Confirmation Entry Point です。詳細 Evidence は `specs/deviations.md` を参照してください。2026-07-22 に User が 15 項目すべてを承認しました。

## Proposed Decisions

| No. | Deviation                                   | Proposed decision                                                                                                                           | Decision |
| --: | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
|   1 | `SDD-DEV-001`                               | Authentication、Demo User、Ownership の Backfilled Spec を As-is Baseline として承認する。ただし各 Deviation 解消までは `Verified` にしない | Approved |
|   2 | `AUTH-DEV-001`, `OWN-DEV-002`, `CI-DEV-001` | PDF Upload と共有できる Testcontainers PostgreSQL Harness を次作業で構築し、Auth/Ownership Integration を CI Gate にする                    | Approved |
|   3 | `AUTH-DEV-002`                              | Unknown Email でも Dummy Argon2id Verify を実行する                                                                                         | Approved |
|   4 | `AUTH-DEV-003`                              | Refresh Token 作成と `lastLoginAt` 更新を同一 Transaction にする                                                                            | Approved |
|   5 | `AUTH-DEV-004`                              | Auth Success/Error/Cookie の OpenAPI Schema を具体化する                                                                                    | Approved |
|   6 | `AUTH-DEV-005`                              | JWT Algorithm を Sign/Verify とも `HS256` に固定する                                                                                        | Approved |
|   7 | `PLATFORM-DEV-001`                          | Client Request ID を最大 128 文字の限定文字種とし、不正値は Server UUID に置換する                                                          | Approved |
|   8 | `PLATFORM-DEV-002`                          | Authorization、Cookie、Set-Cookie、Password、Token の Logger Redaction と Regression Test を追加する                                        | Approved |
|   9 | `DEMO-DEV-001`                              | Production は `ALLOW_DEMO_USER_PROVISIONING=true` と Local Default 以外の Credential を必須にする                                           | Approved |
|  10 | `DEMO-DEV-002`                              | Demo Password が変更された場合だけ既存 Refresh Token を全失効する                                                                           | Approved |
|  11 | `DEMO-DEV-003`                              | Concurrent Create の Unique Conflict 後に再読込し、同じ Existing User Rule に収束させる                                                     | Approved |
|  12 | `DEMO-DEV-004`                              | CLI の Unknown Error は Stable Generic Code/Message のみにし、Raw Message を出力しない                                                      | Approved |
|  13 | `OWN-DEV-001`                               | まず Analysis→Document に Composite Ownership Constraint を追加し、Phase 3 Child Table に同じ Pattern を適用する                            | Approved |
|  14 | `OWN-DEV-003`                               | Serializable Transaction と限定 Retry で Parent Soft Delete/Create Race を防ぐ                                                              | Approved |
|  15 | `SDD-DEV-002`                               | `.gitignore` から `AGENTS.md` を外し、Repository 固有の Agent/SDD Rule として Version Control する                                          | Approved |

`OWN-DEV-004` は Analysis/Document API 未実装のため Decision ではなく Blocked Task です。`DOC-DEV-001` は Architecture と Testing Strategy を PDF Upload Technical Plan より先に作成する Planned Work とします。

## Resolution

15 項目はすべて `2026-07-22` に承認され、実装・Test・Verification へ反映済みです。実装 Evidence と残存 Blocker は `specs/deviations.md` を参照してください。`OWN-DEV-004` と `DOC-DEV-001` は上表 15 項目とは別の継続管理項目です。
