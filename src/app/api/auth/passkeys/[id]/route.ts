import type { NextResponse } from 'next/server'
import { denyCrossSite, denyUnlessLoggedIn } from '@/lib/apiAuth'
import { apiFail, apiOk } from '@/lib/authApi'
import { deletePasskey } from '@/lib/passkeys'

// 登録済みパスキーを 1 つ消す (docs/29-パスキー計画.md §6, §8)。
//
// **最後の 1 つでも消させる**。パスキーが 0 個になってもパスワード (Basic)
// で入れるので締め出しにならない — それが Basic を残した理由そのもの
// (docs/29 §2)。「最後の 1 つは消せません」という制限を付けると、
// 紛失した端末の鍵を消せなくなるほうが困る。
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = (await denyUnlessLoggedIn()) ?? denyCrossSite(request)
  if (denied) {
    return denied
  }

  const { id } = await params
  const deleted = await deletePasskey(id)
  if (!deleted) {
    return apiFail('そのパスキーは見つかりませんでした', 404)
  }

  return apiOk({ id })
}
