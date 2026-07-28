# Docker 開発環境

この構成では、pgvector をイメージ内に組み込んだプロジェクト専用の PostgreSQL コンテナを起動します。

データベースコンテナは `expense-postgres` など、ほかのローカル PostgreSQL コンテナから独立しています。

## 管理対象サービス

`compose.yaml` は StockLens AI のローカル開発に必要な次のサービスを起動します。

- PostgreSQL 16 + pgvector
- BullMQ キュー用 Redis
- アップロードされた PDF を保存するローカル S3 互換ストレージ MinIO

## PostgreSQL と pgvector

PostgreSQL イメージは次のファイルからビルドします。

```text
docker/postgres/Dockerfile
```

イメージに `postgresql-16-pgvector` をインストールしているため、`docker compose down` やコンテナの再作成後も pgvector を利用できます。

データベースの初回初期化時に、次のスクリプトが `stocklens_ai` で pgvector Extension を有効化します。

```text
docker/postgres/init/01-enable-pgvector.sql
```

PostgreSQL のデータは次の Docker Volume に保存されます。

```text
stocklens-ai_postgres-data
```

`docker compose down` はコンテナを削除しますが、Volume は保持します。`docker compose down -v` は Volume も削除するため、ローカルデータベースのデータが失われます。

## 起動

```bash
docker compose up -d
```

## 停止

```bash
docker compose down
```

## 環境変数

サンプルファイルをコピーします。

```bash
cp .env.example .env
```

API または Worker をホスト上で直接実行する場合は、次の接続先を使用します。

```text
DATABASE_URL=postgresql://stocklens:stocklens-dev-password@localhost:15433/stocklens_ai?schema=public
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_PRESIGN_EXPIRES_IN_SECONDS=300
```

API または Worker を Docker Compose ネットワーク内で実行する場合は、サービス名を接続先に使用します。

```text
DATABASE_URL=postgresql://stocklens:stocklens-dev-password@postgres:5432/stocklens_ai?schema=public
REDIS_URL=redis://redis:6379
S3_ENDPOINT=http://minio:9000
S3_PRESIGN_EXPIRES_IN_SECONDS=300
```

必要に応じて `.env` で PostgreSQL のユーザー名、パスワード、データベース名を変更してください。

## ポート

```text
Redis:        localhost:6379
MinIO API:    localhost:9000
MinIO Console localhost:9001
PostgreSQL:   localhost:15433
```

## 注意事項

- 初期 MinIO Bucket は、今後 Application Bootstrap、Migration Script、または専用セットアップコマンドで作成します。
- `@stocklens/object-storage` は MinIO では `S3_ENDPOINT` と Path-style Access、AWS では Default Credential Provider Chain を使用できます。Presigned PUT URL は最大 5 分です。
- Redis と MinIO のデータは、それぞれ `stocklens-ai_redis-data` と `stocklens-ai_minio-data` に保存されます。
- PostgreSQL のデータは `stocklens-ai_postgres-data` に保存されます。
