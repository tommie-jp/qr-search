// 画像検索の埋め込み Worker とやり取りするメッセージの型 (docs/25-画像検索計画.md §6)。
// 推論はメインスレッドを塞がないよう Worker で回すので、フレーム 1 枚を渡して
// ベクトル 1 本を受け取る往復だけを定義する。

// メイン → Worker
export type ToEmbedWorker =
  // 初回モデル読み込みを前もって温める (モーダルを開いた時点で送る)
  | { type: 'preload' }
  // このフレームを埋め込む。id で応答を対応づける。bitmap は transfer で渡す
  | { type: 'embed'; id: number; bitmap: ImageBitmap }

// Worker → メイン
export type FromEmbedWorker =
  // 初回モデル読み込みが完了した (UI の「準備中」を畳む)
  | { type: 'ready' }
  // 埋め込み成功。vector は transfer で返る (正規化済み Float32Array)
  | { type: 'result'; id: number; vector: Float32Array }
  // 埋め込み失敗 (壊れたフレーム・モデル不調など)
  | { type: 'error'; id: number; message: string }
