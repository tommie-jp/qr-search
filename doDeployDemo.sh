#!/usr/bin/env bash
# デモインスタンス (qr-demo) をデプロイする doDeploy.sh の薄いラッパ。
# デモ専用の doDeploy.sh は不要で、これは env の固定と「種のスキーマ同期」を
# 足すだけ (docs/39-デモ公開計画.md §5)。
#
# なぜラッパを分けるか:
#  1. デモのポート/ディレクトリを固定する。手打ち env で DEPLOY_APP_PORT を
#     忘れると、ヘルスチェックが**本番 app(3000) を叩いて誤って成功と判定**する。
#  2. **migration の罠を自動で塞ぐ** (docs/39 §6-3)。deploy は live の qr を
#     migrate するが、種 qr_seed は旧スキーマのまま残り、次の毎時リセットで
#     `createdb -T qr_seed qr` がスキーマを巻き戻して app が起動不能になる。
#     ここで qr_seed にも migrate を当ててスキーマを揃える。**種のデータ
#     (showcase) は触らない** — pending が無ければ "No pending migrations" で
#     no-op なので、コードのみの更新でも安全に通る。
#
# 使い方 (doDeploy.sh と同じ引数):
#   ./doDeployDemo.sh [patch|minor|major] [--send-compose.yml]
#
# 前提: vps2 の ~/qr-demo/ が配置済み (compose 2種 + .env。docs/39 §5)。
#
# 種の「中身」を変えたいとき (showcase を更新したとき) は、これとは別に種を
# 撮り直す (docs/40 §3)。このスクリプトが同期するのはスキーマだけ。
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="${DEPLOY_REMOTE:-vps2}"
DEMO_DIR="${DEPLOY_REMOTE_DIR:-qr-demo}"
SEED_DB="qr_seed"
# 種同期用トンネルのローカルポート。doDeploy.sh 本体 (15432) と別にする
SEED_TUNNEL_PORT="${DEMO_SEED_TUNNEL_PORT:-15533}"

log() { echo ""; echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# 1. 本体のデプロイ (デモのポート/ディレクトリを固定して doDeploy.sh を呼ぶ)。
#    版数up・ビルド・転送・live qr の migrate・app 再作成まではここが行う。
DEPLOY_REMOTE_DIR="$DEMO_DIR" DEPLOY_DB_PORT=5433 DEPLOY_APP_PORT=3100 \
  ./doDeploy.sh "$@"

# 2. 種 qr_seed のスキーマを live に揃える (migration の罠を塞ぐ)。
#    doDeploy.sh の migrate 手順と同じ作法 (SSH トンネル + prisma migrate deploy)
#    を、接続先 DB だけ qr_seed に変えて行う。
log "種 ($SEED_DB) のスキーマ同期 (SSH トンネル localhost:$SEED_TUNNEL_PORT 経由)"
REMOTE_PW="$(ssh "$REMOTE" "grep '^POSTGRES_PASSWORD=' '$DEMO_DIR/.env' | cut -d= -f2-")"
[ -n "$REMOTE_PW" ] || die "$REMOTE の $DEMO_DIR/.env から POSTGRES_PASSWORD を取得できない"
ENC_PW="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$REMOTE_PW")"

SEED_CTRL="$(mktemp -u "${TMPDIR:-/tmp}/qr-demo-seed-ssh.XXXXXX")"
cleanup() { ssh -S "$SEED_CTRL" -O exit "$REMOTE" 2>/dev/null || true; }
trap cleanup EXIT
ssh -M -S "$SEED_CTRL" -f -N \
  -L "127.0.0.1:${SEED_TUNNEL_PORT}:127.0.0.1:5433" \
  -o ExitOnForwardFailure=yes "$REMOTE"

DATABASE_URL="postgresql://qr:${ENC_PW}@127.0.0.1:${SEED_TUNNEL_PORT}/${SEED_DB}" \
  npx prisma migrate deploy

# 種の PGroonga 索引は migrate や過去の複製で壊れていることがあるが、直さない。
# 毎時の reseedDemo.sh が createdb -T の後に live 側を REINDEX するため、
# qr_seed 自身の索引状態は live に影響しない (docs/39 §6-2)。

log "デモのデプロイ + 種のスキーマ同期 完了"
