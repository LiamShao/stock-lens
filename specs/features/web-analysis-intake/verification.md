# Web Analysis Intake Verification

## Metadata

| Field               | Value                                        |
| ------------------- | -------------------------------------------- |
| Related Spec        | `specs/features/web-analysis-intake/spec.md` |
| Verification status | `Not started`                                |
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

## Acceptance Evidence

| Acceptance Criterion | Evidence                                | Result        |
| -------------------- | --------------------------------------- | ------------- |
| `INTAKE-AC-001`      | Register RTL + memory client Unit       | `Passed`      |
| `INTAKE-AC-002`      | Title-only draft RTL + strict client    | `Passed`      |
| `INTAKE-AC-003`      | Browser file boundary Unit              | `Passed`      |
| `INTAKE-AC-004`      | Hash/PUT/API Unit; real storage pending | `Partial`     |
| `INTAKE-AC-005`      | Pending                                 | `Not started` |
| `INTAKE-AC-006`      | Pending                                 | `Not started` |
| `INTAKE-AC-007`      | Pending                                 | `Not started` |
| `INTAKE-AC-008`      | Pending                                 | `Not started` |
| `INTAKE-AC-009`      | Pending                                 | `Not started` |
| `INTAKE-AC-010`      | Pending                                 | `Not started` |
| `INTAKE-AC-011`      | Pending                                 | `Not started` |
| `INTAKE-AC-012`      | Pending                                 | `Not started` |
| `INTAKE-AC-013`      | Pending                                 | `Not started` |
| `INTAKE-AC-014`      | Pending                                 | `Not started` |

## Quality Gates

| Command                 | Result |
| ----------------------- | ------ |
| `pnpm format:check`     | TBD    |
| `pnpm spec:check`       | TBD    |
| `pnpm lint`             | TBD    |
| `pnpm typecheck`        | TBD    |
| `pnpm test`             | TBD    |
| `pnpm test:integration` | TBD    |
| `pnpm build`            | TBD    |
| `pnpm e2e`              | TBD    |

## Deviations and Residual Risks

- `INTAKE-DEV-001` は Runtime Implementation/Verification 待ちです。
- Production OpenAI Provider は既存 Feature と同じく Live Passed Artifact がないため `Partial` です。

## Conclusion

Spec/Decision/Technical Plan/Tasks は Approved です。Runtime と Acceptance Evidence は未着手です。
