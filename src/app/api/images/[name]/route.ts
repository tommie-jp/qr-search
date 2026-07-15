import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { extForMime, isValidImageName } from '@/lib/uploads'

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

  const image = await prisma.image.findUnique({
    where: { name },
    select: { mime: true, data: true },
  })

  if (!image) {
    return NextResponse.json(
      { success: false, data: null, error: '画像が見つかりません' },
      { status: 404 },
    )
  }

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      // 保存時に検証済みだが、DB の値をそのまま信用せず既知の画像 MIME のときだけ採用する
      'Content-Type': extForMime(image.mime)
        ? image.mime
        : 'application/octet-stream',
      // ファイル名が UUID で内容が変わらないため長期キャッシュしてよい
      'Cache-Control': 'public, max-age=31536000, immutable',
      // ユーザー由来のバイト列を配信するため MIME スニッフィングを禁止
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
