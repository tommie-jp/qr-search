// 埋め込み Worker をひとつ抱え、フレーム → ベクトルの往復を Promise で扱うフック
// (docs/25-画像検索計画.md §6)。id で要求と応答を対応づける。

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FromEmbedWorker, ToEmbedWorker } from './workerMessages'

interface Pending {
  resolve: (vector: Float32Array) => void
  reject: (error: Error) => void
}

export interface ImageEmbedder {
  // 初回モデル読み込みが完了したか (UI の「準備中(初回)」を畳むのに使う)
  ready: boolean
  // モデルの初回読み込みに失敗したか。1 度も ready にならないまま埋め込みが
  // エラーになった = モデルを用意できなかった、とみなす。ライブ検索は失敗を
  // 握りつぶすので、これを UI に出さないと「カメラは映るが何も出ない」原因が
  // 分からなくなる (HF Hub からのモデル取得は現実に失敗しうる)。
  failed: boolean
  // フレーム 1 枚 → 正規化済みベクトル。bitmap は Worker へ transfer される
  embed: (bitmap: ImageBitmap) => Promise<Float32Array>
}

export function useImageEmbedder(): ImageEmbedder {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef(new Map<number, Pending>())
  const nextIdRef = useRef(1)
  // ready はレンダーにも出すが、error ハンドラ内では最新値を同期で見たいので
  // ref にも持つ (state のクロージャは古い値を掴む)
  const hasBeenReadyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const worker = new Worker(new URL('./embedWorker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    const pending = pendingRef.current

    worker.onmessage = (event: MessageEvent<FromEmbedWorker>) => {
      const msg = event.data
      if (msg.type === 'ready') {
        hasBeenReadyRef.current = true
        setReady(true)
        return
      }
      const entry = pending.get(msg.id)
      if (!entry) {
        return
      }
      pending.delete(msg.id)
      if (msg.type === 'result') {
        entry.resolve(msg.vector)
      } else {
        // 1 度も ready にならないままのエラー = モデルを用意できなかった
        if (!hasBeenReadyRef.current) {
          setFailed(true)
        }
        entry.reject(new Error(msg.message))
      }
    }

    // モデルを前もって温める (最初のフレームを待たずに読み込み始める)
    worker.postMessage({ type: 'preload' } satisfies ToEmbedWorker)

    return () => {
      worker.terminate()
      workerRef.current = null
      // 未解決の要求は落とす (モーダルを閉じた後に resolve しても無意味)
      for (const entry of pending.values()) {
        entry.reject(new Error('画像検索を終了しました'))
      }
      pending.clear()
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

  return { ready, failed, embed }
}
