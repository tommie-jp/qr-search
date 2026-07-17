// サーバログの控え (設計は docs/21-ログ表示計画.md)。
//
// console.warn / console.error を包み、元の console へ流しつつメモリ上の
// リングバッファに控える。/logs ページ (スマホ) から直近の失敗を見るため。
// 書影・書誌・商品情報の失敗は全部 console.warn/error に集約されているので、
// ここを包めば既存コードを 1 行も変えずに拾える。
//
// 起動時に instrumentation.ts が installConsoleCapture() を 1 回呼ぶ。

export interface LogEntry {
  // epoch ms。表示のときに Asia/Tokyo で整形する (サーバの TZ に依存させない)
  at: number
  level: 'warn' | 'error'
  text: string
}

export const LOG_BUFFER_SIZE = 200
export const LOG_TEXT_LIMIT = 2000

// バッファと「包んだか」は globalThis に持つ (db.ts と同じ理由)。
// dev のホットリロードでこのモジュールが再評価されても、控えが消えたり
// console が二重に包まれたりしない
interface LogGlobal {
  buffer: LogEntry[]
  original: { warn: typeof console.warn; error: typeof console.error } | null
}

const globalForLog = globalThis as unknown as { qrSearchLog?: LogGlobal }

function state(): LogGlobal {
  globalForLog.qrSearchLog ??= { buffer: [], original: null }
  return globalForLog.qrSearchLog
}

// console の引数 1 つを表示できる文字列にする。
// Error は message だけ採る (stack は 1 行の一覧では読めない。詳細は
// docker compose logs に残っている)。文字列化に失敗する値 (循環参照など) は
// String() に落とす — 拾う側の失敗でログ自体を落とさない
function formatArg(arg: unknown): string {
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

function push(level: LogEntry['level'], args: unknown[]): void {
  const { buffer } = state()
  buffer.push({
    at: Date.now(),
    level,
    text: args.map(formatArg).join(' ').slice(0, LOG_TEXT_LIMIT),
  })
  if (buffer.length > LOG_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - LOG_BUFFER_SIZE)
  }
}

// console.warn / console.error を包む。何度呼んでも包みは 1 重。
export function installConsoleCapture(): void {
  const s = state()
  if (s.original) {
    return // 包み済み
  }
  s.original = { warn: console.warn, error: console.error }
  console.warn = (...args: unknown[]) => {
    push('warn', args)
    s.original?.warn(...args) // ssh + docker compose logs の一次調査は殺さない
  }
  console.error = (...args: unknown[]) => {
    push('error', args)
    s.original?.error(...args)
  }
}

// 元の console に戻す (テストの後始末用。アプリは外さない)
export function uninstallConsoleCapture(): void {
  const s = state()
  if (!s.original) {
    return
  }
  console.warn = s.original.warn
  console.error = s.original.error
  s.original = null
}

// 新しい順で返す (画面は最新が知りたい)
export function recentLogs(): LogEntry[] {
  return [...state().buffer].reverse()
}

export function clearLogBuffer(): void {
  state().buffer = []
}
