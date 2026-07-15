#!/usr/bin/env bash
# vps2 の nginx 設定 (qr.tommie.jp) をリポジトリから反映する。
#
# 前提:
#   - リポジトリの deploy/nginx/qr.tommie.jp.conf が正
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
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="${DEPLOY_REMOTE:-vps2}"
LOCAL_CONF="deploy/nginx/qr.tommie.jp.conf"
REMOTE_CONF="/etc/nginx/sites-available/qr.tommie.jp"
HEALTH_URL="https://qr.tommie.jp/"
# Basic 認証が効いていれば未認証アクセスは 401 になる
HEALTH_EXPECT="401"

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

log() { echo ""; echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

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

echo "--- $REMOTE (現在) / +++ リポジトリ (反映後)"
diff -u --label "$REMOTE (現在)" --label "リポジトリ (反映後)" "$REMOTE_COPY" "$LOCAL_CONF" || true

# ドリフト検知: リモートの内容が git 履歴のどのバージョンとも一致しない場合、
# certbot --nginx の再実行などでサーバ側が直接書き換えられている。
# それを上書きするとサーバ側の変更が失われるため、取り込み直しを促して中断する。
log "2/5 サーバ側ドリフトの確認"
REMOTE_HASH="$(git hash-object "$REMOTE_COPY")"
DRIFTED=1
for commit in $(git log --format=%H -- "$LOCAL_CONF"); do
  if [ "$(git rev-parse "$commit:$LOCAL_CONF" 2>/dev/null)" = "$REMOTE_HASH" ]; then
    DRIFTED=0
    break
  fi
done

if [ "$DRIFTED" = "1" ]; then
  echo "リモートの内容が git 履歴のどのバージョンとも一致しない。" >&2
  echo "サーバ側で直接編集された可能性がある (certbot --nginx の再実行など)。" >&2
  echo "上書きするとその変更が失われるため中断する。" >&2
  echo "" >&2
  echo "サーバ側が正しいなら、まず取り込んでコミットすること:" >&2
  echo "  ssh $REMOTE 'cat $REMOTE_CONF' > $LOCAL_CONF" >&2
  die "ドリフトを検知した"
fi
echo "OK: リモートは過去にこのリポジトリから反映した状態"

if [ "$CHECK_ONLY" = "1" ]; then
  log "--check のため反映せず終了"
  exit 0
fi

log "3/5 転送 + 配置"
STAGE="/tmp/qr.tommie.jp.conf.$$"
BACKUP="/tmp/qr.tommie.jp.conf.bak.$$"
scp -q "$LOCAL_CONF" "$REMOTE:$STAGE"
ssh "$REMOTE" "sudo cp '$REMOTE_CONF' '$BACKUP' && sudo install -o root -g root -m 644 '$STAGE' '$REMOTE_CONF' && rm -f '$STAGE'"

log "4/5 構文検証 (nginx -t)"
# nginx -t は /etc/nginx/nginx.conf 全体を検証するため、配置後でないと試せない。
# 失敗した場合、稼働中の nginx は旧設定のままだが、壊れたファイルを残すと
# 次回の無関係な reload で落ちるため、バックアップに戻す。
if ! ssh "$REMOTE" 'sudo nginx -t' 2>&1; then
  echo "構文エラー。バックアップに戻す" >&2
  ssh "$REMOTE" "sudo install -o root -g root -m 644 '$BACKUP' '$REMOTE_CONF' && sudo nginx -t"
  die "nginx -t が失敗した (reload はしていない。サーバは旧設定のまま)"
fi

log "5/5 reload + ヘルスチェック ($HEALTH_URL)"
ssh "$REMOTE" 'sudo systemctl reload nginx'
status="$(curl -fsS -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)"
if [ "$status" != "$HEALTH_EXPECT" ]; then
  echo "想定 $HEALTH_EXPECT に対し $status が返った。バックアップに戻して reload する" >&2
  ssh "$REMOTE" "sudo install -o root -g root -m 644 '$BACKUP' '$REMOTE_CONF' && sudo nginx -t && sudo systemctl reload nginx"
  die "ヘルスチェック失敗。ロールバックした"
fi
echo "OK: HTTP $status (Basic 認証が有効)"

ssh "$REMOTE" "sudo rm -f '$BACKUP'"
log "反映完了"
