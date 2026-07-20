// ENEX を取り込んでノートを作る (設計は docs/28-エクスポート計画.md §4)。
//
// ここは**繋ぎ役だけ**を持つ。読み取りは parseEnex、本文の変換は enmlToMarkdown、
// 添付の保存は attachmentStore、派生キャッシュ (tags / props) の再計算は
// upsertItem —— どれも既にある経路をそのまま通す。インポート専用の保存経路を
// 作らないのが設計の要 (§4「インポート経路を 2 本持たない」)。
//
// 失敗の扱いは「そのノートだけ飛ばしてレポートに載せる」(§3)。1 件の壊れた
// 添付でファイル 1 枚まるごとが入らないほうが困る。

import { storeAttachment } from '@/lib/attachmentStore'
import { prisma } from '@/lib/db'
import { nextItemNo, upsertItem } from '@/lib/items'
import { MAX_TEXT_LENGTH } from '@/lib/validation'
import { buildMemo, enexTagToMemoTag } from './buildMemo'
import {
  type EnexMedia,
  type EnmlConversion,
  enmlRejectReason,
  enmlToMarkdown,
} from './enmlToMarkdown'
import {
  decodeResourceData,
  type EnexNote,
  type EnexResource,
  parseEnex,
} from './parseEnex'

// 1 回の取り込みで作るノートの上限。個人利用の実感からは十分に大きく、
// 細工したファイルで採番 (nextItemNo) を延々と回されないための安全弁でもある
export const MAX_NOTES_PER_IMPORT = 500

export interface ImportedNote {
  itemNo: string
  // 一覧に出す名前。題名が無いノートもあるので空文字がありうる
  title: string
}

export interface SkippedEntry {
  // 何が取り込めなかったか (「ノート「題名」の添付 dot.png」など)
  label: string
  reason: string
}

export interface ImportOptions {
  // 画像検索の埋め込みをその場で作るか (既定: 作らない)。
  //
  // 既定を「作らない」にしてあるのは、Web の取り込み口 (/api/import) が
  // 本番 VPS (RAM 2GB) で動くため。埋め込みはモデルの読み込みだけで RSS が
  // 475MB 増える (imageStore.ts の SaveImageOptions 参照)。
  //
  // ローカルから流す一括取り込み (scripts/importEnex.ts) は手元のメモリで
  // 走るので、ここを true にして**その場で索引まで作ってしまう**のがよい。
  // 後で backfill を回す手間が消える。
  embedImages?: boolean

  // 添付 1 件の上限 (既定: attachmentStore の 10MB)。
  //
  // Web の口は既定のまま。CLI は MAX_CLI_ATTACHMENT_BYTES を渡す —
  // 10MB は HTTP アップロードの都合で決めた値で、ファイルから読む経路に
  // 持ち込むと iPhone の写真が虫食いになる (limits.ts に理由)
  maxAttachmentBytes?: number
}

export interface ImportReport {
  imported: ImportedNote[]
  // ノート・添付・タグをまとめて 1 本にする。利用者が知りたいのは
  // 「入らなかったものと、その理由」であって、内部の分類ではない
  skipped: SkippedEntry[]
  // 画像検索の索引を作らずに保存した画像の数 (storeResources の deferEmbedding)。
  // 黙って作らないと「取り込んだのに画像検索に出てこない」だけが見えて、
  // 不具合と区別が付かない。数を返して画面で知らせる
  deferredImageIndex: number
}

// ENEX 1 ファイルを取り込む。
//
// XML として読めない・ENEX でないファイルは**例外**を投げる (ファイル 1 枚
// まるごとが対象外)。個々のノート・添付の失敗は例外にせずレポートへ載せる。
export async function importEnex(
  xml: string,
  options: ImportOptions = {},
): Promise<ImportReport> {
  const notes = parseEnex(xml)
  const report: ImportReport = {
    imported: [],
    skipped: [],
    deferredImageIndex: 0,
  }

  const targets = notes.slice(0, MAX_NOTES_PER_IMPORT)
  for (const over of notes.slice(MAX_NOTES_PER_IMPORT)) {
    report.skipped.push({
      label: noteLabel(over),
      reason: `1 回に取り込めるのは ${MAX_NOTES_PER_IMPORT} 件までです`,
    })
  }

  // **直列に回す**。nextItemNo() は「いま未使用の最小番号」を返すので、
  // 並列にすると同じ番号を 2 件が掴んで後勝ちで消える
  for (const note of targets) {
    try {
      await importNote(note, report, options)
    } catch (error) {
      // 1 件の失敗でファイル全体を落とさない。原因はサーバログに残す
      console.error(`ENEX ノートの取り込みに失敗しました (${noteLabel(note)}):`, error)
      report.skipped.push({
        label: noteLabel(note),
        reason: error instanceof Error ? error.message : '取り込みに失敗しました',
      })
    }
  }

  return report
}

async function importNote(
  note: EnexNote,
  report: ImportReport,
  options: ImportOptions,
): Promise<void> {
  // XML の時点で読めなかった添付 (base64 でない・中身が空) も、
  // 保存に失敗したものと同じ列に並べる。利用者にとっては同じ「入らなかった添付」
  for (const rejected of note.rejectedResources) {
    report.skipped.push({
      label: `ノート「${noteTitle(note)}」の添付 ${attachmentName(rejected)}`,
      reason: rejected.reason,
    })
  }

  const { media, savedNames } = await storeResources(note, report, options)

  // ノートが入らなかったときは、保存済みの添付も必ず消す。本文が入らない以上
  // どこからも参照されず、残しても DB を太らせるだけ
  // (docs/20-画像GC計画.md の掃除対象を増やさない)。**やめ方が 2 通り**
  // (見送りと例外) あるので、片付けはここ 1 箇所に集める
  let outcome: WriteOutcome
  try {
    outcome = await writeNote(note, media, report)
  } catch (error) {
    await discardAttachments(savedNames)
    throw error // 外側の catch がレポートに載せる
  }

  if (!outcome.ok) {
    await discardAttachments(savedNames)
    report.skipped.push({ label: noteLabel(note), reason: outcome.reason })
  }
}

type WriteOutcome = { ok: true } | { ok: false; reason: string }

// 本文を組み立てて 1 件保存する。「見送る」は例外ではなく戻り値で返す
// (呼び出し側が片付けと報告をまとめて行うため)。
async function writeNote(
  note: EnexNote,
  media: Map<string, EnexMedia>,
  report: ImportReport,
): Promise<WriteOutcome> {
  // 変換にかける前に断る。turndown は木を再帰で歩くので、細工した ENML は
  // 変換を始めた時点でイベントループを塞ぐ (enmlToMarkdown.ts の enmlRejectReason)
  const rejectReason = enmlRejectReason(note.content)
  if (rejectReason !== null) {
    return { ok: false, reason: rejectReason }
  }

  const converted = enmlToMarkdown(note.content, media)
  reportConversionLosses(note, converted, report)

  const memo = buildMemo(note.title, converted.markdown, collectTags(note, report))
  if (memo.length > MAX_TEXT_LENGTH) {
    // 上限を超えたノートは切り詰めずに飛ばす。黙って削るとどこが欠けたか
    // 判らないまま「取り込めた」ことになる
    return {
      ok: false,
      reason: `本文が長すぎます (${memo.length} 文字 / 上限 ${MAX_TEXT_LENGTH} 文字)`,
    }
  }

  const itemNo = await nextItemNo()
  // mode は memo 固定。ENEX に「URL ノート」に当たる区分は無い
  await upsertItem(itemNo, { memo, url: '', mode: 'memo' })

  // **行ができた直後に載せる**。日時の反映で転んだときに外側の catch が
  // 「入らなかった」と報告すると、利用者は取り込み直して二重に作ってしまう
  report.imported.push({ itemNo, title: note.title })

  try {
    await applyEnexTimestamps(itemNo, note)
  } catch (error) {
    // 本文は入っている。日時が取り込み時刻のままになるだけなので、
    // ノートごと失敗にはせず「何が欠けたか」だけ伝える
    console.error(`ENEX の日時を反映できませんでした (${itemNo}):`, error)
    report.skipped.push({
      label: `${noteLabel(note)} の作成・更新日時`,
      reason: '反映できませんでした (本文は取り込めています)',
    })
  }

  return { ok: true }
}

interface StoredResources {
  // 添付の md5 → 本文へ書く参照先
  media: Map<string, EnexMedia>
  // 巻き戻し用の保存名
  savedNames: string[]
}

async function storeResources(
  note: EnexNote,
  report: ImportReport,
  options: ImportOptions,
): Promise<StoredResources> {
  const media = new Map<string, EnexMedia>()
  const savedNames: string[] = []

  for (const resource of note.resources) {
    // 同じ添付を複数箇所から参照するノートがある。md5 が同じなら 1 回だけ保存し、
    // 本文の参照は同じ URL へ向ける (同じ画像を何枚も DB に増やさない)
    if (media.has(resource.md5)) {
      continue
    }

    // 復号はここで 1 件ずつ。保存が終われば次の周回で捨てられる
    // (全件を復号して抱えると 40MB の ENEX でメモリが跳ねる)。
    //
    // 画像検索の埋め込みは既定では**作らない**。モデルの読み込みだけで RSS が
    // 475MB 増える一方、取り込みは画像の数だけそれを撃つので、本番 VPS
    // (RAM 2GB) で動く Web の口では落ちる。embedding は派生キャッシュなので、
    // 後から scripts/backfillEmbeddings.ts で埋められる (imageStore.ts 参照)。
    // メモリに余裕のあるローカルからの一括取り込みだけ embedImages を立てる
    const deferEmbedding = !options.embedImages
    const stored = await storeAttachment(decodeResourceData(resource), {
      deferEmbedding,
      // その場で作るなら**待つ**。CLI は取り込み後すぐ接続を畳むので、
      // 待たないと最後の数枚が切断と競合して黙って欠ける
      awaitEmbedding: !deferEmbedding,
      maxBytes: options.maxAttachmentBytes,
      // テキスト添付の拡張子 (txt/csv/md) をこの申告から決める。
      // ENEX の mime は信用しないが、**名前は名前でしかない**ので使ってよい
      // (保存名はサーバ発番の UUID + 既知の拡張子)
      fileName: resource.fileName,
    })
    if (!stored.ok) {
      report.skipped.push({
        label: resourceLabel(note, resource),
        reason: stored.reason,
      })
      continue
    }

    savedNames.push(stored.name)
    if (stored.isImage && deferEmbedding) {
      report.deferredImageIndex += 1
    }
    media.set(resource.md5, {
      url: stored.url,
      isImage: stored.isImage,
      label: resource.fileName ?? '添付ファイル',
    })
  }

  return { media, savedNames }
}

// 本文の変換で落ちたものをレポートへ載せる。
//
// <en-media> の参照先が無いのは、その添付が保存に失敗した (storeResources が
// 既に報告済み) 場合と、ENEX 自体が壊れていて参照先が入っていない場合がある。
// 前者は二重に出るが、**出ないより出るほうがよい** — 本文のどこが欠けたかは
// 添付の保存失敗だけを見ても判らない
function reportConversionLosses(
  note: EnexNote,
  converted: EnmlConversion,
  report: ImportReport,
): void {
  for (const hash of converted.missingHashes) {
    report.skipped.push({
      label: `ノート「${noteTitle(note)}」の本文が参照する添付 (${hash})`,
      reason: '参照先の添付が見つかりませんでした (本文には跡を残しました)',
    })
  }
  if (converted.encryptedCount > 0) {
    report.skipped.push({
      label: `ノート「${noteTitle(note)}」の暗号化された部分 ${converted.encryptedCount} 箇所`,
      reason: 'Evernote の暗号化は端末側の鍵でしか開けません',
    })
  }
}

function collectTags(note: EnexNote, report: ImportReport): string[] {
  const tags: string[] = []
  for (const raw of note.tags) {
    const tag = enexTagToMemoTag(raw)
    if (tag === null) {
      report.skipped.push({
        label: `ノート「${noteTitle(note)}」のタグ「${raw}」`,
        reason: 'タグとして書ける文字がありません',
      })
      continue
    }
    if (!tags.includes(tag)) {
      tags.push(tag)
    }
  }
  return tags
}

// ENEX の作成・更新日時をそのまま反映する。
//
// Prisma の update は @updatedAt を必ず「いま」で打ってしまうので生 SQL で書く
// (items.ts の setItemPublic / scripts の backfill 群と同じ理由)。これをしないと
// 取り込んだ全ノートが同じ時刻に並び、更新順の一覧が意味をなさなくなる。
async function applyEnexTimestamps(itemNo: string, note: EnexNote): Promise<void> {
  const created = note.createdAt ?? note.updatedAt
  const updated = note.updatedAt ?? note.createdAt
  if (created === null || updated === null) {
    // どちらも無いノートは取り込んだ時刻のまま (upsert が入れた値) にする
    return
  }
  // **accessed_at は触らない** (docs/37-アクセス順計画.md §5)。列の既定値
  // (now()) のまま = 取り込んだ時刻が入る。これで取り込んだノートが
  // 「アクセス順」の先頭に並び、Evernote 由来の古い日時で埋もれずに済む
  // (更新順では 2012 年のノートとして沈む) — インポートの目的そのもの
  await prisma.$executeRaw`
    UPDATE items SET created_at = ${created}, updated_at = ${updated}
    WHERE item_no = ${itemNo}
  `
}

// 取り込みをやめたノートの添付を消す。
//
// **失敗しても投げない**。呼ぶのは既に「このノートは入らなかった」と決まった
// 後なので、片付けの失敗で本当の理由 (長すぎる・変換できない) を押しのけては
// ならない。残った行は参照されないだけなので、ログに名前を残して先へ進む。
//
// saveImage は埋め込みの生成を**待たずに**始める (docs/25-画像検索計画.md §4)
// ため、ここで行を消すとその後始末が「更新する行が無い」で転ぶことがある。
// 実測でサーバログに `埋め込みを保存できませんでした (P2025)` が 1 行出るが、
// 消したのはこちらの意図なので実害はない。**ログを見た人が原因を探して
// 迷わないようにここへ書いておく** (握り潰す代わりの説明責任)。
async function discardAttachments(names: string[]): Promise<void> {
  if (names.length === 0) {
    return
  }
  try {
    await prisma.image.deleteMany({ where: { name: { in: names } } })
  } catch (error) {
    console.error(
      `取り込みをやめたノートの添付を消せませんでした (${names.join(', ')}):`,
      error,
    )
  }
}

function noteTitle(note: EnexNote): string {
  return note.title === '' ? '(無題)' : note.title
}

function noteLabel(note: EnexNote): string {
  return `ノート「${noteTitle(note)}」`
}

// 添付を人が見分けるための名前。ファイル名が無い添付 (本文に貼った画像は
// たいてい無名) は MIME で代用する
function attachmentName(resource: {
  fileName: string | null
  mime: string
}): string {
  if (resource.fileName !== null && resource.fileName !== '') {
    return resource.fileName
  }
  return resource.mime === '' ? '添付ファイル' : resource.mime
}

function resourceLabel(note: EnexNote, resource: EnexResource): string {
  return `ノート「${noteTitle(note)}」の添付 ${attachmentName(resource)}`
}
