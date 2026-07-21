#!/usr/bin/env bash
# vps2 の私設レジストリに溜まった古い qr-search-app イメージを掃除する。
# 各デプロイで変わる .next の層 (~55MB 圧縮) が版ごとに積もるため、時々実行する。
#
# 既定は dry-run (消さずに対象を表示するだけ)。実際に消すには --apply を付ける。
# 新しい方から $KEEP 版 (既定 5) を残し、それより古い version タグの manifest を削除して
# から registry の garbage-collect で blob を回収する。$KEEP はロールバック用の余裕。
#
# 環境変数 (doDeploy.sh と共通):
#   DEPLOY_REMOTE        ssh 接続先 (default: vps2)
#   DEPLOY_REGISTRY_DIR  リモートのレジストリ compose ディレクトリ (default: registry)
#   DEPLOY_REGISTRY_REMOTE_PORT  registry 待受ポート (default: 5000)
#   GC_KEEP              残す版数 (default: 5)
set -euo pipefail

REMOTE="${DEPLOY_REMOTE:-vps2}"
REGISTRY_DIR="${DEPLOY_REGISTRY_DIR:-registry}"
PORT="${DEPLOY_REGISTRY_REMOTE_PORT:-5000}"
KEEP="${GC_KEEP:-5}"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

# 実処理はレジストリのあるリモート側で完結させる (API も GC もローカルにするより素直)。
ssh "$REMOTE" "REPO=qr-search-app PORT='$PORT' KEEP='$KEEP' APPLY='$APPLY' REGISTRY_DIR='$REGISTRY_DIR' bash -s" <<'REMOTE_EOF'
set -euo pipefail
base="http://127.0.0.1:${PORT}/v2/${REPO}"
accept='Accept: application/vnd.oci.image.manifest.v1+json'
accept2='Accept: application/vnd.docker.distribution.manifest.v2+json'

tags="$(curl -fsS "${base}/tags/list" | python3 -c 'import sys,json; print("\n".join(json.load(sys.stdin).get("tags") or []))' | grep -E '^v[0-9]' | sort -V || true)"
[ -n "$tags" ] || { echo "version タグ無し。掃除不要。"; exit 0; }

total="$(printf '%s\n' "$tags" | wc -l)"
keep_list="$(printf '%s\n' "$tags" | tail -n "$KEEP")"
del_list="$(printf '%s\n' "$tags" | head -n "-${KEEP}" || true)"

echo "全 ${total} 版。残す: $(printf '%s ' $keep_list)"
if [ -z "$del_list" ]; then echo "削除対象なし。"; exit 0; fi
echo "削除対象: $(printf '%s ' $del_list)"

if [ "$APPLY" != "1" ]; then
  echo "(dry-run。実際に消すには --apply を付ける)"
  exit 0
fi

for t in $del_list; do
  dig="$(curl -fsS -I -H "$accept" -H "$accept2" "${base}/manifests/${t}" | tr -d '\r' | awk -F': ' 'tolower($1)=="docker-content-digest"{print $2}')"
  [ -n "$dig" ] || { echo "  $t: digest 取得できず、スキップ"; continue; }
  curl -fsS -X DELETE "${base}/manifests/${dig}" && echo "  $t ($dig) を削除"
done

echo "==> garbage-collect (blob 回収)"
cd "$REGISTRY_DIR"
docker compose exec -T registry registry garbage-collect /etc/docker/registry/config.yml
echo "OK: 掃除完了"
REMOTE_EOF
