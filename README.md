# qr-search

部品に貼った QR コードシール(URL 埋め込み)を読み取り、
部品 ID から情報を表示・管理する Web アプリ。

## 構成

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Prisma 7 + PostgreSQL 16
- Docker Compose(db / app / proxy)

## 開発

```bash
cp .env.example .env   # 値を設定
npm install            # postinstall で prisma generate が走る
docker compose up -d db
npx prisma migrate dev
npm run dev            # http://localhost:3000
```

## テスト

```bash
npm test
```

## 本番相当のローカル実行

```bash
./doStart.sh           # db 起動 → migrate → app 起動 → ヘルスチェック
./doStart.sh --build   # イメージを作り直してから起動
```

Caddy (HTTPS + Basic 認証) 込みで試す場合は:

```bash
docker compose --profile proxy up -d
```

## バージョンアップ

```bash
./doVersion.sh [patch|minor|major]   # 省略時: patch
```

package.json の version を上げる(作業ツリーがクリーンなら
`chore: release vX.Y.Z` のコミットとタグまで作成)。
version は画面フッターにビルド時に埋め込まれる。

## デプロイ

```bash
./doDeploy.sh
```

lint/test → イメージビルド → docker save/load で転送 →
SSH トンネル経由で DB マイグレーション → app 再作成 → ヘルスチェック、
まで一括で行う。接続先などは `DEPLOY_REMOTE` 等の環境変数で上書きできる
(詳細はスクリプト冒頭のコメント参照)。

## nginx 設定 (本番)

本番の前段は vps2 の nginx (+ certbot)。設定は
`deploy/nginx/qr.tommie.jp.conf` を**リポジトリ側を正**として管理する。

```bash
./doDeployNginx.sh --check   # 差分の確認のみ(サーバは変更しない)
./doDeployNginx.sh           # 転送 → nginx -t → reload → ヘルスチェック
```

サーバ上で直接編集しないこと。conf を編集 → `doDeployNginx.sh` の一方向で反映する。
`nginx -t` かヘルスチェックが失敗した場合は自動でバックアップに戻す。

例外は `certbot --nginx` を再実行したときで、この場合だけサーバ側の conf が
直接書き換わる(証明書の自動更新では conf は変更されない)。
`doDeployNginx.sh` はこれをドリフトとして検知して中断するので、
指示に従ってサーバ側の内容を取り込み直してからコミットする。

Basic 認証のパスワードファイル `/etc/nginx/.htpasswd-qr` は
リポジトリ管理外。再発行は vps2 で `sudo htpasswd -c /etc/nginx/.htpasswd-qr tommie`。

なお `Caddyfile` は同じ構成をローカルで再現するためのもので、本番では使わない。
**認証やアップロード制限を変えたら両方に反映すること。**

## ルーティング

| パス | 用途 |
| --- | --- |
| `/` | 一覧 + 検索(番号順 / 更新順) |
| `/item/:itemNo` | 部品表示 + メモ更新(QR の飛び先。未登録なら新規作成) |
| `/edit/:itemNo` | mode / memo / url の編集 |
| `/print/:itemNo` | QR コード印刷 |

## データ移行 (Ver1 → Ver2)

Ver1 (MongoDB) の mongoexport 出力を取り込む(冪等):

```bash
npx tsx scripts/migrateFromVer1.ts <item.json のパス>
```
