// カメラ映像やアップロード画像から、モデル入力用の正方形フレームを切り出す
// (docs/25-画像検索計画.md §6)。中央の正方形にクロップして 224px へ縮小する。
// **クロップが精度に最も効く** (背景を減らす)。ガイド枠に部品を収めさせる UI が
// この中央クロップと噛み合う。

// モデルの入力辺 (px)。DINOv2 系の標準前処理も 224 近辺。
export const FRAME_SIZE = 224

// 中央正方形にクロップして FRAME_SIZE へ縮小した ImageBitmap を返す。
// source は video / ImageBitmap / Blob など ImageBitmapSource なら何でもよい。
export async function captureSquareBitmap(
  source: ImageBitmapSource,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const side = Math.min(width, height)
  const sx = Math.floor((width - side) / 2)
  const sy = Math.floor((height - side) / 2)
  return createImageBitmap(source, sx, sy, side, side, {
    resizeWidth: FRAME_SIZE,
    resizeHeight: FRAME_SIZE,
    resizeQuality: 'medium',
  })
}
