// OCR Worker とメインスレッドのやり取り (docs/24-画像OCR計画.md §9-1)。
// 画像検索の workerMessages.ts と同じ組み立て。id で要求と応答を対応づける。

export type ToOcrWorker =
  // モデルを前もって読み込む (最初の画像を待たずに始める)
  | { type: 'preload' }
  | { type: 'ocr'; id: number; blob: Blob }

export type FromOcrWorker =
  // モデル tar の受信バイトから作った DL 進捗 %
  | { type: 'model-progress'; percent: number }
  // 初回のモデル読み込みが終わった
  | { type: 'ready' }
  | { type: 'result'; id: number; quote: string }
  | { type: 'error'; id: number; message: string }
  // モデルを用意できなかった (要求 1 件の失敗ではなく初期化の失敗)
  | { type: 'load-error'; message: string }
