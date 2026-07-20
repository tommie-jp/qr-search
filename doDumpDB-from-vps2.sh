#!/usr/bin/env bash
#
# 本番 (vps2) の DB のバックアップを取る。ローカルから実行する。
# 出力先: backup/vps2-before-import_<timestamp>.dump
#
# 取り込み (./doImportEnex.sh) は書き込む前にこれと同じダンプを自動で取るので、
# 普段はそちらに任せてよい。これは「いま手で 1 本取っておきたい」ときのもの。
#
# 戻すとき (本番へ):
#   cat backup/vps2-before-import_<timestamp>.dump |
#     ssh vps2 "cd 41-QR-search/qr-search &&
#       docker compose exec -T db pg_restore --clean --if-exists --no-owner -U qr -d qr"
#
# set -euo pipefail と中身の検査が要点。**これが無いと ssh が失敗しても
# リダイレクトで 0 バイトのファイルが残り、「バックアップがある」ように
# 見えてしまう**。巻き戻しの唯一の手段なので、空なら失敗として扱う。
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="${DUMP_REMOTE:-vps2}"
REMOTE_DIR="${DUMP_REMOTE_DIR:-41-QR-search/qr-search}"
OUT="backup/vps2-before-import_$(date +%Y%m%d_%H%M%S).dump"

mkdir -p backup
ssh "$REMOTE" "cd '$REMOTE_DIR' && docker compose exec -T db pg_dump -U qr -d qr -Fc" > "$OUT"

if [ ! -s "$OUT" ]; then
  rm -f "$OUT"
  echo "ERROR: ダンプが空。$REMOTE の db が起動しているか確認すること" >&2
  exit 1
fi

du -h "$OUT"
