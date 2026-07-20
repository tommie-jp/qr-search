import { NextResponse } from 'next/server'
import { denyUnlessLoggedIn } from '@/lib/apiAuth'
import { saveImage, savePlainAttachment } from '@/lib/imageStore'
import { normalizeImage } from '@/lib/normalizeImage'
import {
  audioSaveInfo,
  checkUploadRequest,
  type ImageFormat,
  MAX_IMAGE_BYTES,
  PDF_EXT,
  PDF_MIME,
  sniffAudioFormat,
  sniffImageFormat,
  sniffPdf,
  tooLargeMessage,
} from '@/lib/uploads'

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, data: null, error }, { status })
}

// memo エディタからの画像アップロード。UUID 名で images テーブルに保存し、
// 参照用の URL (/api/images/<name>) を返す
export async function POST(request: Request): Promise<NextResponse> {
  // 一番先に見る。ログインしていない相手のために本文を読む理由はない
  // (12MB まで受け取ってから断るのは、断り方として無駄が大きい)
  const denied = await denyUnlessLoggedIn()
  if (denied) {
    return denied
  }

  const rejection = checkUploadRequest(request)
  if (rejection) {
    return errorResponse(rejection.status, rejection.error)
  }

  let file: FormDataEntryValue | null
  try {
    const formData = await request.formData()
    file = formData.get('file')
  } catch {
    return errorResponse(400, 'multipart/form-data で file を送信して下さい')
  }

  if (!(file instanceof File)) {
    return errorResponse(400, 'file フィールドがありません')
  }

  // 原寸を Uint8Array に読む前に、申告サイズで弾けるものは弾く
  if (file.size > MAX_IMAGE_BYTES) {
    return errorResponse(400, tooLargeMessage())
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  // 形式はクライアント申告の MIME ではなく中身の先頭バイトで決める。
  // MIME を空で送る端末 (iOS の HEIC など) でも拾え、詐称にも強い。
  // まず画像として判定し、外れたら音声 (mp3/m4a/wav/webm)、PDF の順に試す。
  const imageFormat = sniffImageFormat(bytes)
  if (imageFormat) {
    return saveImageUpload(bytes, imageFormat)
  }

  const audioFormat = sniffAudioFormat(bytes)
  if (audioFormat) {
    // 音声は変換もサムネも要らない。中身をそのまま保存する
    const { mime, ext } = audioSaveInfo(audioFormat)
    const url = await savePlainAttachment(bytes, mime, ext)
    return NextResponse.json({ success: true, data: { url }, error: null })
  }

  if (sniffPdf(bytes)) {
    // PDF もそのまま保存し、表示はブラウザ内蔵ビューアに任せる
    const url = await savePlainAttachment(bytes, PDF_MIME, PDF_EXT)
    return NextResponse.json({ success: true, data: { url }, error: null })
  }

  return errorResponse(
    400,
    '対応していない形式です (画像: png/jpg/gif/webp/avif/heic/tiff, 音声: mp3/m4a/wav/webm, PDF: pdf)',
  )
}

// 画像の保存 (HEIC/TIFF は WebP へ変換してから)。POST から切り出して
// 「画像なら」の分岐を素直に読めるようにする。
async function saveImageUpload(
  bytes: Uint8Array<ArrayBuffer>,
  format: ImageFormat,
): Promise<NextResponse> {
  // ブラウザが表示できない形式 (HEIC/TIFF) は保存前に WebP へ変換する。
  // 復号に失敗する = 壊れた画像なので 400 で断る (500 にしない)
  let normalized
  try {
    normalized = await normalizeImage(bytes, format)
  } catch (error) {
    // 失敗は握り潰さずログに残す (thumbnail.ts と同じ流儀)。「特定の 1 枚が
    // 壊れている」のか「HEIC 復号器が丸ごと動いていない」(alpine/musl の
    // イメージ更新後など) のかを、件数と形式で切り分けられるようにする
    console.error(
      `画像の正規化に失敗しました (${format}, ${bytes.byteLength} bytes):`,
      error,
    )
    return errorResponse(400, '画像を読み込めませんでした (壊れているか未対応の画像です)')
  }

  const url = await saveImage(normalized.bytes, normalized.mime, normalized.ext)

  return NextResponse.json({ success: true, data: { url }, error: null })
}
