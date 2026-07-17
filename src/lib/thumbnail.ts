// 一覧に並べるためのサムネイル生成 (docs/23-検索結果表示モード計画.md §2)。
//
// 検索結果のカード表示は 1 ページに 20 枚の画像を並べる。images.data は
// アップロードされた原寸のバイト列で、スマホ写真なら 1 枚数 MB ある。CSS で
// 小さく見せてもバイト数は減らないため、縮小したものを別に持って一覧へ配る。
//
// 画像は UUID 名で内容が変わらない (route.ts が immutable で配っている) ので、
// 保存時に 1 度作れば作り直す理由がない。リクエストごとに縮小してキャッシュを
// 持つより単純で、画像 GC (docs/20-画像GC計画.md) とも干渉しない — 行が消えれば
// サムネも一緒に消える。

import sharp from 'sharp'

export const THUMB_MIME = 'image/webp'

// 長辺の上限 (px)。カード表示のサムネ枠は 5 行分 ≒ 96px なので、
// 高 DPR (3x) の端末でも足りる 320px を上限にする。
// 単一の大きさで小・大の両方をまかなう (枠は CSS で決まり、絵は縮む側に強い)。
export const THUMB_MAX_PX = 320

// 展開後のピクセル数の上限 (解凍爆弾よけ)。
//
// アップロードは 10MB (MAX_IMAGE_BYTES) までに制限してあるが、**バイト数は
// 展開後の大きさを縛らない**。マジックバイト検査 (uploads.ts) が見るのは先頭
// 数バイトだけなので、10MB に収まりながら数万 x 数万を名乗る画像は作れる。
// libvips は resize で縮める前に一度展開するため、上限が無いと 1 枚で GB 単位の
// メモリを掴んでプロセスごと落とせる。
//
// sharp の既定 (約 268MP) は「事故で巨大な画像を開かない」ための値で、悪意ある
// 入力に対しては緩い。50MP は 8000x6000 (48MP) の一眼でも通る大きさなので、
// 実用上これで困ることはない。超えた画像は例外になり、下の catch で null に
// なる (= サムネなしで原寸配信。アップロード自体は成功する)。
//
// この上限は今回はじめて必要になった。sharp はこれまで devDependency で
// アイコン生成にしか使っておらず、ユーザーが投げたバイト列を渡す経路が
// 無かったため
const MAX_INPUT_PIXELS = 50_000_000

// 原寸のバイト列からサムネイルを作る。作れなければ null。
//
// **例外を投げない**のは意図的。呼び出し側 (saveImage) にとって画像の保存が
// 本題で、サムネはあれば一覧が速くなるだけの派生物である。壊れた EXIF や
// sharp が読めない亜種のために、ユーザの画像アップロードそのものを失敗させる
// 価値はない。null のときは配信側が原寸で代替するので、絵が割れることもない
// (遅くなるだけ)。黙って消えないよう、失敗はログに残す。
export async function makeThumbnail(
  bytes: Uint8Array,
  // ログに出す手がかり (画像名など)。失敗が「この 1 枚が壊れている」のか
  // 「sharp が丸ごと動いていない」のかは、件数と対象が判らないと切り分け
  // られない。ログはヘッダの「ログ」から読める (docs/21-ログ表示計画.md)
  label = '(名前なし)',
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    // failOn: 'none' … 多少壊れていてもブラウザが表示できる画像は多い。
    // 既定 ('warning') は厳しすぎ、本文では見えている絵のサムネだけが
    // 作られない状態になる。
    const thumb = await sharp(bytes, {
      failOn: 'none',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      // EXIF の向きを画素に焼く。スマホ写真は横倒しのまま保存され、向きは
      // EXIF にしか入っていない。ここで起こさないと一覧だけ倒れて出る
      // (本文側はブラウザが EXIF を見るので正しく出てしまい、食い違う)
      .rotate()
      .resize(THUMB_MAX_PX, THUMB_MAX_PX, {
        // 枠に収める。切り抜きは表示側の object-cover に任せる。
        // 縦横比を保って持てば、小・大どちらの枠にも後から合わせられる
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer()

    // Buffer は使い回しのプールを指しうるため、自前の ArrayBuffer へ写す
    // (Prisma の Bytes は ArrayBuffer 実体の Uint8Array だけを受ける)
    return new Uint8Array(thumb)
  } catch (error) {
    // 名前と大きさを添える。「全部のアップロードで出ている」なら sharp か
    // その native が壊れている (本番は alpine/musl なので入れ違いは起こりうる)、
    // 「特定の 1 枚だけ」ならその画像の問題、と切り分けられるようにする
    console.error(
      `サムネイル生成に失敗しました (${label}, ${bytes.byteLength} bytes):`,
      error,
    )
    return null
  }
}
