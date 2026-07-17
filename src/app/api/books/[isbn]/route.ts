import { NextResponse } from 'next/server'
import { denyUnlessLoggedIn } from '@/lib/apiAuth'
import { lookupBook } from '@/lib/bookLookup'
import { isIsbn } from '@/lib/scanRegister'

// ISBN の書誌を返す (設計は docs/13-書誌自動取得計画.md)。
//
// スキャンした ISBN の書名・著者をエディタに事前入力するために、
// 編集ページのクライアントから引かれる。
//
// サーバを挟むのは NDL サーチのため。NDL の口のうち速いほう (OpenSearch) は
// CORS ヘッダを返さずブラウザから直接引けず、CORS を返す SRU の口は
// 未キャッシュの ISBN で 14〜42 秒かかって実用にならなかった (実測)。
//
// 見つからない (data: null) はエラーではない。呼び出し側は事前入力のまま
// 手で書けばよく、導線は止まらない。
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ isbn: string }> },
): Promise<NextResponse> {
  // 中身は公開情報 (書誌) だが、この口は NDL を叩く踏み台でもある。
  // 開けておくと、誰でもこのサーバ経由で外部 API を好きなだけ引ける
  const denied = await denyUnlessLoggedIn()
  if (denied) {
    return denied
  }

  const { isbn } = await params
  // 外から来る値なので必ず検算する。13 桁の数字だけを外部 API の URL に
  // 載せることになり、書籍以外のコードで NDL を叩くこともなくなる
  if (!isIsbn(isbn)) {
    return NextResponse.json(
      { success: false, data: null, error: 'ISBN ではありません' },
      { status: 400 },
    )
  }

  try {
    const book = await lookupBook(isbn)
    return NextResponse.json({ success: true, data: book, error: null })
  } catch (err) {
    // 個々の API の失敗は lookupBook が警告に残して次を試す。ここに来るのは
    // 想定外の取りこぼしなので、中身は返さずログに残す
    console.error('書誌の取得に失敗しました', err)
    return NextResponse.json(
      { success: false, data: null, error: '書誌の取得に失敗しました' },
      { status: 502 },
    )
  }
}
