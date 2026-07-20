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
// 画像アップロードと同じ枠にする。**エッジ (Caddyfile / deploy/nginx) の
// ボディ上限 12MB がこれと multipart の余白を賄っている**ので、この値を上げる
// ときはあちらも一緒に上げること。片方だけ上げると、アプリに届く前に 413 で
// 切られてブラウザには "Load failed" としか出ない (サーバの JSON エラーは届かない)。
//
// **大きい ENEX は Web からは入れない**。変換は入力に比例してメモリを食い、
// 本番 VPS は RAM 2GB で swap を常用している (docs/09-vps振り分け移行手順.md)。
// 実データの書き出しは 40.2MB あり、これはローカル (WSL) から
// ./doImportEnex.sh で取り込む。Web の口は「スマホから小さいものを入れる」用途に
// 絞り、エッジの防波堤を下げない (docs/28-エクスポート計画.md §4)。
export const MAX_ENEX_BYTES = 10 * 1024 * 1024

export function enexTooLargeMessage(actualBytes: number): string {
  const actual = (actualBytes / 1024 / 1024).toFixed(1)
  const limit = MAX_ENEX_BYTES / 1024 / 1024
  return (
    `ファイルが大きすぎます (${actual}MB / 上限 ${limit}MB)。` +
    '大きいファイルは PC 上で ./doImportEnex.sh から取り込むか、' +
    'Evernote 側でノートブックを分けて書き出して下さい'
  )
}
