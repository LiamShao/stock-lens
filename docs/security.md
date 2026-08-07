# セキュリティ設計

## 1. 目的

この文書は StockLens AI の認証、認可、アップロード、秘密情報、Log に関する Security Boundary を定義します。Phase 2 の認証実装を基準とし、未実装項目は明示します。

## 2. 認証

### Password

- Password は 12 文字以上 128 文字以下とします。
- Database には Argon2id Hash のみを保存します。
- Login 失敗時は Email の存在有無を区別せず、`INVALID_CREDENTIALS` を返します。
- Unknown Email でも固定 Dummy Argon2id Hash を Verify し、明白な Timing Difference を縮小します。
- Soft Delete 済み User の Email は MVP では再利用しません。

### Access Token

- Access Token は署名付き JWT とし、`Authorization: Bearer <token>` で送信します。
- Default 有効期限は 15 分です。
- `issuer`、`audience`、`subject`、有効期限、署名を検証します。
- Sign/Verify Algorithm は `HS256` のみ許可します。
- JWT Payload には User ID と正規化済み Email だけを含めます。
- Protected Endpoint では Token 検証後に Active User を Database で再確認します。

### Refresh Token

- Refresh Token は 256 bit の Random Secret を含む Opaque Token です。
- Browser には `HttpOnly`、`SameSite=Strict` Cookie として保存します。
- Production では `Secure` を有効にします。
- Database には Secret の SHA-256 Hash のみを保存し、平文は保存しません。
- Refresh ごとに Token を Rotate し、使用済み Token を再利用した場合は Token Family 全体を失効します。
- Logout は現在の Token Family を失効し、Cookie を削除します。

`SameSite=Strict`、Refresh/Logout の POST 限定、許可 Origin を固定した Credential CORS を Cookie Endpoint の CSRF 防御とします。将来 Cross-site Deployment が必要になった場合は、この前提を変更する前に CSRF Token を追加します。

## 3. Rate Limit

- API 全体は Default で 1 IP あたり 1 分 100 Request です。
- Register は 1 分 5 Request、Login は 1 分 10 Request、Refresh は 1 分 20 Request です。
- 現在の Store は Process Local です。複数 Instance Deployment 前に Redis-backed Store へ変更します。
- Rate Limit Error も統一 API Error Format の `429 RATE_LIMIT_EXCEEDED` とします。

## 4. User Data Isolation

- User-owned Resource は必ず Authenticated User ID を `ownerId` / `userId` 条件として Repository Query に含めます。
- Controller は Prisma を直接呼び出しません。
- Analysis HTTP API は Bearer User から Repository まで `ownerId` を伝播し、Cross-user Read、Update、Delete を同じ `404 ANALYSIS_NOT_FOUND` とする Testcontainers HTTP Test を持ちます。
- Document HTTP API は PDF Upload Feature で同じ End-to-end Authorization Test を追加します。
- `Analysis(ownerId, id)` と `Document(ownerId, analysisId)` の Composite FK で Parent/Child Owner Equality を Database でも強制します。
- PostgreSQL RLS は MVP 必須ではありません。Repository Boundary と Authorization Test で保証します。

## 5. Error と Log

- API Error は `code`、`message`、`requestId`、`details` の統一形式で返します。
- 予期しない Error は Client に内部 Detail を返しません。
- Password、Access Token、Refresh Token、PDF 全文を Log に記録しません。
- Structured Logger は Authorization、Cookie、Set-Cookie、Password、Access/Refresh Token Field を明示的に Redact します。
- PDF Upload の Presigned URL、Storage Bucket/Key、Object Key、Original Filename、Object Body、Full PDF/Page/Chunk Text も既知の Nested Field を含めて Redact します。
- Client Request ID は最大 128 文字の限定文字種だけを受理し、Log Injection/Storage Abuse を抑えます。
- User-Agent は必要な場合も平文ではなく SHA-256 Hash として Token Record に保存します。

## 6. 環境変数

- `ACCESS_TOKEN_SECRET` は 32 文字以上を必須とし、Production では Secrets Manager などから注入します。
- Repository の `.env.example` は Local Development 専用です。
- `.env`、Credential、Production Secret は Commit しません。

## 7. 残存 Security 項目

- Automated MinIO/Redis/BullMQ Storage/Cleanup Integration Acceptance
- Browser CORS、Production Private Bucket Policy、IAM Policy
- Redis-backed Distributed Rate Limit
- Secret Rotation Runbook
- Parse/LLM Provider への Untrusted PDF Context Boundary 接続と End-to-end Prompt Injection Evaluation

Demo User は明示的な CLI でのみ Provisioning し、API 起動時には作成しません。CLI は通常 User の上書き、Soft Delete 済み User の暗黙的な復元、Password の出力を禁止します。Production では `ALLOW_DEMO_USER_PROVISIONING=true` と Local Default 以外の Password を必須とし、Password 変更時は既存 Active Refresh Token を同一 Transaction で失効します。

Document / Analysis Repository は Read、List、Create、Update、Soft Delete の Query に Authenticated User の `ownerId` を含めます。Cross-user 操作が Resource の存在を推測できないよう、Repository は対象なしとして扱います。この Boundary は Testcontainers PostgreSQL Integration Test で検証します。Analysis HTTP API の End-to-end Authorization は検証済みです。Document HTTP API と Object Storage Authorization は PDF Upload Feature の実装まで Blocked です。

Object Storage Boundary は `@stocklens/object-storage` に集約します。Presigned PUT は Private Bucket の単一 Object Key に限定し、`Content-Length`、`Content-Type: application/pdf`、Claimed SHA-256 Metadata を署名します。有効期限は最大 300 秒です。Object Key は Owner/Analysis/Upload Session Prefix と Random UUID で作成し、Original Filename を含めません。AWS SDK Credential、Presigned URL、Bucket、Object Key は Log に記録しません。Storage Metadata は Hint であり、Finalize 時には Trusted Server-side Code が Size、SHA-256 と `%PDF-` Header を Streaming 再検証します。

Object Cleanup Queue の Payload は `jobExecutionId` UUID のみに限定し、Bucket、Object Key、Credential を Redis に複製しません。Worker は Owner-consistent Database Relation から Target を解決します。Provider の Error Detail は Log や Job History に保存せず、Stable Error Code と Sanitized Message のみを記録します。

Uploaded PDF から将来抽出する Text は `@stocklens/shared` の Trust Boundary を通し、`source: uploaded-pdf`、`trust: untrusted`、`role: user`、`instructionsAllowed: false` を固定します。Text 内の Delimiter と Markup は Escape し、System/Developer Instruction には昇格させません。現在は Boundary と Prompt Injection Regression Unit Test まで実装済みで、Parse/LLM Provider への実接続と End-to-end Evaluation は Phase 4 の対象です。
