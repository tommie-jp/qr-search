#!/usr/bin/env bash
# qr-demo の種 (qr_seed = 初期化ノート) を気軽に編集するための編集セッション
# ラッパ (docs/48-デモ種編集セッション計画.md)。
#
# これは **手元 (ローカル) から叩く** スクリプト。ssh で vps2 のデモスタックを
# 操作する。デモの初期化ノートを直す手順は docs/40 §3 の「種の撮り直し」だが、
# それを「編集を始める → ブラウザで直す → 確定する」の 2 コマンドに包む。
#
# 使い方 (詳細は -h):
#   ./doDemoSeedEdit.sh start          # 種の状態から編集を始める (timer 停止)
#   ...ブラウザで qr-demo に demo/demo で入り、ノートを編集...
#   ./doDemoSeedEdit.sh commit         # いまの live を新しい種として確定 (timer 再開)
#
# 環境変数:
#   DEMO_SSH_HOST   ssh 先 (default: vps2)
#   DEMO_DIR        リモートの compose dir (default: ~/qr-demo)
set -euo pipefail

DEMO_SSH_HOST="${DEMO_SSH_HOST:-vps2}"
DEMO_DIR="${DEMO_DIR:-qr-demo}" # $HOME からの相対。~ を渡さないのは ssh 越しの展開差を避けるため
DB_NAME="qr"
SEED_NAME="qr_seed"
DB_USER="qr"
TIMER="qr-demo-reseed.timer"
SERVICE="qr-demo-reseed.service"

log()  { echo ""; echo "==> $*"; }
info() { echo "    $*"; }
warn() { echo "WARN: $*" >&2; }
die()  { echo "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
doDemoSeedEdit.sh — qr-demo の種 (初期化ノート) 編集セッション

デモの初期化ノートは種 DB (qr_seed) の中身そのもの。毎時 0 分のリセットで
live は種へ戻る。このスクリプトは「種を撮り直す」手順 (docs/40 §3) を
編集セッションに包み、ブラウザでいつも通り直したものを新しい種にする。

使い方:
  ./doDemoSeedEdit.sh <サブコマンド> [オプション]

サブコマンド:
  start [--keep]  編集を始める。毎時リセット timer を止め、live を種の状態へ
                  戻してから編集に入る (作業を種から始めるため)。
                  --keep: live を巻き戻さない。用途は 2 つ —
                    (1) migration 後の撮り直し。migration 適用後に既定 reseed を
                        すると live が旧スキーマへ戻り app が壊れる。この場合は
                        必ず --keep を付け、直後に commit する
                    (2) 初回ブートストラップ (種がまだ無い)

  commit          いまの live を新しい種 (qr_seed) として確定し、timer を戻す。
                  app を一瞬止めて createdb -T で種を差し替える (数十秒の瞬断)。

  abort           編集を破棄する。live を現在の種へ戻し、timer を戻す。

  status          timer の状態・live/種の items 件数・直近 reseed ログを表示。
                  「timer 止めっぱなし」の確認にも使う。

  -h, --help      このヘルプを表示する。

典型的な流れ:
  ./doDemoSeedEdit.sh start
  # https://qr-demo.tommie.jp に demo/demo でログインしてノートを編集
  ./doDemoSeedEdit.sh commit

環境変数:
  DEMO_SSH_HOST   ssh 先 (default: vps2)
  DEMO_DIR        リモートの compose dir、$HOME 相対 (default: qr-demo)
USAGE
}

# リモートの compose dir で bash スクリプトを実行する。stdin にヒアドキュメントを流す。
# 呼び出し側は $DB_NAME 等をローカルで展開済みの文字列として渡す。
remote() {
  ssh "$DEMO_SSH_HOST" bash -s
}

# systemctl --user を叩く小道具。linger 直後は bus 未起動のことがあるため
# XDG_RUNTIME_DIR を明示する (docs/40 §4 の注意)。
SYSTEMCTL='XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user'

timer_state() {
  ssh "$DEMO_SSH_HOST" "XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user is-active $TIMER" 2>/dev/null || true
}

seed_exists() {
  ssh "$DEMO_SSH_HOST" bash -s <<EOF 2>/dev/null || true
cd "\$HOME/$DEMO_DIR" 2>/dev/null || exit 0
docker compose exec -T db psql -U "$DB_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$SEED_NAME'" 2>/dev/null || true
EOF
}

item_counts() {
  ssh "$DEMO_SSH_HOST" bash -s <<EOF
set -euo pipefail
cd "\$HOME/$DEMO_DIR"
for d in $DB_NAME $SEED_NAME; do
  n=\$(docker compose exec -T db psql -U "$DB_USER" -d "\$d" -tAc \
    "SELECT count(*) FROM items" 2>/dev/null || echo "?")
  echo "    \$d: \$n"
done
EOF
}

cmd_start() {
  local keep=0
  case "${1:-}" in
    --keep) keep=1 ;;
    "") ;;
    *) die "start の未知のオプション: $1 (使えるのは --keep)" ;;
  esac

  log "1/2 毎時リセット timer を止める"
  ssh "$DEMO_SSH_HOST" "$SYSTEMCTL stop $TIMER" \
    || warn "timer を止められなかった (未設置かもしれない。続行する)"

  if [ "$keep" = "1" ]; then
    log "2/2 --keep: live は巻き戻さない (いまの状態から編集を続ける)"
  elif [ "$(seed_exists)" != "1" ]; then
    log "2/2 種 ($SEED_NAME) がまだ無い → live を巻き戻さず初回作成に進む"
    info "このまま編集し、最後に commit すると初回の種になる。"
  else
    log "2/2 live を種の状態へ戻す (reseed)"
    ssh "$DEMO_SSH_HOST" "$SYSTEMCTL start $SERVICE" \
      || die "reseed に失敗した。ログ: doDemoSeedEdit.sh status"
  fi

  echo ""
  info "編集を始められる: https://qr-demo.tommie.jp に demo/demo でログイン"
  info "amber の DEMO バッジとバナーを目視すること (本番への誤爆防止)"
  info "終わったら:  ./doDemoSeedEdit.sh commit  (破棄は abort)"
}

cmd_commit() {
  # ガード: timer が生きていると start を経ていない = 毎時境界で編集が消えた恐れ
  if [ "$(timer_state)" = "active" ] && [ "${DEMO_FORCE:-0}" != "1" ]; then
    die "timer がまだ動いている。start を経ずに commit しようとしている可能性がある。
    先に './doDemoSeedEdit.sh start' で編集セッションを始めること。
    (意図的に current live を種にしたいだけなら: DEMO_FORCE=1 を付けて再実行)"
  fi

  log "いまの live ($DB_NAME) を新しい種 ($SEED_NAME) として確定する"
  # リモートで app 停止 → 接続切断 → 種の差し替え → app 起動。
  # trap で途中失敗でも app を必ず起こす (止めっぱなし事故の防止)。
  remote <<EOF
set -euo pipefail
cd "\$HOME/$DEMO_DIR"
[ -f compose.yaml ] || { echo "ERROR: \$PWD に compose.yaml が無い" >&2; exit 1; }

restart_app() { echo "==> (trap) app を起こし直す"; docker compose start app || true; }
trap restart_app EXIT

echo "==> 1/5 app 停止"
docker compose stop app

echo "==> 2/5 ${DB_NAME} への残存接続を切る"
docker compose exec -T db psql -U "$DB_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity \
   WHERE datname='$DB_NAME' AND pid <> pg_backend_pid()" >/dev/null

echo "==> 3/5 古い種を捨てる"
docker compose exec -T db dropdb --if-exists --force -U "$DB_USER" "$SEED_NAME"

echo "==> 4/5 いまの ${DB_NAME} から種を作り直す (createdb -T)"
docker compose exec -T db createdb -U "$DB_USER" -T "$DB_NAME" "$SEED_NAME"

echo "==> 5/5 app 起動"
docker compose start app
trap - EXIT
EOF

  log "検証: live と種の items 件数 (一致すること)"
  item_counts

  log "毎時リセット timer を戻す"
  ssh "$DEMO_SSH_HOST" "$SYSTEMCTL start $TIMER" \
    || warn "timer を戻せなかった。手動で: systemctl --user start $TIMER"

  echo ""
  info "確定した。次の毎時 0 分のリセットでも、いま編集した内容が残る。"
}

cmd_abort() {
  log "編集を破棄する: live を現在の種へ戻す"
  if [ "$(seed_exists)" != "1" ]; then
    warn "種がまだ無い。破棄する種状態が無いので timer を戻すだけにする。"
  else
    ssh "$DEMO_SSH_HOST" "$SYSTEMCTL start $SERVICE" \
      || die "reseed に失敗した。ログ: doDemoSeedEdit.sh status"
  fi

  log "毎時リセット timer を戻す"
  ssh "$DEMO_SSH_HOST" "$SYSTEMCTL start $TIMER" \
    || warn "timer を戻せなかった。手動で: systemctl --user start $TIMER"

  echo ""
  info "破棄した。live は種の状態に戻っている。"
}

cmd_status() {
  log "timer ($TIMER)"
  info "状態: $(timer_state)"

  log "items 件数 (live / 種)"
  if [ "$(seed_exists)" != "1" ]; then
    info "種 ($SEED_NAME) はまだ無い。"
  fi
  item_counts

  log "直近の reseed ログ"
  ssh "$DEMO_SSH_HOST" \
    "XDG_RUNTIME_DIR=/run/user/\$(id -u) journalctl --user -u $SERVICE -n 3 --no-pager" \
    2>/dev/null || info "(ログ取得不可)"
}

main() {
  local sub="${1:-}"
  case "$sub" in
    start)   shift; cmd_start "$@" ;;
    commit)  shift; cmd_commit ;;
    abort)   shift; cmd_abort ;;
    status)  shift; cmd_status ;;
    -h|--help|help|"") usage ;;
    *) die "未知のサブコマンド: $sub  (-h でヘルプ)" ;;
  esac
}

main "$@"
