#!/usr/bin/env bash
# vps2 の nginx 設定 (qr.tommie.jp) をリポジトリから反映する。
#
# 前提:
#   - リポジトリの deploy/nginx/qr.tommie.jp.conf が正
#   - conf はコミット済みであること (下記「ドリフト検知」の前提)
#   - vps2 の sudo は NOPASSWD (nginx -t / install / systemctl reload に使う)
#   - /etc/nginx/.htpasswd-qr はリポジトリ管理外。再発行するときは vps2 で:
#       sudo htpasswd -c /etc/nginx/.htpasswd-qr tommie
#
# 使い方:
#   ./doDeployNginx.sh          反映する (差分がなければ何もしない)
#   ./doDeployNginx.sh --check  差分の表示のみ。サーバは一切変更しない
#
# 環境変数で上書き可能:
#   DEPLOY_REMOTE  ssh 接続先 (default: vps2)
#   DEPLOY_SITE    ヘルスチェック先のホスト名 (default: qr.tommie.jp)
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="${DEPLOY_REMOTE:-vps2}"
SITE="${DEPLOY_SITE:-qr.tommie.jp}"
LOCAL_CONF="deploy/nginx/qr.tommie.jp.conf"
REMOTE_CONF="/etc/nginx/sites-available/qr.tommie.jp"
# 認証必須のパス。未認証なら 401 になる
AUTH_URL="https://${SITE}/"
# 認証を外したパス。nginx 内で完結せず app まで到達するので、
# proxy_pass が生きていることの確認に使える (app 側の実装次第で 200 / 404)
BACKEND_URL="https://${SITE}/manifest.webmanifest"

CHECK_ONLY=0
case "${1:-}" in
  --check) CHECK_ONLY=1 ;;
  "") ;;
  # 未知の引数を黙って無視すると、確認のつもりの typo が本番反映になる
  *) echo "ERROR: 未知の引数: $1 (使えるのは --check のみ)" >&2; exit 1 ;;
esac

log() { echo ""; echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

http_status() {
  local status
  # -f は付けない。401 は想定内の応答で、エラー扱いにすると紛らわしい
  status="$(curl -s -o /dev/null -w '%{http_code}' "$1")" || true
  echo "$status"
}

rollback() {
  ssh "$REMOTE" \
    "sudo install -o root -g root -m 644 '$BACKUP' '$REMOTE_CONF' && sudo nginx -t && sudo systemctl reload nginx" \
    || die "ロールバックにも失敗した。$REMOTE で手動復旧すること:
  sudo install -o root -g root -m 644 '$BACKUP' '$REMOTE_CONF' && sudo nginx -t && sudo systemctl reload nginx"
}

[ -f "$LOCAL_CONF" ] || die "$LOCAL_CONF が無い"

log "1/5 リモートとの差分確認 ($REMOTE:$REMOTE_CONF)"
# 末尾改行の有無まで含めてバイト単位で比較するため、一時ファイルに落とす
# (コマンド置換は末尾の改行を落とすので、git hash-object に渡すと実物と別物になる)
REMOTE_COPY="$(mktemp "${TMPDIR:-/tmp}/qr-nginx-remote.XXXXXX")"
trap 'rm -f "$REMOTE_COPY"' EXIT
ssh "$REMOTE" "cat '$REMOTE_CONF'" > "$REMOTE_COPY" || die "$REMOTE から $REMOTE_CONF を読めない"

if cmp -s "$REMOTE_COPY" "$LOCAL_CONF"; then
  echo "差分なし。反映するものはない"
  exit 0
fi

diff -u --label "$REMOTE (現在)" --label "リポジトリ (反映後)" "$REMOTE_COPY" "$LOCAL_CONF" || true

# ドリフト検知: リモートの内容がこのリポジトリのオブジェクトに存在しない場合、
# certbot --nginx の再実行などでサーバ側が直接書き換えられている。
# それを上書きするとサーバ側の変更が失われるため、取り込み直しを促して中断する。
log "2/5 サーバ側ドリフトの確認"
REMOTE_HASH="$(git hash-object "$REMOTE_COPY")"
if ! git cat-file -e "${REMOTE_HASH}^{blob}" 2>/dev/null; then
  echo "リモートの内容がこのリポジトリのどのバージョンとも一致しない。" >&2
  echo "サーバ側で直接編集された可能性がある (certbot --nginx の再実行など)。" >&2
  echo "上書きするとその変更が失われるため中断する。" >&2
  echo "" >&2
  echo "上の diff を確認し、サーバ側の変更を残すなら取り込んでコミットすること。" >&2
  echo "作業ツリーの編集を捨てて構わない場合に限り:" >&2
  echo "  ssh $REMOTE 'cat $REMOTE_CONF' > $LOCAL_CONF" >&2
  die "ドリフトを検知した"
fi
echo "OK: リモートは過去にこのリポジトリから反映した状態"

if [ "$CHECK_ONLY" = "1" ]; then
  log "--check のため反映せず終了"
  exit 0
fi

# 未コミットのまま反映すると、リモートの内容がどのコミットにも存在しない状態になり、
# 次回以降の実行が必ずドリフト検知で止まる。反映はコミット済みの内容に限る。
log "3/5 コミット済みか確認"
git diff --quiet HEAD -- "$LOCAL_CONF" \
  || die "$LOCAL_CONF に未コミットの変更がある。先にコミットすること
  (未コミットのまま反映すると、次回以降ドリフト検知で止まる)"
echo "OK: 作業ツリーはコミット済み"

log "4/5 転送 + 配置 + 構文検証 (nginx -t)"
STAGE="/tmp/qr.tommie.jp.conf.$$"
BACKUP="/tmp/qr.tommie.jp.conf.bak.$$"
scp -q "$LOCAL_CONF" "$REMOTE:$STAGE"
ssh "$REMOTE" "sudo cp '$REMOTE_CONF' '$BACKUP' && sudo install -o root -g root -m 644 '$STAGE' '$REMOTE_CONF' && rm -f '$STAGE'"

# nginx -t は /etc/nginx/nginx.conf 全体を検証するため、配置後でないと試せない。
# 失敗した場合、稼働中の nginx は旧設定のままだが、壊れたファイルを残すと
# 次回の無関係な reload で落ちるため、バックアップに戻す。
if ! ssh "$REMOTE" 'sudo nginx -t' 2>&1; then
  echo "構文エラー。バックアップに戻す" >&2
  rollback
  die "nginx -t が失敗した (reload はしていない。サーバは旧設定のまま)"
fi

log "5/5 reload + ヘルスチェック"
ssh "$REMOTE" 'sudo systemctl reload nginx'

# 認証: 401 は nginx 内で完結するので、これだけでは proxy_pass の健全性は分からない
auth_status="$(http_status "$AUTH_URL")"
if [ "$auth_status" != "401" ]; then
  echo "$AUTH_URL: 想定 401 に対し $auth_status。Basic 認証が効いていない" >&2
  rollback
  die "ヘルスチェック失敗。ロールバックした"
fi
echo "OK: $AUTH_URL -> 401 (Basic 認証が有効)"

# バックエンド: 認証を外したパスは app まで到達するため、5xx なら proxy_pass が壊れている
backend_status="$(http_status "$BACKEND_URL")"
case "$backend_status" in
  401|5??|000)
    echo "$BACKEND_URL: $backend_status。app へ到達できていない" >&2
    rollback
    die "ヘルスチェック失敗。ロールバックした"
    ;;
esac
echo "OK: $BACKEND_URL -> $backend_status (app へ到達)"

ssh "$REMOTE" "sudo rm -f '$BACKUP'"
log "反映完了"
