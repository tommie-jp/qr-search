// お絵かきの取り消し履歴 (docs/34-お絵かき計画.md §5)。
//
// fabric のシーンを JSON 文字列にした「スナップショットの並び」と、いま居る
// 位置 (index) だけを持つ。取り消し / やり直しは位置を動かすだけで、entries は
// 書き換えない — なので新しい履歴は常に新しいオブジェクトとして返る (不変)。
//
// ここは DOM も fabric も触らない純粋な列操作だけを持つ。

export interface DrawHistory {
  // 古い順のスナップショット。index の指す要素が「いまの状態」
  readonly entries: readonly string[]
  readonly index: number
}

// 積む上限。fabric のシーン JSON は 1 枚が数 KB〜数十 KB になるため、
// 無制限に持つとスマホで効いてくる。40 手戻せれば実用上は足りる
export const DRAW_HISTORY_MAX = 40

export function createHistory(initial: string): DrawHistory {
  return { entries: [initial], index: 0 }
}

export function currentEntry(history: DrawHistory): string {
  return history.entries[history.index]
}

export function canUndo(history: DrawHistory): boolean {
  return history.index > 0
}

export function canRedo(history: DrawHistory): boolean {
  return history.index < history.entries.length - 1
}

// いまの状態として entry を積む。
// 取り消した後に描き足したときは、やり直せた先 (index より後ろ) を捨てる —
// 分岐した歴史は保持しない (エディタの undo と同じ振る舞い)。
export function pushHistory(
  history: DrawHistory,
  entry: string,
  max: number = DRAW_HISTORY_MAX,
): DrawHistory {
  if (entry === currentEntry(history)) {
    return history // 変化なしは積まない (描画イベントは同じ状態で何度も飛ぶ)
  }
  const appended = [...history.entries.slice(0, history.index + 1), entry]
  const overflow = Math.max(0, appended.length - max)
  const entries = overflow > 0 ? appended.slice(overflow) : appended
  return { entries, index: entries.length - 1 }
}

// 戻れないときは同じ履歴をそのまま返す (呼び手は参照の同一性で「何も起きな
// かった」を判定できる)
export function undoHistory(history: DrawHistory): DrawHistory {
  if (!canUndo(history)) {
    return history
  }
  return { entries: history.entries, index: history.index - 1 }
}

export function redoHistory(history: DrawHistory): DrawHistory {
  if (!canRedo(history)) {
    return history
  }
  return { entries: history.entries, index: history.index + 1 }
}
