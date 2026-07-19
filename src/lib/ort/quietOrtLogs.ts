// onnxruntime の警告 (W レベル) を止める (docs/30-ブラウザログ計画.md §1)。
//
// **なぜ要るか**: PP-OCRv5 のモデルは Paddle2ONNX 変換の名残で、どのノードからも
// 参照されない初期化子を大量に含む。ORT はセッションを作るたびに 1 件ずつ
// 「Removing initializer 'p2o.pd_op.…'」を W レベルで吐き、OCR 1 回で 27 件に
// 達した (実測)。onnxruntime-web は WASM の stderr を console.error へ流すため、
// この警告が全部「エラー」として /logs に積まれ、ブラウザ側 200 件のバッファを
// 埋めて**本物の失敗を押し出していた**。eruda の console も同じだけ埋まる。
//
// **なぜ env.logLevel では足りないか**: env.logLevel は _OrtInit に渡る
// 環境ロガーの閾値でしかない。セッション側は
//
//   const logSeverityLevel = sessionOptions.logSeverityLevel ?? 2
//
// と onnxruntime-web が既定 2 (warning) を**ハードコード**しており
// (dist/ort.wasm.mjs)、env をいくら上げてもグラフ最適化の警告は出る。
// 黙らせるにはセッション生成時に渡すしかない。
//
// **なぜ包むか**: PaddleOCR SDK は createSession で
// `{ executionProviders, graphOptimizationLevel }` だけを渡し、
// ortOptions にも logSeverityLevel の口が無い (SDK の型定義で確認済み)。
// 差し込む場所が他に無いので、InferenceSession.create の既定値をここで足す。
// 呼び出し側が明示した値は尊重する (spread の順で上書きさせる)。

type OrtModule = typeof import('onnxruntime-web')

// ORT のログ閾値。0=verbose 1=info 2=warning 3=error 4=fatal。
// error 以上は残すので、モデルが読めない等の失敗はこれまでどおり出る
const SEVERITY_ERROR = 3

// 同じ realm で 2 度包まない (OCR の初期化は 1 度だけだが、
// 呼び出し側の都合で複数回来ても包みは 1 重に保つ)
const patched = new WeakSet<object>()

export function quietOrtSessionLogs(ort: OrtModule): void {
  ort.env.logLevel = 'error' // 環境ロガー側 (セッション側は下で足す)

  const sessionClass = ort.InferenceSession as unknown as {
    create: (...args: unknown[]) => unknown
  }
  if (patched.has(sessionClass)) {
    return
  }
  patched.add(sessionClass)

  const original = sessionClass.create
  sessionClass.create = (...args: unknown[]) => {
    const [model, second, ...rest] = args

    // 面倒を見るのは create(model, options?) の形だけ。
    // ArrayBuffer を (buffer, byteOffset, byteLength, options) で渡す
    // オーバーロードは second が数値になるので、そのまま元へ流す
    const isOptionsForm =
      rest.length === 0 &&
      (second === undefined || (typeof second === 'object' && second !== null))
    if (!isOptionsForm) {
      return original.apply(sessionClass, args)
    }

    return original.call(sessionClass, model, {
      logSeverityLevel: SEVERITY_ERROR,
      ...(second as object | undefined),
    })
  }
}
