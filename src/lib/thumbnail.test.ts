import sharp from 'sharp'
import { expect, test } from 'vitest'
import { makeThumbnail, THUMB_MAX_PX, THUMB_MIME } from './thumbnail'

// テスト用の単色画像。中身は問わないので生成で済ませる (固定ファイルを置かない)。
async function png(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer()
  return new Uint8Array(buffer)
}

test('大きい画像は長辺を THUMB_MAX_PX に縮め、縦横比を保つ', async () => {
  const thumb = await makeThumbnail(await png(2000, 1000))

  const meta = await sharp(thumb!).metadata()
  expect(meta.width).toBe(THUMB_MAX_PX)
  expect(meta.height).toBe(THUMB_MAX_PX / 2)
})

test('THUMB_MIME の形式で返す', async () => {
  const thumb = await makeThumbnail(await png(2000, 1000))

  const meta = await sharp(thumb!).metadata()
  expect(`image/${meta.format}`).toBe(THUMB_MIME)
})

test('元より小さい画像は拡大しない', async () => {
  const thumb = await makeThumbnail(await png(80, 60))

  const meta = await sharp(thumb!).metadata()
  expect(meta.width).toBe(80)
  expect(meta.height).toBe(60)
})

test('一覧に並べられる大きさまで小さくなる', async () => {
  // 縮小が効いていることの確認。原寸のまま配ると一覧が実用にならないのが
  // この列を足した理由なので、バイト数そのものを見る
  const original = await png(3000, 2000)
  const thumb = await makeThumbnail(original)

  expect(thumb!.byteLength).toBeLessThan(original.byteLength)
  expect(thumb!.byteLength).toBeLessThan(100 * 1024)
})

test('EXIF の向きを反映して起こす', async () => {
  // スマホ写真は横倒しのまま保存され、向きは EXIF にしか入っていない。
  // orientation 6 = 時計回り 90 度で表示する指定なので、縦横が入れ替わる。
  // 縮小が絡まない大きさ (回転後も THUMB_MAX_PX 以内) で向きだけを見る
  const buffer = await sharp({
    create: { width: 200, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer()

  const thumb = await makeThumbnail(new Uint8Array(buffer))

  const meta = await sharp(thumb!).metadata()
  expect(meta.width).toBe(100)
  expect(meta.height).toBe(200)
})

test('画像でないバイト列では null を返す (呼び出し側を失敗させない)', async () => {
  expect(await makeThumbnail(new Uint8Array([1, 2, 3, 4]))).toBeNull()
})

test('展開すると巨大になる画像は断る (解凍爆弾よけ)', async () => {
  // バイト数の上限は展開後の大きさを縛らない。単色なら 12000x12000 (144MP) が
  // 数十 KB に収まってしまうので、10MB 制限をすり抜けてメモリを潰せる。
  // 断るときも例外ではなく null (アップロード自体は成功させる)
  const huge = await sharp({
    create: { width: 12000, height: 12000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png({ compressionLevel: 9 })
    .toBuffer()

  expect(await makeThumbnail(new Uint8Array(huge))).toBeNull()
})
