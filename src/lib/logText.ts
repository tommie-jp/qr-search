// console の引数を 1 行の文字列にする。サーバ側 (logBuffer.ts) と
// ブラウザ側 (clientLogCapture.ts) が同じ整形を使うためここに置く。

import { LOG_TEXT_LIMIT } from './logEntry'

// Error は message だけ採る (stack は 1 行の一覧では読めない。詳細は
// docker compose logs / eruda に残っている)。文字列化に失敗する値
// (循環参照など) は String() に落とす — 拾う側の失敗でログ自体を落とさない
export function formatLogArg(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg
  }
  if (arg instanceof Error) {
    return arg.message
  }
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

export function formatLogArgs(args: unknown[]): string {
  return args.map(formatLogArg).join(' ').slice(0, LOG_TEXT_LIMIT)
}
