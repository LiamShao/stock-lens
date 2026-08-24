# Analysis Views Specification

## Metadata

| Field                 | Value                     |
| --------------------- | ------------------------- |
| Spec status           | `Approved`                |
| Implementation status | `Implementing`            |
| Verification status   | `Partial`                 |
| Owner                 | `TBD`                     |
| Approval              | `2026-08-24 Q-001〜007 A` |
| Last updated          | `2026-08-24`              |

## Goal

Phase 4 で検証・保存された Finding、Evidence、Deterministic Financial Metrics から、個人投資家が日本企業の公開 IR 資料を理解するための Analysis View を生成し、Owner-isolated API と Web UI で参照できるようにします。

各 View は日本語で、重要な判断を Original Document、1-based Page、Original Excerpt へ追跡可能にします。資料にない情報は推測せず、投資助言、売買推奨、目標株価、株価・Return Prediction、Buffett/Munger の人格模倣または Endorsement を出力しません。

## Non-goals

- Ask This Company、Embedding、pgvector、Hybrid Retrieval、RAG
- Full DCF、WACC、Target Price、Stock Price / Return Prediction
- OCR、External News、Real-time Market Data
- Company 間比較、二期間 Document Diff、Knowledge Graph Visualization
- Anonymous Access、Social/Community、Brokerage Integration
- PDF Text の編集、注釈、再配布
- LLM による重要 Financial Calculation

## Actors and Preconditions

- Authenticated User は自分の Active Analysis だけを参照します。
- Generation は `READY_FOR_VIEW_GENERATION` の Analysis と、Phase 4 で Commit 済みの Active Finding、Evidence、Financial Metric Snapshot だけを入力にします。
- Independent Worker だけが LLM Provider Credential を保持し、Queue Payload は `jobExecutionId` のみです。
- Browser は Private Object Storage Credential または Storage Coordinate を受け取りません。
- Web UI の Login/Session、History、Analysis Detail Shell は現時点で未実装であり、承認済み `VIEW-Q-005` Option A に従って本 Feature に含めます。

## Functional Requirements

| ID            | Requirement                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIEW-FR-001` | `READY_FOR_VIEW_GENERATION` の Analysis を Durable `GENERATE_VIEWS` Job へ一度だけ引き渡し、Step、Attempt、開始/終了時刻、Sanitized Failure を追跡する                                                  |
| `VIEW-FR-002` | Generation Input は Owner-scoped Active Finding、Finding-linked Evidence、Validated Financial Metrics、Analysis/Company Metadata に限定し、削除済み・別 Owner・未検証 Data を含めない                   |
| `VIEW-FR-003` | Just Tell Me は高校卒業程度で読める簡潔な日本語で、収益構造、最近の変化、Positive、Risk、Watch Item、Missing Information を説明する                                                                     |
| `VIEW-FR-004` | Analyst View は Business Overview、Financial Highlights、Management Guidance、Positive Findings、Risks、Uncertainties、Watch Items、Sources を Evidence-based に整理する                                |
| `VIEW-FR-005` | Buffett-Munger Lens は Business Understandability、Competitive Advantage、Cash Generation、Capital Allocation、Management Incentives、Long-term Risks、Missing Information を公開原則の枠組みで整理する |
| `VIEW-FR-006` | View Output は Versioned Strict Zod Schema に従い、View、Section、Block、Japanese Text、Evidence ID、Missing/Unknown を構造化し、Unknown Field、Count/Length 超過、空の必須 Section を拒否する          |
| `VIEW-FR-007` | 重要な判断を含む Block は 1 件以上の Valid Evidence ID を必須とし、Server-side で同じ Owner/Analysis/Finding Lineage と Original Document/Page/Chunk を再解決する                                       |
| `VIEW-FR-008` | Evidence 不足は Unsupported Conclusion に変換せず、Missing Information または `情報不足，无法判断……` と同等の明示的な不確実性として表現する                                                             |
| `VIEW-FR-009` | 三つの View は Schema、Citation、Compliance Validation 成功後に Analysis 単位で原子的に置換し、Retry/Re-run/Duplicate Delivery で Partial View や重複 Output を公開しない                               |
| `VIEW-FR-010` | Validation Failure は bounded repair、Transient Provider Failure は bounded Job Retry を行い、上限後は `FAILED_VALIDATION` または `FAILED_EXTRACTION` と Stable/Sanitized Reason を保存する             |
| `VIEW-FR-011` | 成功時は `completedAt` と Completion Status を同一 Transaction で保存し、Read API が未完成 Output を Completed と表示しない                                                                             |
| `VIEW-FR-012` | Owner-scoped View Read API は View Block、参照 Evidence、Document Name、Page Number、Excerpt、Chunk ID を bounded/normalized Response で返す                                                            |
| `VIEW-FR-013` | Web は Analysis Status を表示し、完成時に View 切替、Section、Citation Trigger、Missing Information、Compliance Notice を Responsive に表示する                                                         |
| `VIEW-FR-014` | Finding/Citation の操作で Evidence Drawer を開き、Document Name、Page Number、Original Excerpt を表示する                                                                                               |
| `VIEW-FR-015` | Evidence Drawer から Active Document の短命 Download URL を取得し、対応する PDF Page へ移動できる                                                                                                       |
| `VIEW-FR-016` | Web は Access Token を永続 Storage に保存せず、HttpOnly Refresh Cookie の Rotation で Session を回復し、Login、History、Analysis Detail へ遷移できる                                                    |
| `VIEW-FR-017` | Provider、Model、Prompt Version、Schema Version、Token、Latency、Estimated Cost、Provider Request ID を Content-free `AiUsageLog` に記録する                                                            |

## Security and Compliance Requirements

| ID             | Requirement                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIEW-SEC-001` | Analysis、Finding、Evidence、Document、View、Download URL の全 Query は Authenticated `ownerId` を必須とし、Cross-user Resource は `404` とする                              |
| `VIEW-SEC-002` | View Generation Context は Commit 済み Finding/Evidence も Untrusted Data として明示し、System/Developer Instruction、Tool Call、URL Fetch、State Mutation を許可しない      |
| `VIEW-SEC-003` | Provider Output と persisted JSONB は Strict Zod Validation、Bounded Count/Length、Unknown Field Reject、Plain-text Rendering を適用し、HTML を実行しない                    |
| `VIEW-SEC-004` | Buy/Sell Recommendation、Target Price、Price/Return Prediction、Personalized Allocation、Trade Timing を deterministic validator で Persist 前に拒否する                     |
| `VIEW-SEC-005` | Buffett/Munger/Berkshire の人格模倣、直接発言、承認・推奨の示唆を deterministic validator と UI Disclaimer で拒否する                                                        |
| `VIEW-SEC-006` | Provider Credential、Access Token、Refresh Token、Full Context、Prompt/Response、Full PDF Text、Storage Bucket/Key、Presigned URL を Log、Job Detail、Usage Log に保存しない |
| `VIEW-SEC-007` | Download URL は Active Owner/Analysis/Document を再確認後に発行し、Private Bucket の Read に限定し、有効期限を最大 5 分とする                                                |
| `VIEW-SEC-008` | Access Token は Browser Memory に限定し、Refresh Cookie は既存 `HttpOnly`、`SameSite=Strict`、Path `/api/auth`、Production `Secure` Contract を維持する                      |
| `VIEW-SEC-009` | Provider Call、Context/Output Size、Timeout、Automatic Retry/Repair、Estimated Cost、Read Response Size、Client Polling に明示的上限を設ける                                 |
| `VIEW-SEC-010` | Generation Commit 前に Analysis/Document/Input Hash/Prompt Version/Owner/Deletion 状態を再確認し、Race または Reprocess では Fail closed とする                              |

## API and Data Contract

Draft Candidate:

| Method | Path                                                           | Success                         | Stable errors                                                               |
| ------ | -------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `GET`  | `/api/analyses/:analysisId/views`                              | `200 AnalysisViewsResource`     | `ANALYSIS_NOT_FOUND`, `ANALYSIS_VIEWS_NOT_READY`, `RATE_LIMIT_EXCEEDED`     |
| `POST` | `/api/analyses/:analysisId/documents/:documentId/download-url` | `200 PresignedDocumentDownload` | `ANALYSIS_NOT_FOUND`, `DOCUMENT_NOT_FOUND`, `DOCUMENT_DOWNLOAD_UNAVAILABLE` |

Candidate Output Shape:

```typescript
interface AnalysisViewsResource {
  analysisId: string;
  status: 'COMPLETED';
  completedAt: string;
  views: {
    justTellMe: AnalysisView;
    analyst: AnalysisView;
    buffettMunger: AnalysisView;
  };
  evidences: Evidence[];
}

interface AnalysisView {
  schemaVersion: string;
  sections: Array<{
    key: string;
    title: string;
    blocks: Array<{
      key: string;
      text: string;
      evidenceIds: string[];
      isMissingInformation: boolean;
    }>;
  }>;
}
```

`Evidence` は `id`、`documentId`、`documentName`、`pageNumber`、`excerpt`、`chunkId` を返します。View Block は Evidence を埋め込まず ID で参照し、Response の `evidences` は重複排除します。

Database Candidate:

- Existing `Analysis.justTellMeOutput`、`analystViewOutput`、`buffettMungerOutput` JSONB を Strict Schema-validated Output に使用します。
- Existing `JobStep.GENERATE_VIEWS`、`PromptVersion`、`AiUsageLog`、`JobExecution`、`JobAttempt` を使用します。
- Completion Status は承認済み `VIEW-Q-001` Option A に従い、三 View の Atomic Publish 後だけ既存 `COMPLETED` を使用し、新しい Enum は追加しません。
- Evidence を View JSONB 内に複製せず、Evidence ID だけを保存します。

## Error and Edge Cases

| Case                                           | Expected behavior                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Analysis が `READY_FOR_VIEW_GENERATION` でない | Job Start を拒否し、既存成功 Output を変更しない                                    |
| Active Finding/Evidence がない                 | Non-retryable Failure。空の高 Confidence View を生成しない                          |
| Evidence ID が Unknown/Cross-owner/Unlinked    | Citation Validation Failure、Partial Output を保存しない                            |
| Missing Category/Metric                        | Missing Information として表示し、値・結論を推測しない                              |
| Forbidden Advice / Buffett Impersonation       | Compliance Failure、bounded repair 上限後 `FAILED_VALIDATION`                       |
| Provider Timeout / 429 / 5xx                   | Retryable、最大 Attempt 内で回復                                                    |
| Malformed / Oversized Output                   | Strict Schema Failure、bounded repair                                               |
| Delete/Reprocess during Provider Call          | Commit 前 Active Parent/Input Recheck で Fail closed                                |
| Duplicate Delivery / Manual Re-run             | 同じ Execution/Input/Prompt/Schema Version から一つの Atomic Set に収束             |
| Views 未完成の Read                            | `409 ANALYSIS_VIEWS_NOT_READY`。Partial/Stale Output は返さない                     |
| Cross-owner Read/Download                      | Resource 存在を漏らさず `404`                                                       |
| Storage Object Missing/Provider Failure        | URL を返さず Sanitized `DOCUMENT_DOWNLOAD_UNAVAILABLE`。Storage Detail を漏らさない |
| Presigned URL Expired                          | Client は再発行を要求し、永続保存または自動 Log をしない                            |
| Access Token Expired                           | 一回だけ Cookie Refresh/Rotation 後に Request を再試行。失敗時は Login へ戻る       |

## Acceptance Criteria

| ID            | Given / When / Then                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIEW-AC-001` | Given Phase 4 Handoff、When Generation Start、Then Durable `GENERATE_VIEWS` Execution/Attempt と固定 Input/Prompt/Schema Version を作り Worker へ渡す                  |
| `VIEW-AC-002` | Given Deterministic Provider Fixture、When Generation、Then三つの Strict Japanese View を Atomic Persist し Completion Status/`completedAt` を保存する                 |
| `VIEW-AC-003` | Given Missing/Ambiguous Finding、When Generate、Then Missing Information を明示し Unsupported Fact/Number を補完しない                                                 |
| `VIEW-AC-004` | Given Important View Block、When Citation Validation、Then 1 件以上の Owner/Analysis-consistent Evidence と Document/Page/Chunk/Excerpt へ追跡できる                   |
| `VIEW-AC-005` | Given Unknown/Cross-owner/Unlinked Evidence、When Validate、Then全 View を Publish せず Stable Failure にする                                                          |
| `VIEW-AC-006` | Given Advice、Target Price、Prediction、Personal Allocation、Trade Timing、Impersonation/Endorsement、When Validate、Then Persist を拒否する                           |
| `VIEW-AC-007` | Given Schema/Citation/Compliance Failure、When bounded repair が成功、Then同じ Execution 内で Valid Atomic Set に収束する                                              |
| `VIEW-AC-008` | Given Repair 上限超過または Transient Retry Exhaustion、When Job 終了、Then Sanitized Failed State、Attempt History、No Partial Set を保存する                         |
| `VIEW-AC-009` | Given Duplicate Delivery、Manual Re-run、Delete/Reprocess Race、When Commit、Then重複/旧 Input/削除済み Parent を公開しない                                            |
| `VIEW-AC-010` | Given Owner A の Completed Analysis、When View API を呼ぶ、Then normalized View/Evidence Projection を返し、Owner B には `404` を返す                                  |
| `VIEW-AC-011` | Given Completed Analysis、When Web Detail を開く、Then三 View、Status、Section、Missing Information、Compliance Notice を Keyboard/Responsive 対応で表示する           |
| `VIEW-AC-012` | Given Citation Trigger、When User が選択、Then Evidence Drawer に Document Name、1-based Page、Original Excerpt を表示する                                             |
| `VIEW-AC-013` | Given Active Evidence Document、When PDF Navigation、Then最大 5 分の Read-only URL を Owner check 後に発行し該当 Page を開く。Missing/Cross-owner Object は漏洩しない  |
| `VIEW-AC-014` | Given Browser Reload または Access Token Expiry、When Session Recovery、Then Token を永続 Storage から読まず Refresh Rotation で一回だけ回復し、失敗時は Login へ戻る  |
| `VIEW-AC-015` | Given Provider/Storage/API Error、When Log/Job/Usage/Browser Error を調査、Then Token、Full Content、Storage Coordinate、Presigned URL、Raw Provider Detail を含まない |
| `VIEW-AC-016` | Given Prompt Injection を含む Evidence、When View Generation/Render、Then命令として実行せず Plain Text Source としてのみ扱う                                           |

## Open Questions

| ID           | Question                                           | Impact                                       | Status                                           |
| ------------ | -------------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `VIEW-Q-001` | Phase 5 で生成する View と Completion Status       | Scope / Public Status / Phase 6              | `Resolved A: three views then COMPLETED`         |
| `VIEW-Q-002` | 三 View の Provider Call / Atomic Publish 単位     | Cost / Retry / Consistency                   | `Resolved A: one bounded call + atomic publish`  |
| `VIEW-Q-003` | View Block と Evidence の Citation Contract        | Data Model / Validation / UI                 | `Resolved A: direct Evidence IDs`                |
| `VIEW-Q-004` | View Read API の Projection と Not-ready Semantics | Public API / Payload / Polling               | `Resolved A: completed aggregate; not-ready 409` |
| `VIEW-Q-005` | 未実装 Web Auth/History/Detail Foundation の扱い   | Scope / Dependency / End-to-end Verification | `Resolved A: minimal foundation in this feature` |
| `VIEW-Q-006` | PDF Page Navigation の実装方式                     | Dependency / Browser Compatibility / UX      | `Resolved A: PDF.js viewer + read presign`       |
| `VIEW-Q-007` | Live Provider Verification の Gate                 | Cost / Secret / Completion Claim             | `Resolved A: deterministic CI + opt-in live`     |

## Dependencies

- Approved/Implemented Structured Extraction Specification
- Approved/Verified Authentication、Ownership、Analysis Management Specifications
- Existing `Analysis` View JSONB、`AnalysisFinding`、`Evidence`、`JobStep.GENERATE_VIEWS`、Prompt/Usage Audit Schema
- Existing Private Object Storage Adapter（Read Presign は未実装）
- `docs/architecture.md`、`docs/ai-pipeline.md`、`docs/evidence-model.md`、`docs/security.md`、`docs/testing-strategy.md`
- User Approval of `specs/features/analysis-views/decision-request.md`
