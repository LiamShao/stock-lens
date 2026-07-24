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

## 6. Validation

- 外部入力は Controller Boundary で Zod Schema により検証します。
- Email は trim と lowercase を適用してから保存・検索します。
- Analysis Title は trim し、C0/DEL Control Character を拒否します。
- Analysis Body、Path、Query は Unknown Field を拒否します。
- 不正な入力は HTTP 400 / `VALIDATION_ERROR` とします。
- File Upload の Validation Rule は Phase 2 の Upload API 実装時に追記します。

## 7. Status Code

- `200 OK`: Login、Refresh、通常の取得
- `201 Created`: Register、Resource 作成
- `204 No Content`: Logout、Response Body のない削除
- `400 Bad Request`: Validation Error
- `401 Unauthorized`: Credential / Token Error
- `404 Not Found`: Missing または Cross-user Resource
- `409 Conflict`: Email などの Unique Conflict
- `429 Too Many Requests`: Rate Limit
- `500 Internal Server Error`: Sanitized Unexpected Error
