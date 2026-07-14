import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getUploadDir, isValidImageName, mimeForName } from '@/lib/uploads'

interface RouteContext {
  params: Promise<{ name: string }>
}

// アップロード済み画像の配信。ファイル名は UUID + 拡張子のみ許可し、
// それ以外 (トラバーサル等) は 400 で弾く
export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { name } = await params

  if (!isValidImageName(name)) {
    return NextResponse.json(
      { success: false, data: null, error: '不正なファイル名です' },
      { status: 400 },
    )
  }

  try {
    const bytes = await readFile(path.join(getUploadDir(), name))
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        // ファイル名が UUID で内容が変わらないため長期キャッシュしてよい
        'Content-Type': mimeForName(name) ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        // ユーザー由来のバイト列を配信するため MIME スニッフィングを禁止
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        { success: false, data: null, error: '画像が見つかりません' },
        { status: 404 },
      )
    }
    throw e
  }
}
