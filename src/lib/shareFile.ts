// ファイルを OS の共有シートへ渡す (docs/12-添付ファイル種類拡張メモ.md)。
//
// **なぜ要るか**: ホーム画面から起動した PWA (standalone) には、PDF を印刷・
// 保存・他アプリへ送る手段が無い。ブラウザなら「新しいタブ」でネイティブ
// ビューアへ逃がせるが、standalone ではそれができない (displayMode.ts)。
// 共有シートなら OS 側にそれらを委ねられ、閉じれば PWA に戻る。
//
// **URL ではなくファイルの実体を渡す**のが要点。iOS のホーム画面 web app は
// Safari と Cookie を共有しないため、認証つきの URL を渡しても共有先では
// ログイン要求に化ける。バイト列を渡せばその問題が起きない。

// 共有できるかの検出。**ダミーの File で canShare を試す**のが肝で、
// navigator.share の有無だけでは足りない — ファイル共有 (Web Share Level 2) は
// URL 共有と別物で、デスクトップ Linux Chrome などは share があっても
// ファイルは受け取れない。
export function canShareFiles(nav: Navigator = navigator): boolean {
  if (typeof nav?.share !== 'function' || typeof nav.canShare !== 'function') {
    return false
  }
  try {
    // 中身は見られないので空で構わない。判定は型と API の対応可否だけ
    const probe = new File([], 'probe.pdf', { type: 'application/pdf' })
    return nav.canShare({ files: [probe] })
  } catch {
    // File が作れない環境 (古いブラウザ) は共有もできないとみなす
    return false
  }
}

// 共有シートを閉じた・キャンセルしたときの合図。**失敗ではない**ので、
// 呼び出し側はこれをエラー表示しない
export function isShareAborted(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  )
}

// PDF のバイト列を共有シートへ渡す。
//
// **ユーザー操作の直後に呼ぶこと**。iOS は transient activation が切れると
// NotAllowedError で弾くため、呼ぶ前に通信を挟まない
// (バイト列は表示のために読み込み済みのものを使う。pdfService.getData)。
export async function sharePdf(
  bytes: Uint8Array,
  fileName: string,
  nav: Navigator = navigator,
): Promise<void> {
  // Uint8Array をそのまま渡さず、実体の ArrayBuffer を切り出して File にする
  // (Prisma と同じで、共有プールを指す view を渡さない)
  const file = new File([bytes.slice().buffer as ArrayBuffer], fileName, {
    type: 'application/pdf',
  })
  await nav.share({ files: [file], title: fileName })
}
