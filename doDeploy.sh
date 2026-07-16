#!/usr/bin/env bash
# qr-search を vps2 へデプロイする。
#
# 前提 (docs/03-移行計画.md の手順を自動化したもの):
#   - vps2 の ~/41-QR-search/qr-search/ に compose.yaml と .env が配置済み
#   - その .env に APP_ENV=production がある (無いと本番の画面がローカル扱いに
#     なるため、手順 1/8 で弾く)
#   - vps2 は空きメモリが少なくビルド不可のため、
#     イメージはローカルでビルドして docker save/load で転送する
#   - DB マイグレーションはランタイムイメージに prisma CLI が無いため、
#     SSH トンネル経由でローカルから prisma migrate deploy を実行する
#
# デプロイのたびに ./doVersion.sh でバージョンを必ず上げる。
# 画面フッターはビルド時に package.json の version を埋め込むため、
# バージョンアップはイメージビルドより前に行う。
#
# 使い方:
#   ./doDeploy.sh [patch|minor|major]   (省略時: patch)
#
# 環境変数で上書き可能:
#   DEPLOY_REMOTE      ssh 接続先 (default: vps2)
#   DEPLOY_REMOTE_DIR  リモートの compose ディレクトリ ($HOME 相対, default: 41-QR-search/qr-search)
#   DEPLOY_TUNNEL_PORT マイグレーション用トンネルのローカルポート (default: 15432)
set -euo pipefail
cd "$(dirname "$0")"

BUMP="${1:-patch}"
case "$BUMP" in
  patch|minor|major) ;;
  *) echo "usage: $0 [patch|minor|major]" >&2; exit 1 ;;
esac

REMOTE="${DEPLOY_REMOTE:-vps2}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-41-QR-search/qr-search}"
TUNNEL_PORT="${DEPLOY_TUNNEL_PORT:-15432}"
IMAGE="qr-search-app:latest"
HEALTH_URL="http://127.0.0.1:3000/"
HEALTH_RETRIES=30

log() { echo ""; echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# SSH トンネルは ControlMaster で管理し、終了時に必ず閉じる
SSH_CTRL="$(mktemp -u "${TMPDIR:-/tmp}/qr-deploy-ssh.XXXXXX")"
cleanup() {
  ssh -S "$SSH_CTRL" -O exit "$REMOTE" 2>/dev/null || true
}
trap cleanup EXIT

# 非本番の画面はピンク + タイトル [LOCAL] になる (src/lib/appEnv.ts)。
# 判定は「APP_ENV=production を明示したときだけ本番」なので、リモートの .env に
# 書き忘れると本番が LOCAL 表示のまま公開されてしまう。ビルドで時間を使う前に弾く
log "1/8 デプロイ先の APP_ENV 確認"
REMOTE_APP_ENV="$(ssh "$REMOTE" "grep '^APP_ENV=' '$REMOTE_DIR/.env' | cut -d= -f2-")"
if [ "$REMOTE_APP_ENV" != "production" ]; then
  die "$REMOTE の $REMOTE_DIR/.env に APP_ENV=production がない (現在: ${REMOTE_APP_ENV:-未設定})。
     これが無いと本番の画面がローカル扱い (ピンク + [LOCAL]) になる。
     次を実行してから再デプロイすること:
       ssh $REMOTE \"echo APP_ENV=production >> $REMOTE_DIR/.env\""
fi
echo "OK: APP_ENV=production"

log "2/8 lint + test"
npm run lint
npm test

log "3/8 バージョンアップ ($BUMP)"
./doVersion.sh "$BUMP"

log "デプロイ対象: v$(node -p "require('./package.json').version")"

log "4/8 イメージビルド ($IMAGE)"
docker compose build app

log "5/8 イメージ転送 ($REMOTE へ docker save/load)"
docker save "$IMAGE" | gzip | ssh "$REMOTE" 'gunzip | docker load'

log "6/8 DB マイグレーション (SSH トンネル localhost:$TUNNEL_PORT 経由)"
REMOTE_PW="$(ssh "$REMOTE" "grep '^POSTGRES_PASSWORD=' '$REMOTE_DIR/.env' | cut -d= -f2-")"
[ -n "$REMOTE_PW" ] || die "$REMOTE の $REMOTE_DIR/.env から POSTGRES_PASSWORD を取得できない"
ENCODED_PW="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$REMOTE_PW")"

ssh -M -S "$SSH_CTRL" -f -N \
  -L "127.0.0.1:${TUNNEL_PORT}:127.0.0.1:5432" \
  -o ExitOnForwardFailure=yes "$REMOTE"
DATABASE_URL="postgresql://qr:${ENCODED_PW}@127.0.0.1:${TUNNEL_PORT}/qr" \
  npx prisma migrate deploy

log "7/8 app コンテナ再作成"
ssh "$REMOTE" "cd '$REMOTE_DIR' && docker compose up -d --no-build --force-recreate app"

log "8/8 ヘルスチェック ($REMOTE 上の $HEALTH_URL)"
for i in $(seq 1 "$HEALTH_RETRIES"); do
  status="$(ssh "$REMOTE" "curl -fsS -o /dev/null -w '%{http_code}' '$HEALTH_URL'" || true)"
  if [ "$status" = "200" ]; then
    echo "OK: HTTP $status"
    ssh "$REMOTE" 'docker image prune -f' >/dev/null
    log "デプロイ完了"
    exit 0
  fi
  echo "  waiting... ($i/$HEALTH_RETRIES, status=${status:-none})"
  sleep 2
done
die "ヘルスチェックが $HEALTH_RETRIES 回失敗した。$REMOTE で 'docker compose logs app' を確認すること"
