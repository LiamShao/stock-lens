# API 規約

## 1. Base Path

すべての Endpoint は `/api` 配下に置きます。OpenAPI UI は `/api/docs` で提供します。

## 2. Request ID

すべての Request に Request ID を付与します。Client の `x-request-id` は 128 文字以内かつ ASCII の英数字、`.`、`_`、`:`、`-` だけを受理します。未指定または不正な値は API が生成した UUID に置換します。

## 3. Error Format

Error Response は次の形式に統一します。

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "requestId": "uuid",
  "details": {
    "issues": []
  }
}
```

- `code`: Client が分岐に使用できる Stable Code
- `message`: User に表示可能な Sanitized Message
- `requestId`: Log と照合する ID
- `details`: 非機密の追加情報。情報がない場合も空 Object

予期しない Error は `INTERNAL_SERVER_ERROR` とし、Stack Trace や Database Detail を返しません。

## 4. Authentication Endpoint

| Method | Path             | 説明                                     |
| ------ | ---------------- | ---------------------------------------- |
| POST   | `/auth/register` | User 作成、Access/Refresh Token 発行     |
| POST   | `/auth/login`    | Email / Password Login                   |
| POST   | `/auth/refresh`  | Refresh Token Rotation                   |
| POST   | `/auth/logout`   | Refresh Token Family 失効                |
| GET    | `/auth/me`       | Bearer Token に紐づく Active User を取得 |

Register と Login は Access Token を Response Body に返し、Refresh Token を `HttpOnly` Cookie に設定します。Password や Refresh Token を Response JSON に含めません。

OpenAPI は Auth Success/Error DTO、Refresh Cookie Response Header、Bearer/Cookie Security Scheme を具体的な Schema として公開します。

## 5. Analysis Management Endpoint

すべて Bearer Authentication を必須とします。

| Method | Path                    | 説明                                       |
| ------ | ----------------------- | ------------------------------------------ |
| POST   | `/analyses`             | `DRAFT` Analysis を作成                    |
| GET    | `/analyses`             | Owner-scoped History を Cursor Pagination  |
| GET    | `/analyses/:analysisId` | Owner-scoped Metadata を取得               |
| PATCH  | `/analyses/:analysisId` | Title を変更                               |
| DELETE | `/analyses/:analysisId` | Analysis と Active Document を Soft Delete |

Create は Trim 後 1〜120 文字の `title` と Optional `companyId` を受け取ります。History は `createdAt DESC, id DESC`、Default 20、Maximum 50 の Opaque Cursor Pagination です。Response は Metadata のみに限定し、`ownerId`、Document、AI Output を含めません。

Cross-user、Missing、Soft-deleted Analysis は同じ HTTP 404 / `ANALYSIS_NOT_FOUND` とし、Unknown Company は `COMPANY_NOT_FOUND` とします。

## 6. PDF Upload / Document Endpoint

すべて Bearer Authentication を必須とし、Path の `analysisId` と Resource は Authenticated User の Owner Scope で解決します。

| Method | Path                                                        | 成功 | 説明                                              |
| ------ | ----------------------------------------------------------- | ---- | ------------------------------------------------- |
| POST   | `/analyses/:analysisId/document-uploads`                    | 201  | Upload Session と制限付き Presigned PUT を作成    |
| POST   | `/analyses/:analysisId/document-uploads/:uploadId/presign`  | 200  | Active `PENDING` Session の PUT URL を再発行      |
| POST   | `/analyses/:analysisId/document-uploads/:uploadId/finalize` | 200  | Object を Trusted Validation して Document を確定 |
| GET    | `/analyses/:analysisId/documents`                           | 200  | Active Finalized Document を最大 3 件返す         |
| DELETE | `/analyses/:analysisId/documents/:documentId`               | 204  | Metadata を Soft Delete し Object Cleanup を登録  |

Upload Start Body は次の形式です。Unknown Field は拒否します。

```json
{
  "originalName": "決算短信.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576,
  "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "documentType": "EARNINGS_SUMMARY"
}
```

- `originalName`: Trim 後 1〜255 文字、C0/DEL Control Character と `/` / `\` なし、case-insensitive `.pdf`
- `mimeType`: exact `application/pdf`
- `sizeBytes`: 1 byte 以上 20 MB 以下
- `sha256`: 64 文字 lowercase hexadecimal
- `documentType`: Optional。省略時は `UNKNOWN`

Start Response は Storage-safe な `uploadSession` と、5 分以下の `upload.url`、`upload.expiresAt`、署名済み PUT に必須の `upload.headers` を返します。Bucket、Object Key、Credential は返しません。Client は Body を変換せず、返された `Content-Length`、`Content-Type`、SHA Metadata Header をすべて付けて URL へ直接 PUT した後、Finalize Endpoint を呼びます。

Finalize は Object Storage Metadata だけを信頼せず、Object を Streaming Read して Actual Size、SHA-256、先頭 `%PDF-` を再検証します。成功時は `DocumentResource` を返し、同じ Completed Session の再 Finalize は Storage を再読込せず同じ Document を返します。

Document List Response は `{ "items": DocumentResource[] }` です。`DocumentResource` は `id`、`analysisId`、`originalName`、`documentType`、`mimeType`、`sizeBytes`、`sha256`、`uploadedAt`、`createdAt`、`updatedAt` だけを含み、`ownerId`、Bucket、Object Key は含みません。

主な Stable Error は次のとおりです。

| HTTP | Code                         | 条件                                                   |
| ---: | ---------------------------- | ------------------------------------------------------ |
|  400 | `VALIDATION_ERROR`           | Path または Upload Metadata が不正                     |
|  404 | `ANALYSIS_NOT_FOUND`         | Analysis が Missing/Cross-user/Soft-deleted            |
|  404 | `DOCUMENT_UPLOAD_NOT_FOUND`  | Upload Session が Missing/Cross-user                   |
|  404 | `DOCUMENT_NOT_FOUND`         | Document が Missing/Cross-analysis/Deleted             |
|  409 | `DOCUMENT_LIMIT_EXCEEDED`    | Active Document と予約 Session の合計が 3 件以上       |
|  409 | `DOCUMENT_UPLOAD_NOT_ACTIVE` | Session が Finalize 中、Rejected、Expired など         |
|  409 | `UPLOAD_EXPIRED`             | 24-hour Session TTL を超過                             |
|  409 | `DUPLICATE_DOCUMENT`         | 同一 Analysis に同じ SHA-256 の Active Document が存在 |
|  422 | `INVALID_PDF`                | Trusted Size/SHA/Header/Metadata Validation に失敗     |
|  503 | `OBJECT_STORAGE_UNAVAILABLE` | Presigned URL を発行できない                           |
|  503 | `STORAGE_VALIDATION_FAILED`  | Object を読み取れず Finalize を再試行可能              |

Delete、Invalid/Expired Finalize は、Database に Durable `OBJECT_CLEANUP` を保存してから Redis/BullMQ Dispatch を試行します。Queue 障害があっても HTTP Outcome と Cleanup Pending State は失われません。

## 7. Validation

- 外部入力は Controller Boundary で Zod Schema により検証します。
- Email は trim と lowercase を適用してから保存・検索します。
- Analysis Title は trim し、C0/DEL Control Character を拒否します。
- Analysis Body、Path、Query は Unknown Field を拒否します。
- 不正な入力は HTTP 400 / `VALIDATION_ERROR` とします。
- PDF Upload は Extension、Declared MIME、Declared Size、SHA-256 を Presign 前に検証し、Finalize 時に実 Object を再検証します。

## 8. Status Code

- `200 OK`: Login、Refresh、通常の取得
- `201 Created`: Register、Resource 作成
- `204 No Content`: Logout、Response Body のない削除
- `400 Bad Request`: Validation Error
- `401 Unauthorized`: Credential / Token Error
- `404 Not Found`: Missing または Cross-user Resource
- `409 Conflict`: Email などの Unique Conflict
- `422 Unprocessable Entity`: Uploaded Object の Trusted PDF Validation Error
- `503 Service Unavailable`: Object Storage の一時的 Failure
- `429 Too Many Requests`: Rate Limit
- `500 Internal Server Error`: Sanitized Unexpected Error
