// アップロード / OCR の進捗表示に使う日本語ボタンラベルの整形。
// 表示文字列そのものを単体テストできるようにここへ分離する。
//
// **% は React state で描くボタン・バナーにだけ出す。本文 (markdown) の
// プレースホルダは静的なままにする** — % で毎回書き換えると、履歴に積まない
// 変更が undo の逆変換位置をずらし、undo し切っても壊れたトークンが本文に
// 残る (E2E で実際に発生した)。
//
// OCR 側に % が無いのは、認識中はメインスレッドが塞がって再描画自体が
// 走らないため (ocrService.ts の ocrImageToQuote 冒頭を参照)。件数だけ出す。

// 進行中アップロードの表示用スナップショット (current は 1 始まり)。
// percent が null なのは送信量を測れない環境 (lengthComputable = false)
export interface UploadProgress {
  current: number
  total: number
  percent: number | null
}

export function uploadButtonLabel(progress: UploadProgress | null): string {
  if (progress === null) {
    return '画像を挿入'
  }
  const { current, total, percent } = progress
  const suffix = percent === null ? '' : ` ${percent}%`
  if (total > 1) {
    return `アップロード中 ${current}/${total}枚${suffix}`
  }
  return `アップロード中…${suffix}`
}

export function ocrButtonLabel(taskCount: number): string {
  if (taskCount === 0) {
    return '画像をOCR'
  }
  return taskCount > 1 ? `OCR処理中 (${taskCount}件)…` : 'OCR処理中…'
}
