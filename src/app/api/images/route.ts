import { NextResponse } from 'next/server'
import { denyUnlessLoggedIn } from '@/lib/apiAuth'
import { storeAttachment } from '@/lib/attachmentStore'
import { checkUploadRequest, MAX_IMAGE_BYTES, tooLargeMessage } from '@/lib/uploads'

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, data: null, error }, { status })
}

// memo エディタからの画像アップロード。UUID 名で images テーブルに保存し、
// 参照用の URL (/api/images/<name>) を返す。
//
// 形式の判定・変換・保存そのものは attachmentStore.ts が持つ (ENEX インポートと
// 共有する)。ここに残すのは HTTP の作法 — 認証・CSRF・大きさ・応答の組み立て。
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
  } catch (error) {
    // 400 を返すが原因はログに残す。multipart の書き方だけでなく、途中で切れた
    // 通信や境界を書き換えるプロキシもここへ来るため (api/import と同じ理由)
    console.error('アップロードの multipart 解析に失敗しました:', error)
    return errorResponse(400, 'multipart/form-data で file を送信して下さい')
  }

  if (!(file instanceof File)) {
    return errorResponse(400, 'file フィールドがありません')
  }

  // 原寸を Uint8Array に読む前に、申告サイズで弾けるものは弾く
  if (file.size > MAX_IMAGE_BYTES) {
    return errorResponse(400, tooLargeMessage())
  }

  // ファイル名を渡すのはテキスト (txt/csv/md) の拡張子を決めるためだけ。
  // 名前そのものは保存名にならない (サーバ発番の UUID + 既知の拡張子)
  const stored = await storeAttachment(new Uint8Array(await file.arrayBuffer()), {
    fileName: file.name,
  })
  if (!stored.ok) {
    return errorResponse(400, stored.reason)
  }

  return NextResponse.json({
    success: true,
    data: { url: stored.url },
    error: null,
  })
}
