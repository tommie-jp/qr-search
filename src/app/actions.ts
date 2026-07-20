'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { parseBulkTagForm } from '@/lib/bulkTags'
import {
  emptyTrash,
  getItem,
  purgeItems,
  restoreItems,
  setItemPublic,
  trashItems,
  upsertItem,
  upsertMemo,
} from '@/lib/items'
import { parseBackUrl, parseSelectedItemNos } from '@/lib/itemSelection'
import { requireUser } from '@/lib/session'
import { addTagsToMemo, removeTagsFromMemo } from '@/lib/tagEdit'
import { isValidItemNo, MAX_TEXT_LENGTH, parseMode } from '@/lib/validation'
import {
  parseViewMode,
  VIEW_MODE_COOKIE,
  VIEW_MODE_COOKIE_MAX_AGE,
} from '@/lib/viewMode'

function readText(formData: FormData, key: string): string {
  const value = formData.get(key)
  if (typeof value !== 'string') {
    return ''
  }
  if (value.length > MAX_TEXT_LENGTH) {
    throw new Error(`${key} が長すぎます (最大 ${MAX_TEXT_LENGTH} 文字)`)
  }
  return value
}

function readItemNo(formData: FormData): string {
  const itemNo = String(formData.get('itemNo') ?? '')
  if (!isValidItemNo(itemNo)) {
    throw new Error('itemNo が不正です')
  }
  return itemNo
}

// 保存後の「保存しました」トースト用の戻り先 (docs/11-アプリ的UIUX計画.md §2-3)。
// 値を時刻にするのは、連続保存でも毎回トーストを出すため (SavedToast の key に
// 使う)。印はトーストを出した直後にクライアントが URL から消す
function savedHref(itemNo: string): string {
  return `/item/${itemNo}?saved=${Date.now()}`
}

// Server Action は「画面に置いたボタン」ではなく、誰でも叩ける POST の口
// (id さえ判れば画面を通さず呼べる)。proxy.ts も未ログインの POST は 401 に
// するが、それは楽観的な検査でしかないので、書き込む側でも必ず確かめる
// (docs/18-ログイン計画.md)。

// Ver1 の /item/:itemNo POST 相当: memo だけをその場で更新 (未登録なら作成)
export async function updateMemoAction(formData: FormData): Promise<void> {
  await requireUser()
  const itemNo = readItemNo(formData)
  const memo = readText(formData, 'memo')
  await upsertMemo(itemNo, memo)
  revalidatePath(`/item/${itemNo}`)
  redirect(savedHref(itemNo))
}

// Ver1 の /edit/:itemNo POST 相当: mode / memo / url を更新 (未登録なら作成)
export async function updateItemAction(formData: FormData): Promise<void> {
  await requireUser()
  const itemNo = readItemNo(formData)
  const memo = readText(formData, 'memo')
  const url = readText(formData, 'url')
  const mode = parseMode(formData.get('mode'))
  await upsertItem(itemNo, { memo, url, mode })
  revalidatePath(`/item/${itemNo}`)
  redirect(savedHref(itemNo))
}

// --- 公開 (docs/22-ノート公開計画.md) ---

// ノートを公開する / 公開をやめる。
//
// フォームは**望む状態** (public=1 / 0) を送る。「いまの状態を裏返す」に
// すると、二重送信や戻るボタンで意図と逆に倒れる (docs/22 §7)。
//
// requireUser() は飾りではない。これは誰でも叩ける POST の口で、
// もし通れば「他人が自分のノートを勝手に公開できる」ことになる。
// proxy.ts も未ログインの POST は 401 にするが、それは楽観的な検査でしかない。
export async function setItemPublicAction(formData: FormData): Promise<void> {
  await requireUser()
  const itemNo = readItemNo(formData)
  // '1' だけを公開と読む。判らない値は非公開へ倒す (既定を閉じる側へ)
  const isPublic = formData.get('public') === '1'
  await setItemPublic(itemNo, isPublic)
  revalidatePath(`/item/${itemNo}`)
}

// --- ゴミ箱 (二段階削除。docs/12-ゴミ箱計画.md) ---

// 検索結果で選択したノートをゴミ箱へ入れる (復元できるので confirm は出さない)。
// 一括タグと同じフォームから formAction で分岐して呼ばれる。
export async function trashItemsAction(formData: FormData): Promise<void> {
  await requireUser()
  const itemNos = parseSelectedItemNos(formData)
  const back = parseBackUrl(formData)

  if (itemNos.length > 0) {
    await trashItems(itemNos)
    revalidatePath('/')
    revalidatePath('/trash')
  }

  redirect(back)
}

// ゴミ箱から戻す。/trash の「復元」と /item のバナーの両方から呼ばれ、
// どちらも同じルートを revalidate すれば呼び出し元がそのまま描き直される
// (Next.js は revalidatePath で現在のルートを再レンダリングして返す)。
export async function restoreItemsAction(formData: FormData): Promise<void> {
  await requireUser()
  const itemNos = parseSelectedItemNos(formData)
  if (itemNos.length === 0) {
    return
  }

  await restoreItems(itemNos)
  revalidatePath('/')
  revalidatePath('/trash')
  for (const itemNo of itemNos) {
    revalidatePath(`/item/${itemNo}`)
  }
}

// 永久削除。ゴミ箱にある行しか消せないことは items.ts の purgeItems が保証する
// (UI の confirm は最後の一押しで、防護そのものではない)。
export async function purgeItemsAction(formData: FormData): Promise<void> {
  await requireUser()
  const itemNos = parseSelectedItemNos(formData)
  if (itemNos.length === 0) {
    return
  }

  await purgeItems(itemNos)
  revalidatePath('/')
  revalidatePath('/trash')
}

export async function emptyTrashAction(): Promise<void> {
  await requireUser()
  await emptyTrash()
  revalidatePath('/')
  revalidatePath('/trash')
}

// 検索結果の表示モード (小/大) を切り替える (docs/23-検索結果表示モード計画.md §5)。
//
// cookie を書くのでサーバアクションにする。Server Component の描画中は
// Set-Cookie を出せない (next/headers の cookies.md)。フォームの action に
// 置けば、書き換えたあと同じページが描き直されるので、クライアント JS は要らない。
//
// 他のアクションと違い requireUser() を呼ばない。書き換わるのは呼び手自身の
// ブラウザに載る「見た目の好み」だけで、DB にも他人にも触れないため。
// (未ログインでも開ける公開ノートの一覧はないが、あっても実害はない)
export async function setViewModeAction(formData: FormData): Promise<void> {
  const mode = parseViewMode(formData.get(VIEW_MODE_COOKIE))

  const store = await cookies()
  store.set(VIEW_MODE_COOKIE, mode, {
    // サーバしか読まない (描画前に読めることがこの方式の要)。
    // クライアント JS へ見せる理由がないので閉じておく
    httpOnly: true,
    // HTTPS でだけ送る。ローカル開発は http なので付けない
    // (付けるとローカルで cookie が保存されず、切り替えが効かなくなる)
    secure: process.env.NODE_ENV === 'production',
    // 他サイトからの遷移で好みが飛ばない程度に緩く。strict にすると
    // 外部リンクから戻ったときだけ既定に見え、消えたと誤解される
    sameSite: 'lax',
    path: '/',
    maxAge: VIEW_MODE_COOKIE_MAX_AGE,
  })

  // **revalidatePath は呼ばない。**
  //
  // 一度 revalidatePath('/', 'layout') を置いていたが、これは `/` 配下の
  // *全ルート* を無効にする。静的な /manifest.webmanifest まで再生成対象になり、
  // Next がその prerender キャッシュを書き直そうとする。ところがコンテナは
  // node ユーザーで動くのに .next は root 所有 (Dockerfile の COPY) なので
  // 書けず、切り替えるたびにサーバログへ警告が出た。
  //
  //   Failed to update prerender cache for /manifest.webmanifest
  //   EACCES: permission denied, open '/app/.next/server/app/manifest.webmanifest.body'
  //
  // そもそも不要だった。一覧は force-dynamic でサーバ側にキャッシュが無く、
  // フォームの action から呼ばれたサーバアクションは、その場のページを
  // Next が描き直す (Router Cache も一緒に更新される)。
}

// 検索結果で選択した複数ノートへ、タグをまとめて追加/削除する。
// タグの正本はメモ本文なので、本文を書き換えて upsertMemo で保存し
// items.tags を再計算させる (tagEdit.ts 参照)。実際に本文が変わったノートだけ
// 保存するので、文章中にしかないタグの削除など「効かない」操作では更新しない。
export async function bulkTagAction(formData: FormData): Promise<void> {
  await requireUser()
  const { mode, itemNos, tags, back } = parseBulkTagForm(formData)

  if (itemNos.length > 0 && tags.length > 0) {
    for (const itemNo of itemNos) {
      const item = await getItem(itemNo)
      const memo = item?.memo ?? ''
      const next =
        mode === 'add'
          ? addTagsToMemo(memo, tags)
          : removeTagsFromMemo(memo, tags)
      if (next !== memo) {
        await upsertMemo(itemNo, next)
      }
    }
    revalidatePath('/')
  }

  redirect(back)
}
