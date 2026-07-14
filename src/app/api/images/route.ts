import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import {
  extForMime,
  getUploadDir,
  matchesMagicBytes,
  MAX_IMAGE_BYTES,
} from '@/lib/uploads'

// multipart のヘッダ等のオーバーヘッド分を上限に足す
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 1024 * 1024

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, data: null, error }, { status })
}

// memo エディタからの画像アップロード。UUID 名で UPLOAD_DIR に保存し、
// 参照用の URL (/api/images/<name>) を返す
export async function POST(request: Request): Promise<NextResponse> {
  // CSRF 対策: ブラウザがクロスオリジン POST に付ける Origin がホストと
  // 食い違う場合は本文を読む前に拒否する (同一オリジンの fetch は許可)
  const origin = request.headers.get('origin')
  const host = request.headers.get('host') ?? new URL(request.url).host
  if (origin && new URL(origin).host !== host) {
    return errorResponse(403, 'クロスオリジンのアップロードは許可されていません')
  }

  // メモリ枯渇対策: formData() は本文全体をバッファするため、
  // Content-Length の時点で明らかに大きすぎるものは先に弾く
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse(413, `ファイルが大きすぎます (最大 ${MAX_IMAGE_BYTES / 1024 / 1024}MB)`)
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
    return errorResponse(
      400,
      `ファイルが大きすぎます (最大 ${MAX_IMAGE_BYTES / 1024 / 1024}MB)`,
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!matchesMagicBytes(bytes, ext)) {
    return errorResponse(400, 'ファイルの中身が画像ではありません')
  }

  const name = `${randomUUID()}.${ext}`
  const dir = getUploadDir()
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, name), bytes)

  return NextResponse.json({
    success: true,
    data: { url: `/api/images/${name}` },
    error: null,
  })
}
