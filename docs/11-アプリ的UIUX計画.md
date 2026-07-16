# アプリ的な操作感 (UI/UX) の計画 (Ver2.x)

PWA としてホーム画面から起動できるようになったが、中身の挙動はまだ
「Webページ」で、押しても無反応な時間・ぶつ切りの画面切り替え・
二重送信の余地が残っている。ここを段階的に「アプリ的な動き」へ寄せる
計画をまとめる。**実装はまだしていない。設計判断の記録が目的。**

前提: 素の GET フォーム / リンク / Server Action で JS 無効でも動く現在の
設計は壊さない。JS が効く環境で体感だけを上乗せする (プログレッシブ拡張)。

## 0. 現状の「Webページ的」な点 (棚卸し)

全ページ `force-dynamic` で毎回 DB を引くため、操作からサーバ応答までの
待ちが構造的に発生する。その待ちが可視化されていないのが体感の大半を占める。

- 「更新」を押しても無反応のまま止まって見える。連打で二重送信もできる
- リンク (編集 / QR / タグ / ページャ) を押しても遷移完了まで何も起きない
- 画面切り替えがぶつ切り (アニメーションなし)
- 編集中にリンクを踏む・タブを閉じると未保存の本文が黙って消える
- 保存後のフィードバックがない (いきなり /item に戻るだけ)
- undo は Ctrl+Z で効く (CodeMirror basicSetup の history) が、
  モバイルには押すボタンがない
- standalone 起動時はブラウザの戻るボタンがなく、ジェスチャー頼み
- 操作系が text-sm の下線リンクで、タップターゲットが小さい

## 1. Phase 1: 押した感と待ちの可視化 (最小の変更で効果最大)

体感の問題は「遅い」ではなく「反応がない」。まず全操作に即時の反応を付ける。

### 1-1. 更新ボタンの pending 表示 (README の TODO)

`useFormStatus` を使う `<SubmitButton>` を components/ に切り出し、
/edit と /item の編集フォームで使う。送信中は「更新中です…」+ `disabled` に
して、二重送信防止も同時に済ませる。

- form の子コンポーネントでないと `useFormStatus` が効かないため、
  ボタンだけ client component に分ける (ページは server component のまま)
- MemoEditorInner の「アップロード中は送信ブロック」とは独立に共存する
  (あちらは submit イベントの preventDefault、こちらは action 実行中の表示)

### 1-2. リンク遷移の pending 表示

Next 16 の `useLinkStatus` で、押したリンクにスピナー (または不透明度) を
出す。対象は操作頻度の高い 編集 / 一覧へ / 表示へ / ページャ。
`loading.tsx` (1-3) と重なるので、両方入れて過剰なら片方に絞る。

### 1-3. loading.tsx でスケルトン表示

`/` `/item/[itemNo]` `/edit/[itemNo]` に `loading.tsx` を置く。
force-dynamic なので遷移時に即座に骨組みが出て、体感の「止まってる時間」が
消える。スケルトンは凝らず、見出し + 枠のグレー矩形程度 (KISS)。

### 1-4. タップの視覚反応とターゲットサイズ

- ボタン・リンクに `active:` スタイル (押した瞬間に沈む/色が変わる)
- 操作系リンク (編集 / QR / 記法 など) をボタン風の見た目にし、
  タップターゲットを 44px 相当に広げる

## 2. Phase 2: 編集画面をアプリ的に

### 2-1. 更新ボタンの下部固定 (README の TODO)

編集フォームのボタン行を `position: sticky; bottom: 0` + `pb-safe` で
画面下に固定する。長文でもスクロールせずに保存できる。
1-1 の pending 表示と同じボタンを固定するだけで、実装は独立。

### 2-2. 未保存変更の離脱ガード

本文が defaultValue から変わっていたら `beforeunload` で確認を出す
(タブ閉じ・リロード・シール再スキャンによる離脱)。
Next のクライアント遷移 (Link) には組み込みのガードがないため、
まず beforeunload だけ入れる。Link 遷移のガードはコストの割に
編集ページ内のリンクが少なく、見送り (§6)。

### 2-3. 保存後のトースト

更新 → `/item` リダイレクトの直後に「保存しました」を 2 秒ほど出す。
redirect 先 URL に `?saved=1` を付け、クライアントで表示後に
`history.replaceState` で消す (リロードや共有で再表示されないように)。
flash cookie より単純で、サーバ状態も持たない。

### 2-4. undo / redo ボタン (README の TODO「編集：undo」)

CodeMirror の history は既定で有効なので、エディタ下のツールバー
(「画像を挿入」の並び) に undo / redo ボタンを足して
`undo(view)` / `redo(view)` を呼ぶだけ。新規の状態管理は不要。

## 3. Phase 3: 検索をその場更新に (README の TODO「インクリメンタルサーチ」)

- 入力を debounce (300ms 程度) して `router.replace(/?q=…)` +
  `useTransition`。URL が正なのは今と同じで、共有・戻るも壊れない
- `isPending` 中は結果一覧を薄くしてスピナーを出す
- GET フォームはそのまま残す (JS 無効・IME 確定前の Enter 検索の経路)
- タグ補完ドロップダウンとの競合 (入力ごとの遷移で候補が閉じないか) を
  実装時に確認する

## 4. Phase 4: 画面遷移アニメーション (View Transitions)

`next.config.ts` の `experimental.viewTransition` + React の
`<ViewTransition>` で、一覧 → 詳細をフェード/スライドさせる。

- 非対応ブラウザではアニメーションなしで普通に動く (劣化なし)
- **experimental なので最後に薄く入れる**。Next のバージョンアップで
  壊れたら外せる程度の使い方 (共有要素モーフィングまではやらない) に留める

## 5. Phase 5: standalone (ホーム画面起動) の作法

- `@media (display-mode: standalone)` のときだけヘッダに「←戻る」を出す
  (`history.back()`)。ブラウザで開いたときは出さない
- ヘッダを `position: sticky; top: 0` で固定し、深くスクロールしても
  検索・ホームに戻りやすくする

## 6. やらないこと

- **SPA 全面化・クライアント状態管理の導入**: サーバが正・URL が正の
  現在の設計が、単一ユーザ + QR シール起点のこのアプリには合っている
- **Service Worker / オフライン**: docs/06 の別計画。manifest.ts の
  コメントの通り、現状はオフラインにできる操作がほぼない
- **ピンチズーム禁止**: layout.tsx のコメントの通り、細かい型番を
  拡大できなくなるので `maximum-scale` は指定しない
- **Link 遷移の未保存ガード**: 2-2 に記載。beforeunload のみ
- **文字サイズ変更・テーマ**: README の別 TODO のまま (この計画の範囲外)

## 7. 実施順

効果/コスト比の順。各 Phase は独立していて、途中でやめても壊れない。

| 順 | 内容 | 規模感 |
| --- | ------ | -------- |
| 1 | Phase 1: pending・loading.tsx・active | 小。SubmitButton + loading 3 枚 + CSS |
| 2 | Phase 2: ボタン固定・離脱ガード・トースト・undo | 小〜中。編集画面に閉じる |
| 3 | Phase 5: standalone 戻る・sticky ヘッダ | 小。layout に閉じる |
| 4 | Phase 3: インクリメンタルサーチ | 中。SearchForm の作り替え + 補完との調整 |
| 5 | Phase 4: View Transitions | 小だが experimental。最後 |
