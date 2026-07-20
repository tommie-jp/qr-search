// テキスト添付の受け入れ判定と正規化 (docs/12-添付ファイル種類拡張メモ.md)。
//
// **画像・音声・PDF と違い、テキストには先頭バイトの署名が無い。** そのため
// 「これはテキストか」を積極的に確かめるしかなく、判定は 2 段構えにする:
//
//   1. 対応する文字コードで**厳密に**デコードできること (fatal: true)
//   2. デコード結果に制御文字が無いこと (タブ・改行を除く)
//
// 2 が要点。実行ファイルや ZIP (docx/xlsx の実体) は 1 を運よく抜けることが
// あっても、C0 制御文字をほぼ必ず含むのでここで落ちる。拡張子を .txt に
// 偽装したバイナリを受けないための砦になっている。
//
// 受け付けたものは **UTF-8 に正規化してから保存する** (HEIC を WebP へ直すのと
// 同じ流儀)。保存時に 1 通りへ寄せておけば、配信は常に charset=utf-8 で済み、
// 表示側が文字コードを推測する必要が無くなる。

// 試す文字コードと**その順番**。UTF-8 を先に見る。
// Shift_JIS を足しているのは、Windows で書き出した日本語 CSV が今もこの形で
// 出てくるため。順番を逆にしてはいけない — UTF-8 の日本語は Shift_JIS
// としても「読めてしまう」ことがあり、先に試したほうが勝ってしまう
const ENCODINGS = ['utf-8', 'shift_jis'] as const

// 許すのはタブ (09)・改行 (0A)・復帰 (0D) だけ。他の制御文字が 1 つでも
// あればテキストとして扱わない (NUL を含むバイナリはここで落ちる)。
// DEL (7F) と C1 (80-9F) まで見るのは、**デコード後の文字**で判定しているため —
// C1 は UTF-8 では 2 バイト列として「正しく」デコードされてしまい、
// C0 だけ見ていると素通りする
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/

// 指定の文字コードで厳密にデコードする。1 バイトでも不正なら null。
// **fatal: true が肝** — 既定の置換文字 (U+FFFD) 任せだと、どんなバイト列でも
// 「デコードできた」ことになってしまい判定にならない
function decodeStrict(bytes: Uint8Array, encoding: string): string | null {
  try {
    // ignoreBOM は既定の false のまま = BOM は読み飛ばされる。
    // BOM 付き CSV (Excel の書き出し) をそのまま受け、保存では落とせる
    return new TextDecoder(encoding, { fatal: true }).decode(bytes)
  } catch {
    // このエンコーディングでは読めなかった (壊れている or 別の文字コード)
    return null
  }
}

// テキストとして受け付けられるなら UTF-8 に正規化したバイト列を、
// 受け付けられないなら null を返す。**例外は投げない** (呼び出し側の
// attachmentStore は「次の形式を試す」だけなので、判定は真偽で足りる)。
export function normalizeTextBytes(
  bytes: Uint8Array,
): Uint8Array<ArrayBuffer> | null {
  // 空ファイルは中身が無く、表示しても何も出ない。テキストと名乗る根拠も
  // 無いので受けない (バイナリの空ファイルと区別が付かない)
  if (bytes.byteLength === 0) {
    return null
  }

  for (const encoding of ENCODINGS) {
    const text = decodeStrict(bytes, encoding)
    if (text === null) {
      continue
    }
    // 読めても中身がバイナリなら受けない。**次の文字コードは試さない** —
    // 「読めたが制御文字がある」= テキストではない、と結論できるため
    return CONTROL_CHARS.test(text) ? null : new TextEncoder().encode(text)
  }
  return null
}
