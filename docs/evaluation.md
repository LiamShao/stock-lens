# AI 評価

## 1. 方針

AI Evaluation は Unit Test、Infrastructure Integration、Opt-in Live Smoke、Golden Dataset Evaluation を分離します。Mock/Deterministic Test だけで Production Provider を `Passed` とせず、Live Artifact がない状態は `Partial` と報告します。

## 2. 評価 Layer

| Layer                  | 目的                                                | CI                     | 現在の状態                             |
| ---------------------- | --------------------------------------------------- | ---------------------- | -------------------------------------- |
| Strict Schema Unit     | Zod、Bound、Compliance、Error Classification        | 必須                   | 実装済み                               |
| Deterministic Pipeline | Retry/Repair、Evidence、Atomic Publish、Idempotency | 必須                   | 実装済み                               |
| Infrastructure E2E     | PostgreSQL/Redis/BullMQ、Race、Content-free Audit   | 必須                   | 実装済み                               |
| OpenAI Live Smoke      | Production Adapter と Versioned Prompt の最小疎通   | 明示 opt-in            | Harness 実装済み、Passed Artifact なし |
| Golden Dataset         | 5 Company / 15 Public IR PDF の品質回帰             | 将来の repeatable gate | 未実装                                 |

## 3. Phase 4 OpenAI Live Smoke

`.env` に `OPENAI_API_KEY`、Structured Outputs 対応の `OPENAI_MODEL`、`ALLOW_OPENAI_LIVE_EVALUATION=true` を設定して実行します。

```bash
pnpm openai:live-evaluation
```

Harness は Production `OpenAiLlmProvider` と Git-tracked Prompt を使い、synthetic financial fact と prompt-injection instruction を含む Untrusted Context を 1 回だけ処理します。次を判定します。

- Strict Structured Output
- Japanese Finding Output
- Finding ごとの Evidence Coverage
- Chunk/Excerpt の Exact Source Lineage
- Forbidden Investment Language Compliance
- Injection Sentinel が Model-authored Text に現れないこと

Result は JSON 1 Record です。Provider、Model、Prompt Name/Version/SHA-256、Schema Version、Token、Latency、Provider Request ID、Boolean Check、Count だけを含み、Prompt、Source、Generated Text を含みません。`status: PASSED` の Artifact を Review するまで Provider Integration は `Partial` です。

Opt-in がない場合は API Call 前に `OPENAI_LIVE_EVALUATION_NOT_ALLOWED` で終了します。Live Smoke は Cost/Availability に依存するため CI の標準 Gate へ含めません。

## 4. Golden Dataset Target

最低 5 社、15 件の再配布または利用条件を確認した Public IR PDF を Manifest で固定します。Original PDF を Repository に置けない場合は、取得元、Document Hash、取得日、License/Usage Note を管理し、CI Fixture と Local Acceptance Evidence を区別します。

Result は JSON または Markdown で、少なくとも Provider、Model、Prompt Version、Schema Version、Dataset Version、Execution Time を記録します。Raw PDF/Prompt/Provider Response、Secret は Artifact に含めません。

## 5. Metric Definition

- Schema Success Rate: Strict Zod Parse 成功 Run / 全 Run
- Evidence Coverage: Evidence 必須 Finding のうち Valid Evidence を持つ割合
- Citation Accuracy: Sampled Evidence が Document/Page/Exact Excerpt と一致する割合
- Numeric Consistency: Deterministic Expected Metric と Output の値・単位・期間が一致する割合
- Unsupported Claim Rate: Source で支持できない重要 Claim の割合。低いほど良い
- Missing Information Detection: Gold で不足とした項目を `unknown` / missing とした割合
- RAG Answer Citation Rate: Phase 6 Q&A Answer のうち Valid Citation を持つ割合

Threshold と Failure Policy は Golden Dataset 準備時に Spec で承認し、結果を見て後付けで緩和しません。Financial Calculation の Gold は deterministic code/fixture で作成し、LLM の自由記述を正解値にしません。

## 6. 現在の Gap

- Live Provider Passed Artifact は未取得です。
- Golden Dataset Manifest、Runner、Threshold、Artifact Retention は未実装です。
- RAG Answer Citation Rate は Phase 6 Scope です。
- Production Cost Budget と Evaluation Credential/IAM は Phase 7 Deployment Scope です。
