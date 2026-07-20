// 一覧の並び順 → ORDER BY 句 (DB 非依存の純関数)。
//
// items.ts ではなくここに置くのは、items.ts が db.ts 経由で DATABASE_URL を
// 要求するため。純関数として切り出せばテストできる (itemNo.ts と同じ理由)。
//
// 並びの設計 (docs/37-アクセス順計画.md):
//   番号順      … シールに印刷した番号を辿るとき
//   更新順      … 既定。書いた順に積み上がる
//   アクセス順  … 最近見た順。ENEX から取り込んだノートは作成・更新日時が
//                 Evernote 由来 (2012 年など) で更新順では埋もれるため

import type { Sort } from './validation'

// **どの並びも item_no で決着させる**のが要点。同時刻の行 (インポート直後など)
// で並びが不定になると、ページ送りと前後ナビが読み込みのたびに揺れる
// (docs/15 §2-2)。
//
// 戻り値は**この関数が持つ定数のみ**。呼び出し側は Prisma.raw に通すので、
// 引数の文字列がそのまま SQL に混ざらないことをここで保証する
// (switch を素通りした値は既定へ倒す)。
export function orderByClause(sort: Sort): string {
  switch (sort) {
    case 'itemNo':
      // 非数字の itemNo は item_no_num が null なので末尾へ回す
      return 'item_no_num ASC NULLS LAST, item_no ASC'
    case 'accessed':
      // 見ていないノートが同着になったときは更新順で解く
      return 'accessed_at DESC, updated_at DESC, item_no ASC'
    default:
      return 'updated_at DESC, item_no ASC'
  }
}
