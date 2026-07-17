# API 規約

## 1. Base Path

すべての Endpoint は `/api` 配下に置きます。OpenAPI UI は `/api/docs` で提供します。

## 2. Request ID

すべての Request に Request ID を付与します。Client が `x-request-id` を指定した場合はその値を使用し、指定がない場合は API が UUID を生成します。

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

## 5. Validation

- 外部入力は Controller Boundary で Zod Schema により検証します。
- Email は trim と lowercase を適用してから保存・検索します。
- 不正な入力は HTTP 400 / `VALIDATION_ERROR` とします。
- File Upload の Validation Rule は Phase 2 の Upload API 実装時に追記します。

## 6. Status Code

- `200 OK`: Login、Refresh、通常の取得
- `201 Created`: Register、Resource 作成
- `204 No Content`: Logout、Response Body のない削除
- `400 Bad Request`: Validation Error
- `401 Unauthorized`: Credential / Token Error
- `409 Conflict`: Email などの Unique Conflict
- `429 Too Many Requests`: Rate Limit
- `500 Internal Server Error`: Sanitized Unexpected Error
