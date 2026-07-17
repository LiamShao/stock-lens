# セキュリティ設計

## 1. 目的

この文書は StockLens AI の認証、認可、アップロード、秘密情報、Log に関する Security Boundary を定義します。Phase 2 の認証実装を基準とし、未実装項目は明示します。

## 2. 認証

### Password

- Password は 12 文字以上 128 文字以下とします。
- Database には Argon2id Hash のみを保存します。
- Login 失敗時は Email の存在有無を区別せず、`INVALID_CREDENTIALS` を返します。
- Soft Delete 済み User の Email は MVP では再利用しません。

### Access Token

- Access Token は署名付き JWT とし、`Authorization: Bearer <token>` で送信します。
- Default 有効期限は 15 分です。
- `issuer`、`audience`、`subject`、有効期限、署名を検証します。
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

## 4. User Data Isolation

- User-owned Resource は必ず Authenticated User ID を `ownerId` / `userId` 条件として Repository Query に含めます。
- Controller は Prisma を直接呼び出しません。
- Phase 2 の Document / Analysis Repository 実装時に、Cross-user Read、Update、Delete の Integration Test を追加します。
- PostgreSQL RLS は MVP 必須ではありません。Repository Boundary と Authorization Test で保証します。

## 5. Error と Log

- API Error は `code`、`message`、`requestId`、`details` の統一形式で返します。
- 予期しない Error は Client に内部 Detail を返しません。
- Password、Access Token、Refresh Token、PDF 全文を Log に記録しません。
- User-Agent は必要な場合も平文ではなく SHA-256 Hash として Token Record に保存します。

## 6. 環境変数

- `ACCESS_TOKEN_SECRET` は 32 文字以上を必須とし、Production では Secrets Manager などから注入します。
- Repository の `.env.example` は Local Development 専用です。
- `.env`、Credential、Production Secret は Commit しません。

## 7. Phase 2 の未実装項目

- Demo User Provisioning
- PDF Extension / MIME / Header Validation
- 20 MB / 3 File Limit
- Private Object Storage Bucket と Short-lived Presigned URL
- Document / Analysis の Owner-scoped Authorization Test
- Redis-backed Distributed Rate Limit
- Secret Rotation Runbook
