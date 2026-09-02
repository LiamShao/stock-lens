# Web Analysis Intake Verification

## Metadata

| Field               | Value                                        |
| ------------------- | -------------------------------------------- |
| Related Spec        | `specs/features/web-analysis-intake/spec.md` |
| Verification status | `Passed`                                     |
| Last updated        | `2026-09-02`                                 |

## Environment

- Web Vitest / React Testing Library
- Isolated PostgreSQL / Redis / BullMQ / MinIO / Deterministic Provider
- Playwright Chromium Desktop / Mobile

## Implemented Evidence

- `ApiClient` は Shared Strict Schema を再利用し、Registration、Analysis Create/Delete、Upload Start/Re-presign/Finalize、Document List/Delete、Explicit Process を Memory-only Bearer Session と一回の 401 Recovery に接続します。
- `pdf-upload.ts` は最大 3 Files、1〜20 MB、`.pdf`、exact MIME、`%PDF-` Header、Web Crypto SHA-256 を Browser Boundary で検証します。
- Object Storage PUT は `credentials: omit`、`cache: no-store`、`redirect: error` と Server-returned Headers だけを使用し、Failure 時は同じ Upload Session の URL を一回だけ再発行します。
- `api-client.spec.ts` / `pdf-upload.spec.ts`: Registration Normalization/Memory Session、全 Write Route/Bearer Contract、Invalid File Matrix、Real SHA-256、Credential-free PUT、Re-presign/Finalize を検証しました。
- `/register` は Shared Zod/React Hook Form、Memory Session、Password Clear、Login Link を持ち、成功後 `/analyses` へ Redirect します。
- `/analyses/new` は `companyId: null` の Title-only Draft を作成し、Server ID の `/analyses/:id/intake` へ Redirect します。History/Header/Login に Registration/Create Entry を追加しました。
- `session-shells.spec.tsx` は Optional Blank Display Name、Normalized Registration、No Browser Storage、Title Trim、Null Company、ID Route を検証しました。
- `/analyses/:analysisId/intake` は Draft/Uploaded Status に限定し、最大 3 File の Memory-only State、Document Type、Parallel Upload、File-level Retry/Remove、Server Document Restore/Delete、Explicit Process、Explicit Analysis Delete を実装します。
- Process Button は Finalized Document 1 件以上、Local File 0 件、Upload Terminal の場合だけ有効で、Finalize/Reload/Retry から自動実行されません。Accepted 後だけ既存 Detail Polling へ Redirect します。
- `analysis-intake-screen.spec.tsx` は Invalid 4 Files の API Side-effect なし、Credential-free PUT、Finalize、No-auto Process、Parallel 1 Success/1 Failure、Reload Document Restore、Explicit Document/Analysis Delete を検証しました。
- Task 006/007 Web Gate: Lint、Typecheck、10 Files / 40 Tests、Production Build が成功しました。Sandbox 内 Build は Turbopack/PostCSS Port Bind 制限で失敗し、同一 Command の承認済み sandbox 外再実行が成功しました。
- `analysis-intake.e2e.spec.ts` は Browser Registration → Draft Create → 3-page PDF → Real MinIO PUT/Finalize → Explicit Process → PostgreSQL/Redis/BullMQ Worker → `COMPLETED` → Three Views/Evidence Drawer を検証しました。
- 同 E2E は Owner B による Owner A Analysis の Document List、Upload Start、Document Delete、Process Start がすべて同じ `404 ANALYSIS_NOT_FOUND` となることを検証しました。
- E2E で Intake の fresh `UPLOADED` Cache が Process 後にも残る問題と、Detail の Query Cache Hit 時に bounded polling が開始しない問題を検出し、Accepted `PARSING` Cache update と Mount 起点の 5 分 bounded polling に修正しました。

## Acceptance Evidence

| Acceptance Criterion | Evidence                                  | Result   |
| -------------------- | ----------------------------------------- | -------- |
| `INTAKE-AC-001`      | Register RTL + memory client Unit         | `Passed` |
| `INTAKE-AC-002`      | Title-only draft RTL + strict client      | `Passed` |
| `INTAKE-AC-003`      | Browser file boundary Unit                | `Passed` |
| `INTAKE-AC-004`      | Hash/PUT Unit + real MinIO Browser E2E    | `Passed` |
| `INTAKE-AC-005`      | Parallel partial success/retry RTL        | `Passed` |
| `INTAKE-AC-006`      | Server document restore + no storage      | `Passed` |
| `INTAKE-AC-007`      | Delete RTL + Owner B E2E boundary         | `Passed` |
| `INTAKE-AC-008`      | Explicit single process RTL               | `Passed` |
| `INTAKE-AC-009`      | No-auto process RTL                       | `Passed` |
| `INTAKE-AC-010`      | Re-presign/401/safe error Unit + RTL      | `Passed` |
| `INTAKE-AC-011`      | Semantic controls RTL + 390px Browser E2E | `Passed` |
| `INTAKE-AC-012`      | Isolated full-stack 3-page Browser E2E    | `Passed` |
| `INTAKE-AC-013`      | Owner B four-route uniform 404 E2E        | `Passed` |
| `INTAKE-AC-014`      | Abort + explicit delete RTL               | `Passed` |

## Quality Gates

| Command                 | Result                                 |
| ----------------------- | -------------------------------------- |
| `pnpm format:check`     | Passed                                 |
| `pnpm spec:check`       | Passed: 10 Features / 167 Requirements |
| `pnpm lint`             | Passed: 8 Tasks                        |
| `pnpm typecheck`        | Passed: 11 Tasks                       |
| `pnpm test`             | Passed: 311 Unit/Component Tests       |
| `pnpm test:integration` | Passed: 12 Suites / 75 Tests           |
| `pnpm build`            | Passed: 7 Tasks                        |
| `pnpm e2e`              | Passed: Chromium 4 Tests               |

## Deviations and Residual Risks

- `INTAKE-DEV-001` は Full Browser Journey と Owner Boundary Evidence で解消しました。
- Production OpenAI Live Passed Artifact は未取得ですが、`INTAKE-Q-008 A` に従い本 Feature の標準 Acceptance は Test-only Deterministic Provider と Real Infrastructure で完了しています。
- Firefox/WebKit と Production S3 CORS/IAM の実地 Browser Acceptance は Phase 7 の残存 Risk です。

## Conclusion

`INTAKE-AC-001`〜`INTAKE-AC-014` はすべて Passed です。Approved Scope は Public API、Database Migration、Production Dependency を変更せず Implemented/Verified となりました。
