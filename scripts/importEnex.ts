// Evernote の .enex をローカル (WSL) から取り込む CLI
// (設計は docs/28-エクスポート計画.md §4)。
//
// **なぜ CLI があるのか**: 変換はメモリを食う。実データ (40.2MB) を Web の口
// (/api/import) へ投げると本番 VPS (RAM 2GB / swap 常用。docs/09) では重い。
// ローカルは潤沢なので、変換だけ手元でやって結果を DB へ書く。
// vps2 のイメージをローカルでビルドして送る doDeploy.sh と同じ考え方で、
// 「重い処理は手元、成果物だけ本番へ」に揃えている。
//
// **取り込みの中身は Web と同じ** — importEnex() をそのまま呼ぶだけ。
// 変換規則・レポート・巻き戻しを 2 か所に持たない (docs/28 §4)。
//
// 接続先は DATABASE_URL。vps2 へ入れるときは SSH トンネルを張った上で
// そちらを指す (doImportEnex.sh が面倒を見る)。
//
// 使い方:
//   npx tsx scripts/importEnex.ts <file.enex> [--yes] [--no-embed] [--check]
//
//   --check     ファイルを読むだけ (DB に触らない)。件数と、取り込めない
//               ノートを先に知りたいときに使う
//   --no-embed  画像検索の索引を作らない (既定は作る)。Web の口と違って
//               ローカルはメモリに余裕があるので、既定でその場まで作る
//   --yes       確認プロンプトを省く

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { prisma } from '@/lib/db'
import { enmlRejectReason } from '@/lib/enex/enmlToMarkdown'
import { type ImportReport, importEnex } from '@/lib/enex/importEnex'
import { MAX_CLI_ATTACHMENT_BYTES, MAX_ENEX_BYTES } from '@/lib/enex/limits'
import { decodeResourceData, parseEnex } from '@/lib/enex/parseEnex'

interface Args {
  file: string
  check: boolean
  embed: boolean
  yes: boolean
}

function parseArgs(argv: string[]): Args {
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const files = argv.filter((a) => !a.startsWith('--'))
  const known = new Set(['--check', '--no-embed', '--yes'])
  for (const flag of flags) {
    if (!known.has(flag)) {
      die(`知らないオプション: ${flag}`)
    }
  }
  if (files.length !== 1) {
    die('使い方: npx tsx scripts/importEnex.ts <file.enex> [--yes] [--no-embed] [--check]')
  }
  return {
    file: files[0],
    check: flags.has('--check'),
    embed: !flags.has('--no-embed'),
    yes: flags.has('--yes'),
  }
}

function die(message: string): never {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`

// 接続先を人が読める形にする (パスワードは出さない)。
//
// **これを必ず出す**のが肝。同じコマンドでローカルにも本番にも書けてしまうので、
// 「いまどっちへ入れようとしているか」を目で確かめられないと事故になる。
function describeTarget(): string {
  const raw = process.env.DATABASE_URL
  if (!raw) {
    die('DATABASE_URL が未設定。ローカルなら .env を、vps2 なら ./doImportEnex.sh を使うこと')
  }
  try {
    const url = new URL(raw)
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`
  } catch {
    return '(DATABASE_URL を解釈できない)'
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`${question} [y/N] `)
    return /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

// DB に触らずファイルだけ見る。取り込む前に「何件あって、何が入らないか」を
// 知るための下見
function check(xml: string): void {
  const notes = parseEnex(xml)
  console.log(`ノート: ${notes.length} 件`)

  let resources = 0
  let rejected = 0
  let bytes = 0
  const problems: string[] = []
  for (const note of notes) {
    resources += note.resources.length
    rejected += note.rejectedResources.length
    for (const bad of note.rejectedResources) {
      problems.push(`  添付が読めない: ${bad.fileName ?? bad.mime} (${bad.reason})`)
    }
    // 大きすぎる添付は取り込み時に落ちる。**下見で判るなら先に言う** —
    // 取り込んでから「本文には跡だけ残った」と知るのでは遅い
    for (const resource of note.resources) {
      const size = decodeResourceData(resource).byteLength
      bytes += size
      if (size > MAX_CLI_ATTACHMENT_BYTES) {
        problems.push(
          `  添付が大きすぎる: ${resource.fileName ?? resource.mime} ` +
            `(${mb(size)} / 上限 ${mb(MAX_CLI_ATTACHMENT_BYTES)})`,
        )
      }
    }
    const reason = enmlRejectReason(note.content)
    if (reason !== null) {
      problems.push(`  本文を変換できない: ${note.title || '(無題)'} — ${reason}`)
    }
  }

  console.log(
    `添付: ${resources} 件 / 計 ${mb(bytes)} (読めないもの ${rejected} 件)`,
  )
  if (problems.length === 0) {
    console.log('取り込めなさそうなものは見当たらない')
    return
  }
  console.log(`\n先に判る問題 (${problems.length} 件):`)
  for (const problem of problems.slice(0, 50)) {
    console.log(problem)
  }
  if (problems.length > 50) {
    console.log(`  ... 他 ${problems.length - 50} 件`)
  }
}

function printReport(report: ImportReport): void {
  console.log(`\n取り込み: ${report.imported.length} 件`)
  for (const note of report.imported) {
    console.log(`  ${note.itemNo}  ${note.title || '(無題)'}`)
  }

  if (report.skipped.length > 0) {
    console.log(`\n入らなかったもの: ${report.skipped.length} 件`)
    for (const entry of report.skipped) {
      console.log(`  ${entry.label}\n    → ${entry.reason}`)
    }
  }

  if (report.deferredImageIndex > 0) {
    console.log(
      `\n画像 ${report.deferredImageIndex} 枚は画像検索の索引を作っていない。` +
        '作るには npm run backfill:embeddings',
    )
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const stat = fs.statSync(args.file, { throwIfNoEntry: false })
  if (!stat) {
    die(`ファイルが無い: ${args.file}`)
  }
  console.log(`ファイル: ${args.file} (${mb(stat.size)})`)
  // CLI には Web の口のような上限は要らない (エッジも formData() も通らない)。
  // それでも桁違いのファイルは知らせる — 変換は入力に比例してメモリを食う
  if (stat.size > MAX_ENEX_BYTES) {
    console.log(
      `注意: Web の取り込み口の上限 (${mb(MAX_ENEX_BYTES)}) を超えている。` +
        'CLI は通すが、メモリの使用量も相応に増える',
    )
  }

  const xml = fs.readFileSync(args.file, 'utf8')

  if (args.check) {
    check(xml)
    return
  }

  const target = describeTarget()
  console.log(`書き込み先: ${target}`)
  console.log(`画像検索の索引: ${args.embed ? 'その場で作る' : '作らない (後で backfill)'}`)

  const before = await prisma.item.count()
  console.log(`いまのノート数: ${before} 件`)

  if (!args.yes && !(await confirm(`${target} へ取り込む。続行するか?`))) {
    console.log('中止した')
    return
  }

  const started = Date.now()
  const report = await importEnex(xml, {
    embedImages: args.embed,
    // Web の口の 10MB は HTTP アップロードの都合。ファイルから読むここでは
    // 持ち込まない (iPhone の写真は普通に超える。limits.ts に理由)
    maxAttachmentBytes: MAX_CLI_ATTACHMENT_BYTES,
  })
  console.log(`\n所要 ${((Date.now() - started) / 1000).toFixed(1)} 秒`)
  printReport(report)

  const after = await prisma.item.count()
  console.log(`\nノート数: ${before} → ${after} 件`)

  // レポートはファイルにも残す。件数が多いと端末のスクロールから溢れるうえ、
  // 「何が入らなかったか」は後から突き合わせたくなる (migrateFromVer1.ts と同じ流儀)
  const reportPath = path.join(
    path.dirname(args.file),
    `${path.basename(args.file, path.extname(args.file))}-import-report.json`,
  )
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`レポート: ${reportPath}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('取り込みに失敗:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
