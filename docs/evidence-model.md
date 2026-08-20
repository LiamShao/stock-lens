# Evidence モデル

## 1. 目的

Evidence は AI Finding を Original Document、1-based Page、Chunk、Exact Excerpt へ戻すための Traceability Record です。Provider が返した Citation をそのまま信頼せず、Server-side Source Set から再構築します。

API/UI Projection の Target Contract は次です。

```typescript
export interface Evidence {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  excerpt: string;
  chunkId: string;
}
```

`documentName` は Evidence に複製せず、Active `Document.originalName` を Join して返します。

## 2. Relational Lineage

保存する Evidence は `ownerId`、`analysisId`、`documentId`、`pageId`、`chunkId`、`pageNumber`、`excerpt`、`excerptSha256`、`startOffset`、`endOffset` を持ちます。

Database の Composite Foreign Key は次を強制します。

- Evidence と Analysis の Owner が一致する。
- Evidence と Document の Owner/Analysis が一致する。
- Page が同じ Owner/Document に属する。
- Chunk が同じ Owner/Document/Page に属する。
- `FindingEvidence` の Finding と Evidence が同じ Owner/Analysis に属する。

Unique Key `(analysisId, documentId, pageNumber, excerptSha256)` は Retry/Re-run の重複を防ぎます。

## 3. Candidate Validation

Provider は `chunkId` と短い `excerpt` だけを Candidate として返します。Worker は Candidate を次の手順で検証します。

1. `chunkId` を対象 Analysis の Owner-scoped Active Chunk Set から解決する。
2. `excerpt` が Chunk Text に exact match することを確認する。
3. 同じ `excerpt` が Chunk の Original Page Text に exact match することを確認する。
4. Page Number、Document ID、Page Offset、SHA-256 を Server-side で計算する。
5. Unknown/Cross-owner Chunk、Page 不一致、Unsupported Excerpt は Stable Validation Failure とする。

Normalized Match は現時点で実装せず Exact Match のみを採用します。これにより、見た目だけ似た Paraphrase や別 Page の Text を Evidence として保存しません。

## 4. Finding Coverage

Evidence 1 件以上を検証できた Finding だけを `SUPPORTED` にします。Evidence がない Finding は `INSUFFICIENT_EVIDENCE` に降格し、高 Confidence の結論として表示しません。Evidence Excerpt は Original Source Data のため投資助言 Compliance Scan 対象外ですが、Provider が書いた Finding Title/Body は対象です。

Finding/Evidence/Link は Validation 成功時に Analysis 単位で Atomic Replace します。Owner/Input/Prompt が LLM Call 中に変わった場合は Commit を拒否し、旧派生 Set を公開しません。

## 5. Frontend Boundary

Phase 5 では Finding Click から Evidence Drawer を開き、Document Name、Page Number、Original Excerpt を表示します。技術的に可能な場合は短命 Presigned Download URL と PDF Viewer の Page Navigation を接続します。

Frontend は Provider Candidate を直接表示せず、Database に Commit 済みの Evidence Projection だけを使用します。Finding Read API、Evidence Drawer、PDF Page Navigation は Phase 5 未実装です。

## 6. Verification

現時点では Exact Chunk/Page Match、Offset/SHA-256、Evidence 0 件 Downgrade、Unknown Chunk、Unsupported Excerpt、Page 不一致、Cross-owner/Cross-document Database Constraint、Atomic Replace/Rollback を Unit と PostgreSQL Integration で検証済みです。詳細は `specs/features/structured-extraction/verification.md` を参照してください。
