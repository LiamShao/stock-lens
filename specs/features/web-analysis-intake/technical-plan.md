# Web Analysis Intake Technical Plan

## Metadata

| Field        | Value                                        |
| ------------ | -------------------------------------------- |
| Related Spec | `specs/features/web-analysis-intake/spec.md` |
| Plan status  | `Approved`                                   |
| Approval     | `2026-09-02 INTAKE-Q-001〜008 A`             |
| Last updated | `2026-09-02`                                 |

## Approach

既存 Web Session/TanStack Query Foundation に Registration と Write API を追加し、`/analyses/new` で Draft Create、`/analyses/:analysisId/intake` で Upload/Review/Explicit Process を行います。Create 後は `replace` Navigation で Server ID を URL に固定し、Reload 時は Analysis Metadata と Finalized Document List だけを再取得します。

File は最大 3 件を Memory-only State Machine で bounded parallel 処理します。選択時に Shared Limit と Browser Header を検証し、`crypto.subtle.digest('SHA-256')` 後に Upload Session、Presigned PUT、Finalize を直列実行します。File ごとの Pipeline は最大 3 並列ですが、Presigned URL と SHA-256 は Query Cache/Persistent Storage/DOM に保存しません。

Processing は Document Summary の後に User が Button を押した場合だけ開始し、Mutation は single-flight にします。Accepted 後は既存 Analysis Detail へ遷移します。Provider Runtime、Database、Public API、Object Storage Adapter は変更しません。

## Affected Files

| Area          | Files / Directories                                  | Change                                                     |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Shared usage  | Existing `@stocklens/shared` exports                 | Existing strict schemas/types only; no contract change     |
| API client    | `apps/web/src/lib/api-client.ts`                     | Register/Create/Upload/List/Delete/Process/Delete methods  |
| File boundary | `apps/web/src/lib/pdf-upload.ts`                     | Count/size/name/MIME/header/SHA-256 and one-shot PUT       |
| Registration  | `apps/web/src/app/register/*`                        | Shared Zod form, memory session, redirect                  |
| Create flow   | `apps/web/src/app/analyses/new/*`                    | Title-only Draft creation                                  |
| Intake flow   | `apps/web/src/app/analyses/[analysisId]/intake/*`    | Upload state, documents, delete, explicit processing       |
| Navigation    | History/Protected shell/Login                        | New-analysis/register entry points                         |
| Tests         | Web Vitest/RTL and `apps/e2e`                        | Boundaries, recovery, accessibility, full isolated journey |
| Docs/Specs    | Feature Verification/Traceability/Deviation/Progress | Evidence and residual risks                                |

## Client State and Routing

- `/register` は unauthenticated form です。成功した `AuthResponse` は既存 Session Provider と同じ in-memory state に適用し、`/analyses` へ `replace` します。
- `/analyses/new` は authenticated title form です。`companyId: null` で作成後、`/analyses/{id}/intake` へ `replace` します。
- Intake Route は `DRAFT` / `UPLOADED` だけを編集可能とし、Processing/Terminal Status は既存 Detail へ Redirect します。
- Local File State は stable client key、File reference、display metadata、step、safe error だけを持ちます。URL、hash、raw bytes は durable React/Query state に保持しません。
- Reload は incomplete Local File を失うことを明示し、Server の Finalized Document List を正とします。

## Upload Boundary

1. Selection 全体を最大 3、各 File を Shared 20 MB、`.pdf`、`application/pdf`、先頭 5 Bytes `%PDF-` で検証します。
2. Bounded `arrayBuffer()` から Web Crypto SHA-256 を計算し、lowercase hexadecimal にします。
3. Existing Upload Start API を Bearer + Cookie API Boundary で呼びます。
4. Object Storage PUT は `credentials: omit`、`cache: no-store`、`redirect: error`、Server-returned Headers、Abort Signal を使用します。Authorization は付けません。
5. URL reference を破棄して Finalize API を呼び、Strict `DocumentResource` を Parse します。
6. Failure は safe step/code だけを State に残し、Retry は File を再検証・再hashします。Start 後 PUT Expiry は active `uploadId` の Re-presign を一回試せます。

## API Client Changes

- Existing `JsonRequestOptions.method` を required verbs `DELETE` まで拡張し、No-content authenticated request helper を追加します。
- 全 Response は existing Shared Zod schema で Browser Boundary Parse します。
- `register` は `login` と同様に `applyAuth` します。
- Write methods は Abort Signal を受け、401 Recovery を一回だけ行います。
- Presigned URL を含む Start/Re-presign Response は TanStack Query Cache に置かず imperative call 内だけで扱います。

## Accessibility and Error Handling

- Forms は visible Label、field error association、disabled/pending state を持ちます。
- File progress は `aria-live` と text status を持ち、color-only にしません。
- Delete/Process は対象 Summary と明示 confirmation を持ちます。
- Stable API Code は既存 Japanese mapper を拡張し、raw response/provider/storage content を描画しません。
- File error は filename と safe category だけを表示し、hash/URL/storage coordinate を表示しません。

## Test Strategy

| Requirement                              | Level                 | Evidence                                                  |
| ---------------------------------------- | --------------------- | --------------------------------------------------------- |
| `INTAKE-FR-001`, `AC-001`                | API client + RTL      | Register session/cookie request/no storage/redirect       |
| `INTAKE-FR-002`, `AC-002`                | RTL                   | Strict title and `companyId: null` create                 |
| `INTAKE-FR-003`〜`005`, `SEC-002`〜`005` | Unit + RTL            | boundary/hash/PUT options/parallel partial retry          |
| `INTAKE-FR-006`〜`009`                   | RTL + API integration | reload list/delete/explicit single process/draft delete   |
| `INTAKE-SEC-001`, `007`                  | Existing + E2E        | Bearer A/B same 404/no side effect                        |
| `INTAKE-AC-011`                          | RTL + Playwright      | keyboard/mobile/status/focus                              |
| `INTAKE-AC-012`〜`014`                   | Full-stack Chromium   | register→create→upload→process→views→PDF; owner isolation |

CI は Deterministic Provider と isolated PostgreSQL/Redis/BullMQ/MinIO を使います。Production OpenAI は既存 explicit opt-in Harness のままで、本 Feature の標準 Gate に含めません。

## Rollout and Rollback

1. API Client/File Boundary を Unit Test とともに追加します。
2. Registration/Create Routes を追加します。
3. Intake Upload/Document/Process Flow を接続します。
4. Component と Full-stack Browser Acceptance を Gate に追加します。
5. Rollback は Web Route/Navigation を戻します。既存 API/Database/Object は互換で、作成済み Draft/Document は History/API から回復できます。

## Risks and Mitigations

- 3 × 20 MB Hash/Upload は Browser Memory/Network を消費します。各 File を bounded read し、最大 3、Abort/Unmount Cleanup を必須にします。
- Parallel Failure は State が複雑です。File ごとの explicit state と successful Document server refresh に収束させます。
- Presigned URL Leakage は Private Object を露出します。imperative local scope、no cache/storage/DOM/log、credential omit を Test します。
- Reload で File Object は失われます。自動再開を約束せず、Finalized Document と明示再選択に分けます。
- Process は Cost を伴います。explicit Button、single-flight、no automatic mutation を Browser Test します。
