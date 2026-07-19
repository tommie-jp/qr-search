// 埋め込み Worker をひとつ抱え、フレーム → ベクトルの往復を Promise で扱うフック
// (docs/25-画像検索計画.md §6)。id で要求と応答を対応づける。
//
// モデルの読み込みに失敗したら、**Worker を作り直して** 1 度だけ読み直す。
// 同一 Worker 内で組み直しても必ず失敗する (transformers.js と ort が失敗を
// realm 単位でラッチする。理由は embedder.ts の getExtractor に書いた) ため、
// 再試行には新しい Worker が要る。判断は embedderLoadState の純関数が持つ。
//
// 1 回目から WASM で組む (spawn(true))。以前は WebGPU → 失敗したら WASM の
// 順だったが、iPhone では必ず OOM で落ちて二度手間になるだけだった。

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  INITIAL_EMBEDDER_LOAD_STATE,
  needsWasmRespawn,
  reduceEmbedderLoad,
  type EmbedderLoadState,
} from './embedderLoadState'
import type { FromEmbedWorker, ToEmbedWorker } from './workerMessages'

interface Pending {
  resolve: (vector: Float32Array) => void
  reject: (error: Error) => void
}

export interface ImageEmbedder {
  // 初回モデル読み込みが完了したか (UI の「準備中(初回)」を畳むのに使う)
  ready: boolean
  // モデルの初回読み込みに失敗したか。WASM での再試行も駄目だったときだけ
  // 立つ。ライブ検索は失敗を握りつぶすので、これを UI に出さないと
  // 「カメラは映るが何も出ない」原因が分からなくなる
  failed: boolean
  // 失敗したときの生の理由。「通信環境を確認して」だけでは通信以外の原因
  // (端末のメモリ不足、自前配布アセットの欠落など) に辿り着けないので添えて出す。
  failureMessage: string | null
  // フレーム 1 枚 → 正規化済みベクトル。bitmap は Worker へ transfer される
  embed: (bitmap: ImageBitmap) => Promise<Float32Array>
}

export function useImageEmbedder(): ImageEmbedder {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef(new Map<number, Pending>())
  const nextIdRef = useRef(1)
  // 読み込み状態はレンダーにも出すが、メッセージ処理の中では最新値を同期で
  // 見たいので ref にも持つ (state のクロージャは古い値を掴む)
  const loadStateRef = useRef(INITIAL_EMBEDDER_LOAD_STATE)
  const [loadState, setLoadState] = useState(INITIAL_EMBEDDER_LOAD_STATE)

  useEffect(() => {
    const pending = pendingRef.current
    // アンマウント後に Worker を起こし直さないための番兵
    let disposed = false

    // 未解決の要求をまとめて落とす。放っておくと呼び手が永遠に待つ
    const rejectPending = (reason: string) => {
      for (const entry of pending.values()) {
        entry.reject(new Error(reason))
      }
      pending.clear()
    }

    const applyEvent = (state: EmbedderLoadState) => {
      loadStateRef.current = state
      setLoadState(state)
    }

    const handleLoadFailure = (message: string) => {
      const prev = loadStateRef.current
      const next = reduceEmbedderLoad(prev, { type: 'load-failure', message })
      applyEvent(next)
      if (needsWasmRespawn(prev, next)) {
        spawn(true)
      }
    }

    function spawn(forceWasm: boolean): void {
      // 前の Worker は捨てる。realm を作り直さないと WASM で組み直せない
      workerRef.current?.terminate()
      workerRef.current = null
      rejectPending('画像検索モデルを読み込み直しています')
      if (disposed) {
        return
      }

      const worker = new Worker(new URL('./embedWorker.ts', import.meta.url), {
        type: 'module',
      })
      workerRef.current = worker

      worker.onmessage = (event: MessageEvent<FromEmbedWorker>) => {
        const msg = event.data
        if (msg.type === 'ready') {
          applyEvent(reduceEmbedderLoad(loadStateRef.current, { type: 'ready' }))
          return
        }
        if (msg.type === 'load-error') {
          // どちらのデバイスで落ちたかはコンソールにだけ残す。UI に出しても
          // 読み手に意味がないが、後から報告を追うときはこれが手掛かりになる
          console.warn(
            `画像検索モデルを ${msg.device} で読み込めませんでした`,
            msg.message,
          )
          handleLoadFailure(msg.message)
          return
        }
        const entry = pending.get(msg.id)
        if (!entry) {
          return
        }
        pending.delete(msg.id)
        if (msg.type === 'result') {
          entry.resolve(msg.vector)
          return
        }
        // フレーム 1 枚の失敗は読み込みの失敗として扱わない。Worker は必ず
        // preload するので、モデルを用意できなければ load-error が必ず来る。
        // ここで読み込み失敗に混ぜると、壊れたフレーム 1 枚で Worker を
        // 作り直して (読み込み中なら数十 MB の取得をやり直して) しまう
        entry.reject(new Error(msg.message))
      }

      // Worker 自体が起動できない (チャンクの 404、import の失敗など) と
      // onmessage は一生呼ばれない。拾わないと「準備しています」で固まる
      worker.onerror = (event: ErrorEvent) => {
        handleLoadFailure(event.message || 'Worker を起動できませんでした')
      }

      // モデルを前もって温める (最初のフレームを待たずに読み込み始める)
      worker.postMessage({ type: 'preload', forceWasm } satisfies ToEmbedWorker)
    }

    // 最初から WASM で組む。WebGPU を先に試すと、iPhone では
    // 「アダプタは取れる → 初期化で OOM → Worker を作り直して WASM」と
    // 必ず二度手間になり、その 1 回目が確保したメモリが解放される保証も無い。
    // OCR 側も全端末 WASM 固定 (ocrService の ortOptions) なので方針を揃える。
    // PC の高速化として WebGPU を戻すなら、端末を見て分ける必要がある
    spawn(true)

    return () => {
      disposed = true
      workerRef.current?.terminate()
      workerRef.current = null
      // 未解決の要求は落とす (モーダルを閉じた後に resolve しても無意味)
      rejectPending('画像検索を終了しました')
    }
  }, [])

  const embed = useCallback((bitmap: ImageBitmap): Promise<Float32Array> => {
    const worker = workerRef.current
    if (!worker) {
      bitmap.close()
      return Promise.reject(new Error('Worker が準備できていません'))
    }
    const id = nextIdRef.current++
    return new Promise<Float32Array>((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject })
      worker.postMessage({ type: 'embed', id, bitmap } satisfies ToEmbedWorker, [
        bitmap,
      ])
    })
  }, [])

  return {
    ready: loadState.phase === 'ready',
    failed: loadState.phase === 'failed',
    failureMessage: loadState.failureMessage,
    embed,
  }
}
