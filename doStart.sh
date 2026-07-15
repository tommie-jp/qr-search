#!/usr/bin/env bash
# qr-search をローカルで本番相当 (docker compose) に起動する。
# db 起動 → DB マイグレーション → app 起動 → ヘルスチェック。
#
# 使い方:
#   ./doStart.sh           # 起動 (イメージが無ければビルド)
#   ./doStart.sh --build   # イメージを作り直してから起動
#
# 停止は: docker compose down
# Caddy (HTTPS + Basic 認証) 込みで試す場合は:
#   docker compose --profile proxy up -d
set -euo pipefail
cd "$(dirname "$0")"

log() { echo ""; echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ -f .env ] || die ".env がない。cp .env.example .env して値を設定すること"

APP_PORT="$(grep -oP '^APP_PORT=\K.*' .env || true)"
APP_URL="http://127.0.0.1:${APP_PORT:-3000}/"
HEALTH_RETRIES=30

if [ "${1:-}" = "--build" ]; then
  log "イメージビルド"
  docker compose build app
fi

log "db 起動"
docker compose up -d --wait db

log "DB マイグレーション"
# compose の migrate サービスは使わない (削除済み): あれはビルド済みイメージの中の
# prisma/migrations を見るため、イメージが古いと新しい migration が入っておらず
# 「No pending migrations」と言って黙って何もしない。実際ローカルのイメージは
# init 1 件しか持っていなかった。doDeploy.sh と同様にホストの prisma CLI から
# 作業ツリーの migration を直接当てる
npx prisma migrate deploy

log "app 起動"
docker compose up -d app

log "ヘルスチェック ($APP_URL)"
for i in $(seq 1 "$HEALTH_RETRIES"); do
  status="$(curl -fsS -o /dev/null -w '%{http_code}' "$APP_URL" || true)"
  if [ "$status" = "200" ]; then
    echo "OK: HTTP $status"
    log "起動完了: $APP_URL"
    exit 0
  fi
  echo "  waiting... ($i/$HEALTH_RETRIES, status=${status:-none})"
  sleep 2
done
die "ヘルスチェックが $HEALTH_RETRIES 回失敗した。'docker compose logs app' を確認すること"
