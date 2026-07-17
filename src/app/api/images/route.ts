import { NextResponse } from 'next/server'
import { denyUnlessLoggedIn } from '@/lib/apiAuth'
import { saveImage } from '@/lib/imageStore'
import {
  checkUploadRequest,
  extForMime,
  matchesMagicBytes,
  MAX_IMAGE_BYTES,
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

  const ext = extForMime(file.type)
  if (!ext) {
    return errorResponse(400, '対応していない画像形式です (png/jpg/gif/webp のみ)')
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return errorResponse(400, tooLargeMessage())
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!matchesMagicBytes(bytes, ext)) {
    return errorResponse(400, 'ファイルの中身が画像ではありません')
  }

  const url = await saveImage(bytes, file.type, ext)

  return NextResponse.json({ success: true, data: { url }, error: null })
}
