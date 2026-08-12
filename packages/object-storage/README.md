# Object Storage Package

`@stocklens/object-storage` は、StockLens AI の Private PDF Object Storage Boundary です。AWS S3 と S3-compatible MinIO を同じ Interface で扱い、API と Worker が Provider 固有の SDK 呼び出しを共有できるようにします。

## 提供する機能

- Owner、Analysis、Upload Session と Random UUID から Original Filename を含まない Object Key を生成
- `application/pdf`、Expected Content Length、Claimed SHA-256 Metadata を署名した Presigned PUT URL を発行
- Presigned URL を最大 5 分に制限
- Head Metadata の取得
- Trusted Finalize Validation 用の Node.js Readable Stream
- Object が存在しない場合も成功する S3 Delete
- MinIO 用 Custom Endpoint / Path-style と AWS Default Credential Provider Chain の両方をサポート

Presigned URL、Credential、Bucket、Object Key を Database に保存する責務は持ちません。API Response で Bucket または Object Key を独立 Field として公開せず、Log に URL や Credential を記録しないでください。

## 依存関係

- `@aws-sdk/client-s3`: Head、Get、Delete、Put Command と AWS/MinIO-compatible Client に必要
- `@aws-sdk/s3-request-presigner`: S3 Client Credential を公開せず短命 PUT URL を署名するために必要

AWS SDK の Automatic Request Checksum は、未知の PUT Body を空 Body として署名しないよう `WHEN_REQUIRED` に設定しています。Upload 完了時の SHA-256、Size、PDF Header は API の Trusted Streaming Validation で必ず再検証します。

## 環境変数

```text
S3_BUCKET=stocklens-dev
S3_REGION=ap-northeast-1
S3_ENDPOINT=http://localhost:9000
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=stocklens
S3_SECRET_ACCESS_KEY=...
S3_PRESIGN_EXPIRES_IN_SECONDS=300
```

AWS Runtime では `S3_ENDPOINT` と Static Credential を省略し、IAM Role など AWS SDK Default Credential Provider Chain を利用できます。

## Upload / Cleanup Lifecycle

- API は `DocumentUpload` に Bucket/Key を保存した後、Adapter から最大 5 分の Presigned PUT を取得します。
- Client は Response の署名済み Header を変更せず Private Bucket へ直接 PUT します。
- API Finalize は Head/Get を使い、Metadata を Hint として Actual Size、SHA-256、`%PDF-` Header を Streaming 再検証します。
- Worker は Database Relation から同じ Bucket/Key を解決して Delete します。Missing Object は Idempotent Success です。
- API/Worker の Configured Bucket と Database Target Bucket が一致しない場合、Worker は Delete せず Sanitized Failure とします。

Local MinIO Bucket は Application が自動作成しません。Root/Docker README の `mc mb --ignore-existing` を実行してください。Production は事前作成した Private Bucket、Browser PUT CORS、API/Worker 別の最小権限 IAM Role を必要とします。
