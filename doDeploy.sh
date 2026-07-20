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
#   ./doDeploy.sh [patch|minor|major] [--send-compose.yml]   (省略時: patch)
#
#   --send-compose.yml  compose.yaml もリモートへ送る。
#
#     既定で送らないのは、リモートの compose.yaml が「配置済みの設定」であり、
#     毎回上書きすると手元と乖離していたときに黙って消してしまうため。
#     一方で**環境変数を足したときは送らないと反映されない** — 値を渡す
#     environment: の行は compose.yaml 側にあるので、.env だけ直しても
#     コンテナには届かず「設定したのに未設定と言われる」形で嵌まる
#     (docs/29-パスキー計画.md §12 で実際に踏んだ)。
#
# 環境変数で上書き可能:
#   DEPLOY_REMOTE      ssh 接続先 (default: vps2)
#   DEPLOY_REMOTE_DIR  リモートの compose ディレクトリ ($HOME 相対, default: 41-QR-search/qr-search)
#   DEPLOY_TUNNEL_PORT マイグレーション用トンネルのローカルポート (default: 15432)
#   DEPLOY_DB_PORT     マイグレーション先の **リモート側** DB ポート (default: 5432)
#   DEPLOY_APP_PORT    ヘルスチェックで叩くリモート側 app ポート (default: 3000)
#
# デモインスタンス (qr-demo) へのデプロイは、別スタックのポートに向けて:
#   DEPLOY_REMOTE_DIR=qr-demo DEPLOY_DB_PORT=5433 DEPLOY_APP_PORT=3100 ./doDeploy.sh
# (compose.demo.yaml + デモ .env は配置済みの前提。docs/39-デモ公開計画.md §5)
set -euo pipefail
cd "$(dirname "$0")"

usage() { echo "usage: $0 [patch|minor|major] [--send-compose.yml]" >&2; exit 1; }

BUMP=""
SEND_COMPOSE=0
for arg in "$@"; do
  case "$arg" in
    --send-compose.yml) SEND_COMPOSE=1 ;;
    patch|minor|major)
      # バージョンの上げ幅を 2 つ書かれたら、どちらの意図か決められない
      [ -z "$BUMP" ] || usage
      BUMP="$arg"
      ;;
    *) usage ;;
  esac
done
BUMP="${BUMP:-patch}"

REMOTE="${DEPLOY_REMOTE:-vps2}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-41-QR-search/qr-search}"
TUNNEL_PORT="${DEPLOY_TUNNEL_PORT:-15432}"
# マイグレーション先のリモート側 DB ポートと、ヘルスチェックの app ポート。
# 既定 (5432 / 3000) は本番。デモは別スタックの別ポート (5433 / 3100) を渡す。
# **デモで 3000 のままだと、本番 app を叩いて誤って成功と判定する**ので必須
REMOTE_DB_PORT="${DEPLOY_DB_PORT:-5432}"
IMAGE="qr-search-app:latest"
HEALTH_URL="http://127.0.0.1:${DEPLOY_APP_PORT:-3000}/"
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
  -L "127.0.0.1:${TUNNEL_PORT}:127.0.0.1:${REMOTE_DB_PORT}" \
  -o ExitOnForwardFailure=yes "$REMOTE"
DATABASE_URL="postgresql://qr:${ENCODED_PW}@127.0.0.1:${TUNNEL_PORT}/qr" \
  npx prisma migrate deploy

# compose.yaml の転送は再作成の**直前**に置く。ここで送っておけば、続く
# up -d --force-recreate が新しい定義 (environment: など) で作り直す。
# 送ったのに再作成しない、という中途半端な状態を作らないための並び
if [ "$SEND_COMPOSE" = "1" ]; then
  log "7/8 compose.yaml 転送 + app コンテナ再作成"

  LOCAL_SUM="$(md5sum compose.yaml | cut -d' ' -f1)"
  REMOTE_SUM="$(ssh "$REMOTE" "md5sum '$REMOTE_DIR/compose.yaml' 2>/dev/null | cut -d' ' -f1" || true)"

  if [ "$LOCAL_SUM" = "$REMOTE_SUM" ]; then
    echo "OK: compose.yaml は同一 (転送を省略)"
  else
    # 上書きする前に控えを取る。手元と乖離した設定がリモートにあった場合、
    # 転送はそれを消す操作になるため。正本はこのリポジトリなので、
    # 控えは「直前の状態にすぐ戻せる」ためだけの 1 世代でよい。
    #
    # 初回 (リモートに何も無い) は控えを作らない。作れないのに
    # 「控えは .bak にある」と言うと、戻せると思って探す羽目になる
    if ssh "$REMOTE" "[ -f '$REMOTE_DIR/compose.yaml' ]"; then
      ssh "$REMOTE" "cp '$REMOTE_DIR/compose.yaml' '$REMOTE_DIR/compose.yaml.bak'"
      BACKUP_NOTE="前の内容は $REMOTE_DIR/compose.yaml.bak"
    else
      BACKUP_NOTE="リモートに既存の compose.yaml は無かった"
    fi
    scp -q compose.yaml "$REMOTE:$REMOTE_DIR/compose.yaml"
    echo "OK: compose.yaml を転送 ($BACKUP_NOTE)"
  fi
else
  log "7/8 app コンテナ再作成"
fi

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
