// OCR サービスをいつ解放してよいかの判定 (docs/24-画像OCR計画.md §9-1)。
//
// OCR の singleton は OpenCV.js と onnxruntime-web の wasm ヒープを抱えるため、
// 編集画面を離れたら解放したい。ただし**認識中に ORT セッションを release すると
// 挙動が保証されない**ので、走っている OCR が捌けるまで待つ必要がある。
//
// 待ち合わせの判断だけをここに純関数で置き、実際の解放 (dispose の呼び出し・
// singleton の破棄) は ocrService が持つ。embedderLoadState と同じ組み立て方で、
// SDK もモデルも無しでテストできるようにするため。

export interface OcrDisposeState {
  // 実行中の OCR の本数 (複数画像を続けて OCR できるので 2 以上になりうる)
  inFlight: number
  // 解放を頼まれたか。走っている OCR があれば、捌けるまで持ち越す
  disposeRequested: boolean
}

export type OcrDisposeEvent =
  | { type: 'ocr-start' }
  | { type: 'ocr-end' }
  | { type: 'dispose-request' }
  // 実際に解放し終えた (持ち越していた要求を下ろす)
  | { type: 'dispose-run' }

export const INITIAL_OCR_DISPOSE_STATE: OcrDisposeState = {
  inFlight: 0,
  disposeRequested: false,
}

export function reduceOcrDispose(
  state: OcrDisposeState,
  event: OcrDisposeEvent,
): OcrDisposeState {
  switch (event.type) {
    case 'ocr-start':
      // 新しい OCR が始まったなら、持ち越していた解放要求は取り下げる。
      // 画面を離れた後で戻ってきた場合に、使っている最中のモデルを
      // 捨ててしまわないため (離れるときに改めて頼まれる)
      return { inFlight: state.inFlight + 1, disposeRequested: false }
    case 'ocr-end':
      // 0 を下回らせない。負になると shouldDisposeNow が二度と true にならず、
      // 解放の要求が永久に持ち越される
      return { ...state, inFlight: Math.max(0, state.inFlight - 1) }
    case 'dispose-request':
      return { ...state, disposeRequested: true }
    case 'dispose-run':
      return { ...state, disposeRequested: false }
  }
}

// いま解放してよいか。頼まれていて、かつ走っている OCR が無いとき。
export function shouldDisposeNow(state: OcrDisposeState): boolean {
  return state.disposeRequested && state.inFlight === 0
}
