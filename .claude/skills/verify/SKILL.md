---
name: verify
description: qr-search をローカルで起動してブラウザで動作を確認する手順 (認証・レスポンシブ・JS 無効の検証)
---

# qr-search の動作確認

実際にアプリを起動し、ブラウザで駆動して観察する。テストや型チェックは
証拠にならない (CI が回している)。

## 起動

docker の db が要る (dev サーバも docker の `db-1` と同じ DB を使う)。

```bash
docker compose ps            # db-1 が healthy か確認。落ちていれば npm run db:up
npm run dev -- -p 3001       # 3000 は docker の本番相当が使っていることが多い
```

`✓ Ready in` がログに出たら起動完了。`.env` は書き換えない。

## 認証を通す (要点)

**Basic 認証ヘッダだけでは通らない。** proxy は 401 ではなく rewrite を返し、
アプリはセッション cookie (`__Host-qr_session`) を見る。ヘッダを付けた curl は
「ログインが必要です」に落ちる。

Playwright MCP の永続プロファイルには過去のセッション cookie が残っている
ことが多く、そのまま `browser_navigate` すれば入れる。入れなかった場合だけ
UI からログインし直す。

curl で叩きたいときは、ブラウザから cookie を取り出して使う:

```js
// browser_run_code_unsafe
async (page) => (await page.context().cookies('http://localhost:3001'))
  .map((c) => `${c.name}=${c.value}`).join('; ')
```

## 駆動するときの罠

- **Next.js の dev オーバーレイが左下のボタンを食う。** `<nextjs-portal>` が
  pointer events を奪い、画面左下の要素 (下部操作バーの左端スロットなど) が
  クリックできず 30 秒タイムアウトする。本番には無い要素なので退けてよい:

  ```js
  const css = 'nextjs-portal { display: none !important; }';
  await page.addStyleTag({ content: css });
  ```

- **`browser_run_code_unsafe` の中に `Buffer` / `btoa` は無い。** base64 が要る
  ときは Bash 側で作って文字列で渡す。

- **ファイル選択は直接注入する。** MCP がネイティブ chooser を横取りするため、
  `chooser.setFiles` と `browser_file_upload` が二重に走って change が 2 回
  配送される (アプリのバグに見える)。`input.files = dataTransfer.files` +
  `change` の dispatch が確実。

- dirty なエディタで reload すると beforeunload ダイアログで MCP が固まる。
  リロードせず Ctrl+A → Delete で消す。

## 見るべきこと

- **レスポンシブは数値で確かめる。** 320px と 375px で
  `document.documentElement.scrollWidth > window.innerWidth` が false であること。
  スクショの目視では横スクロールを見落とす。
- **重なりは `elementFromPoint` で確かめる。** モーダル・ハンバーガーのシート・
  下部バーは z-index が絡む。「その座標で最前面にいるのは誰か」を取るのが確実。
  `backdrop-filter` を持つ要素は `position: fixed` の包含ブロックになるため、
  全画面モーダルをその中に置くと矩形に閉じ込められる (要素の rect で判る)。
- **JS 無効の主張は生 HTML で確かめる。** サーバーアクションの form は
  `method="POST"` + `$ACTION_ID_*` の hidden として SSR される。curl でその
  form を multipart POST すれば、JS を一切使わずに動くことを証明できる:

  ```bash
  curl -s -X POST "http://localhost:3001/?q=npn" -H "Cookie: $COOKIE" \
    -F '$ACTION_ID_xxx=' -F "view=card" -i | grep -i set-cookie
  ```

  ただし **検索結果は Suspense の中なので JS 無効では届かない** (fallback の
  まま。`$RC`/`$RS` スクリプトで差し込む方式)。これは既知の制約。

## 後始末

- dev サーバを止める。
- 画像を使う検証をしたら images テーブルのテスト行を DELETE する。
- スクリーンショットを作業ツリーに残さない。
