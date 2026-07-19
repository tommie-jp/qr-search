// 埋め込みモデルの初回読み込みの状態遷移 (docs/11-画像検索調査メモ.md)。
//
// 落ちたら新しい Worker で 1 度だけ組み直す、という再試行を純関数に切り出す。
// Worker の生成・破棄という副作用は useImageEmbedder が持ち、ここは「次に何を
// すべきか」だけを決める (Worker なしでテストできるようにするため)。
//
// 1 回目・再試行ともデバイスは WASM (useImageEmbedder の spawn(true))。
// それでも再試行に意味があるのは、失敗が realm にラッチされる仕組み上、
// 一時的な失敗 (モデル取得の失敗など) は新しい Worker でしか救えないため。

export type EmbedderPhase =
  // 1 回目の読み込み中
  | 'loading'
  // 1 回目が落ち、新しい Worker (WASM 強制) で読み直している最中
  | 'retrying-wasm'
  | 'ready'
  | 'failed'

export interface EmbedderLoadState {
  phase: EmbedderPhase
  // 失敗が確定したときの生の理由。phase === 'failed' のときだけ入る
  failureMessage: string | null
}

export type EmbedderLoadEvent =
  | { type: 'ready' }
  // モデルを用意できなかった (preload の load-error、または 1 度も ready に
  // ならないままの埋め込みエラー)
  | { type: 'load-failure'; message: string }

export const INITIAL_EMBEDDER_LOAD_STATE: EmbedderLoadState = {
  phase: 'loading',
  failureMessage: null,
}

export function reduceEmbedderLoad(
  state: EmbedderLoadState,
  event: EmbedderLoadEvent,
): EmbedderLoadState {
  if (event.type === 'ready') {
    return { phase: 'ready', failureMessage: null }
  }
  // 読み込み済みなら、1 枚の失敗は壊れたフレームであってモデル不調ではない
  if (state.phase === 'ready') {
    return state
  }
  if (state.phase === 'loading') {
    // まだ諦めない。新しい Worker で組み直せば救える失敗がある。
    // 1 回目の理由は UI に出さず、再試行の結末を待つ
    return { phase: 'retrying-wasm', failureMessage: null }
  }
  // retrying-wasm か failed。作り直しても駄目なら打つ手はないので確定させる
  return { phase: 'failed', failureMessage: event.message }
}

// 遷移を見て「WASM 強制の Worker を起こし直す番か」を判定する。
// 再試行の開始は 1 度きり (retrying-wasm へ入った瞬間) なので、状態を見比べる
// だけで済み、呼び手が回数を数えなくてよい。
export function needsWasmRespawn(
  prev: EmbedderLoadState,
  next: EmbedderLoadState,
): boolean {
  return prev.phase !== 'retrying-wasm' && next.phase === 'retrying-wasm'
}
