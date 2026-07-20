// ENEX 1 ファイルの上限 (docs/28-エクスポート計画.md §4)。
//
// **クライアントとサーバの両方から import する**ためにここへ切り出す。
// server 専用の依存 (prisma / node:crypto) を持つファイルに置くと、
// クライアント (EnexImporter) から読めない。
//
// クライアントでも検査する理由: 上限を超えたファイルはエッジ (nginx / Caddy)
// が 413 でボディを読み捨てるため、ブラウザからは送信中に接続が切れたように
// 見え、fetch が "Load failed" で失敗する。サーバの JSON エラーは届かないので、
// **送る前に**サイズを見て理由を言葉で出すしかない。
//
// 画像 1 枚の上限 (10MB) より桁を上げる。ENEX は 1 ファイルに本文と添付を
// まとめて抱えるので、写真が数枚入ったノートが並ぶだけで数十 MB になる
// (実データの書き出しが 40.2MB だった)。
//
// 一方で青天井にはしない — formData() は本文を丸ごとメモリに載せる。
// 本番 VPS は RAM 2GB で swap を常用しているため (docs/09-vps振り分け移行手順.md)、
// ここを上げるときは実データの大きさを確かめてからにすること。
// **エッジ (Caddyfile / deploy/nginx) の上限も一緒に上げる** — あちらが
// 低いままだと、アプリに届く前に 413 で切られる。
export const MAX_ENEX_BYTES = 64 * 1024 * 1024

export function enexTooLargeMessage(actualBytes: number): string {
  const actual = (actualBytes / 1024 / 1024).toFixed(1)
  const limit = MAX_ENEX_BYTES / 1024 / 1024
  return (
    `ファイルが大きすぎます (${actual}MB / 上限 ${limit}MB)。` +
    'Evernote 側でノートブックを分けて書き出すか、大きな添付を減らして下さい'
  )
}
