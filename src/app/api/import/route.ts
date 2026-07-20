import { NextResponse } from 'next/server'
import { denyUnlessLoggedIn } from '@/lib/apiAuth'
import { type ImportReport, importEnex } from '@/lib/enex/importEnex'
import { enexTooLargeMessage, MAX_ENEX_BYTES } from '@/lib/enex/limits'
import {
  checkUploadRequest,
  MULTIPART_OVERHEAD_BYTES,
} from '@/lib/uploads'

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, data: null, error }, { status })
}

// Evernote の .enex を取り込む (docs/28 §4)。
//
// **サーバ側で変換する**。クライアントは端末のファイルを選んで送るだけで、
// ENML → Markdown も添付の保存もここから先で行う。画像アップロード
// (/api/images) と同じ構図なので、認証・CSRF・大きさの作法もそちらに揃える。
export async function POST(request: Request): Promise<NextResponse> {
  // ログインしていない相手のために 30MB を読む理由はない (/api/images と同じ順)
  const denied = await denyUnlessLoggedIn()
  if (denied) {
    return denied
  }

  const rejection = checkUploadRequest(
    request,
    MAX_ENEX_BYTES + MULTIPART_OVERHEAD_BYTES,
  )
  if (rejection) {
    return errorResponse(rejection.status, rejection.error)
  }

  let file: FormDataEntryValue | null
  try {
    const formData = await request.formData()
    file = formData.get('file')
  } catch (error) {
    // 本文の作りが違う (= 利用者に直せる) 話として 400 を返すが、原因はログに
    // 残す。境界を壊すのは multipart の書き方だけではない — 途中で切れた通信や
    // 境界を書き換えるプロキシもここへ来るので、握り潰すと切り分けられなくなる
    console.error('インポートの multipart 解析に失敗しました:', error)
    return errorResponse(400, 'multipart/form-data で file を送信して下さい')
  }

  if (!(file instanceof File)) {
    return errorResponse(400, 'file フィールドがありません')
  }

  // Content-Length を偽った要求に備え、読み込んだ実体でも確かめる。
  // 正規のブラウザはクライアント側の事前検査 (EnexImporter) で先に止まるので、
  // ここに来るのは事前検査を通らない相手だけ
  if (file.size > MAX_ENEX_BYTES) {
    return errorResponse(413, enexTooLargeMessage(file.size))
  }

  let report: ImportReport
  try {
    // text() は常に UTF-8 として読む (壊れた並びは U+FFFD に置き換わるだけで
    // 例外にはならない)。別の符号化で書かれたファイルは、化けたまま取り込まれる
    // より断りたいので、宣言との食い違いを parseEnex 側で見て投げている
    report = await importEnex(await file.text())
  } catch (error) {
    // ファイル 1 枚まるごとが対象外だったということ (XML として壊れている、
    // ENEX ではない)。利用者に直せる話なので 400 で理由を返す。
    // 個々のノートの失敗はここへ来ず、レポートの skipped に載る
    console.error('ENEX の取り込みに失敗しました:', error)
    return errorResponse(
      400,
      error instanceof Error ? error.message : 'ENEX を読み込めませんでした',
    )
  }

  return NextResponse.json({ success: true, data: report, error: null })
}
