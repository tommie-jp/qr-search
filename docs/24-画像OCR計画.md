# 画像OCRの設計 (Ver2.x)

memo に挿入した画像の文字をクライアントサイドで OCR し、
**画像の直後に引用ブロックとして挿入**する。memo 本文に入るので
PGroonga の全文検索がそのまま効き、誤認識は保存前に人間が直せる。
ここでは設計判断を残す。

前提の調査: ワークスペース側 `docs/10-画像OCR調査メモ.md`
(エンジン比較・検索対象化方式・日本語優先の3方式)。
**このメモは計画のみ。実装はまだ行わない。**(2026-07-18)

## 1. 方針: クライアントで OCR し、結果は memo が正本

導線の全体像:

```text
編集ページで画像を挿入
  → 画像リンクを即挿入 + 直後に「> (OCR処理中…)」プレースホルダ
  → Web Worker で OCR (ブラウザ内完結。サーバに画像を再送しない)
  → プレースホルダを引用ブロックの認識結果で置換
  → ユーザーが誤認識を直して「更新」
  → memo に入った時点で全文検索の対象になる
```

- **結果の正本は memo 本文**。tags / props と同じく「派生情報は memo から」
  の設計に合わせ、DB に OCR 専用列は作らない
- 書誌自動取得 (docs/13) と同じ「**待たない**」流儀。挿入も編集も
  ブロックせず、結果は届いたら後から載る

## 2. エンジン: PaddleOCR 公式ブラウザ SDK + 正規化表 (②方式)

- モデルは **PP-OCRv5 の統合 mobile モデル** (det 4.8MB + rec 16.7MB)。
  onnxruntime-web (WASM、対応端末では WebGPU) でブラウザ内実行
- ライブラリは公式ブラウザ SDK
  [@paddleocr/paddleocr-js](https://www.npmjs.com/package/@paddleocr/paddleocr-js)
  (Apache-2.0)

### 縦書き対応 (2026-07-18 に差し替え)

当初は [ppu-paddle-ocr](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr)
を使っていたが、**日本語の縦書きがほぼ読めなかった**。切り分けの結果:

- モデルの問題ではない。同じ PP-OCRv5 を使う公式デモでは実画像の縦書きが読めた
- 原因は **SDK 側のパイプライン**。ppu-paddle-ocr は検出した矩形をそのまま
  認識モデルに渡すだけで、公式パイプラインにある
  「**縦横比 1.5 以上のクロップは 90 度回してから認識**」が無い。
  認識モデルは横一行を前提にしているので、縦長の列を渡すと潰れて全滅する

公式 SDK はこの回転を実装済み (`crop.ts`) なので、そちらへ乗り換えた。

- **読み順は自前で組む**。`predict()` が返す items は検出器の出力順であって
  読み順ではない。`src/lib/ocr/orderOcrItems.ts` で
  「縦長の箱が多数派なら縦書き」と判定し、縦書きは列を右→左・列内を上→下、
  横書きは行を上→下・行内を左→右に並べ替える
- **textline orientation は使えない**。公式 SDK の npm 版 (0.4.2) では
  `use_textline_orientation` が "config will be ignored for now" 扱いで
  未実装 (`unsupportedFeatures` に入る)。上下反転の列があると弱いはずだが、
  実測では縦書きが正しく読めているので今は足りている
- **日本語優先は後処理で実現する**: 統合モデルは中国語コーパスの影響で
  「単→单」「類→类」のような簡体字コードポイントを出すことがある。
  **簡体字/繁体字→日本語新字体の正規化表**を認識結果に 1 段かませる
- 旧世代の日本語専用モデル (PP-OCRv3 japan、辞書が日本語のみで混入ゼロ)
  は対抗案だったが、**まずは最新統合モデル + 正規化表で試す**(採用判断)。
  スパイク (§7 Phase 0) で混入率が想定より高ければ専用モデルに切り替える
- 「冷」のような日中同一コードポイントの字形差はフォント表示の問題であり、
  本アプリ (日本語ページ) では正しく表示される。OCR の誤りではない

## 3. モデルの配布: ローカル同梱 + 遅延ロード

- zxing-wasm と同じく **`scripts/` のコピースクリプトでローカル同梱**し、
  CDN に依存しない (PWA・オフライン方針と整合)
- **モデルの自前配布は必須**であって好みの問題ではない。SDK の既定は
  百度の CDN (`paddle-model-ecology.bj.bcebos.com`) から直接取るが、そこは
  **Access-Control-Allow-Origin を返さずブラウザから CORS で弾かれる**
  (実機で確認)。`scripts/fetchPaddleOcrModels.mjs` が `public/paddle-ocr/` へ
  落とし、`ocrService.ts` が同 URL を指す。
  モデル名は tar 内 `inference.yml` の `model_name` と一致が必要
- モデル (数 MB) はページロードでは読まず、**初回の OCR 実行時に遅延ロード**。
  Service Worker キャッシュで 2 回目以降は即時
- 初回は「準備しています (初回のみ)」の表示を出す

## 4. エディタ統合

- **挿入フォーマットは引用ブロック**。OCR 由来と一目で分かり、
  直しやすく、検索も普通に効く

  ```markdown
  ![](/api/images/xxx.jpg)

  > 冷却ファン 12V 0.1A
  > DC FAN 40mm
  ```

- 処理中は `> (OCR処理中…)` を置き、完了時に CodeMirror の位置追跡で
  置換する (ユーザーが打鍵中でも正しい場所に入る)
- **後から OCR**: 編集ツールバーに「OCR」ボタン。カーソル位置の画像記法を
  対象に `/api/images/<name>` を fetch して実行。
  **挿入時 OCR と同一関数に集約**する (経路が 2 つ、処理は 1 つ)
- 失敗・0 文字のときは黙らない: 「文字が見つかりませんでした」を明示して
  プレースホルダを除去する
- 再 OCR で引用が二重になったら手で消す (個人アプリなので KISS)

## 5. 検索

- memo に入るため**検索側の実装はゼロ**
- 検索結果一覧の「タイトル + 3 行」要約に OCR テキストが混ざる件は、
  まず許容して様子を見る。邪魔なら要約側で引用行をスキップする

## 6. テスト

- エンジン本体はモックし、**挿入ロジック (プレースホルダ置換・位置追跡) と
  正規化表**をユニットテストする
- 認識精度そのものはテストではなく Phase 0 のスパイクで実画像確認

## 7. 実装フェーズ

- **Phase 0: スパイク (残: 実機で要確認)**
  - 実画像 (部品ラベル・紙面の写真) で統合モデルの精度と簡体字混入率を実測
  - アップロード時圧縮後の画像で精度が足りるか
    (足りなければ圧縮前の原画像で OCR してからアップロード)
  - iPhone の WASM 実行速度とメモリ
- **Phase 1: OCR 基盤 (実装済み)** — `@paddleocr/paddleocr-js` +
  `onnxruntime-web`、ort wasm の自前配布
  (`scripts/copyOnnxWasm.mjs` → `public/onnxruntime/`)、モデルの自前配布
  (`scripts/fetchPaddleOcrModels.mjs` → `public/paddle-ocr/`)、
  正規化表 (`src/lib/ocr/normalizeJapanese.ts`)。Web Worker は未 (下記)
- **Phase 2: 挿入時 OCR (実装済み)** — 画像挿入後にプレースホルダを差し込み、
  `ocrImageToQuote` で認識 → 引用ブロックに置換。処理中/初回 UI、
  0 文字・失敗時のメッセージ (`MemoEditorInner.tsx`)
- **Phase 3: 後から OCR (実装済み)** — ツールバー「画像をOCR」ボタン。
  カーソル近傍の自前画像を取り直して OCR (Phase 2 と同一関数 `ocrIntoDoc`)

### 実装の構成 (2026-07-18)

| ファイル | 役割 | テスト |
| --- | --- | --- |
| `src/lib/ocr/normalizeJapanese.ts` | 簡体字/繁体字→新字体の正規化 (②) | あり |
| `src/lib/ocr/ocrQuote.ts` | 引用整形・プレースホルダ・画像特定 | あり |
| `src/lib/ocr/orderOcrItems.ts` | 読み順 (縦書き右→左 / 横書き上→下) | あり |
| `src/components/ocr/ocrService.ts` | 公式 SDK 遅延ロード・認識 | 実機 |
| `src/components/MemoEditorInner.tsx` | エディタ結線 (挿入時/後から) | — |
| `scripts/copyOnnxWasm.mjs` | ort wasm を自前配布 | — |
| `scripts/fetchPaddleOcrModels.mjs` | 認識モデルを自前配布 | — |

検証済み: 型チェック・eslint・`next build`・ユニットテスト (801 通過)。

**実機 E2E (2026-07-18)**: dev サーバ + Playwright で編集画面に画像を注入し、
挿入時 OCR を実行して確認した。

- 縦書き (3 列の印刷体): `電子部品の在庫整理` / `抵抗器と蓄電器の箱` /
  `冷却装置は棚の上段` を**列の順序も文字も誤りなく**認識
- 横書き (3 行): `冷却ファン12V0.1A` / `DC FAN 40mm 在庫3個` /
  `抵抗器 10kΩ1/4W` を正しく認識 (空白の有無だけ原文と差がある)
- 初回はモデル 21MB のロードで待つが、2 枚目以降は数秒
- コンソールに出る onnxruntime の `Removing initializer ...` は無害な警告

### ビルド上の注意 (Turbopack)

公式 SDK には**ブラウザでは通らない分岐**が残っており、Turbopack が静的解析で
追いかけて `next build` を落とす:

- 同梱 OpenCV.js (Emscripten) の Node 判定内 `require("fs")`
- 同梱 worker アセットが探す `ort.bundle.min.mjs`

どちらも実行時には踏まない (worker モードを使わない) ので、`next.config.ts` の
`turbopack.ignoreIssue` で SDK 配下の未解決を無視する。`path` は **glob ではなく
RegExp** で書く必要があり、範囲も `dist/assets/` に絞ると OpenCV.js
(SDK の node_modules にネスト) が漏れて落ちる。

### 既知の未了 (次に詰める)

- **Web Worker 化**: 現状はメインスレッド実行 (処理中は UI に出す)。
  公式 SDK は `worker: true` を持つので、重い画像で固まるようならそれに乗る
- **正規化表**: 実画像で出た簡体字を `normalizeJapanese.ts` に追記していく
  (E2E で使った印刷体では混入なし)
- **上下反転の縦書き列**: textline orientation が SDK 未実装なので弱いはず。
  実害が出たら SDK の対応を待つか、自前で列画像を反転して再認識する

## 8. 見送り (必要になったら)

- 既存全画像の一括バッチ OCR (個別ボタンで足りる。要るなら Node 側で)
- `<details>` 折りたたみ挿入 (rehype-sanitize が通すか未確認。引用で開始)
- 再 OCR 時のマーカー置換 (手で消せば済む)
- デコード時の文字集合制限 (③方式。②で足りるなら不要)
