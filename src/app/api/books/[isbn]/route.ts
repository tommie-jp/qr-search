import { NextResponse } from 'next/server'
import { isDemoMode } from '@/lib/appEnv'
import { denyCrossSite, denyUnlessLoggedIn } from '@/lib/apiAuth'
import { lookupBook } from '@/lib/bookLookup'
import { saveCoverImage } from '@/lib/coverImage'
import { isIsbn } from '@/lib/scanRegister'

// ISBN の書誌を返す (設計は docs/13-書誌自動取得計画.md)。
// 書影も付ける (docs/19-書影取得計画.md)。
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
  request: Request,
  { params }: { params: Promise<{ isbn: string }> },
): Promise<NextResponse> {
  // 中身は公開情報 (書誌) だが、この口は NDL を叩く踏み台でもある。
  // 開けておくと、誰でもこのサーバ経由で外部 API を好きなだけ引ける。
  //
  // ログイン検査だけでは足りない。この口は**書影を DB に書き、楽天の
  // クォータを使う GET** なので、第三者のページの <img src> から動かされると
  // 孤児の書影とクォータをいくらでも焚かれる (docs/18 §9 / docs/19 §3)
  const denied = (await denyUnlessLoggedIn()) ?? denyCrossSite(request)
  if (denied) {
    return denied
  }

  // デモインスタンスでは外部 API のキーを持たせない (docs/39-デモ公開計画.md §5)。
  // 黙って「見つかりませんでした」になるより、デモだと明示する方が親切なので、
  // 取得を試みる前に demoDisabled を返す。表示文言はクライアント (MemoEditor) 側
  if (isDemoMode()) {
    return NextResponse.json({
      success: false,
      data: null,
      error: 'デモ版では書籍情報を取得できません',
      demoDisabled: true,
    })
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
    // 書誌が無ければ書影も引かない。事前入力に載せる見出しごと無いので、
    // 書影だけ取っても置き場所がない (外部 API を叩くだけ無駄になる)
    const data = book
      ? {
          ...book,
          // openBD の書影 URL はサーバの中だけの中継地点。本文に置くのは
          // 保存後の /api/images/<uuid>.jpg なので、応答には載せない
          coverUrl: undefined,
          coverImageUrl: await saveCoverImage(isbn, book.coverUrl),
        }
      : null
    return NextResponse.json({ success: true, data, error: null })
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
