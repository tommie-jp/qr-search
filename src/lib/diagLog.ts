// 診断イベントのログ (docs/30-ブラウザログ計画.md §6)。
//
// メモリ不足の調査で「いつ・何が生きていたか」を実機の /logs から読むための
// 口。エラーではないので console は包まず、info として直接サーバへ送る。
//
// **メモリの数値は iPhone では取れない**。iOS は全ブラウザが WebKit で、
// performance.memory (Blink 独自)・navigator.deviceMemory・
// measureUserAgentSpecificMemory のどれも無く、残量は OS が隠している
// (jetsam は予告なく殺す)。取れる環境 (PC Chrome) でだけ JS ヒープを添える。
// iPhone ではイベントの**順序と経過時間**が診断の本体になる。
//
// 「大きな ArrayBuffer を試しに確保して残量を推定する」プローブはやらない —
// その確保自体が jetsam の引き金になり、調べたいものを調べる前に殺される。
//
// ブラウザ / Worker のどちらからも呼べる (sendClientLogs は Worker では
// Beacon が無く fetch に落ちるが、経路はそれで足りる)。

import { sendClientLogs } from './clientLogTransport'

export interface MemorySnapshot {
  usedMB: number
  limitMB: number
}

// Blink 系だけが持つ非標準 API の形。外から来る形は信じず数値を確かめる
interface PerformanceWithMemory {
  memory?: {
    usedJSHeapSize?: unknown
    jsHeapSizeLimit?: unknown
  }
}

const BYTES_PER_MB = 1024 * 1024

// performance.memory が読めれば JS ヒープの使用量/上限 (MB)。無ければ null。
// 引数はテストのため (既定は globalThis.performance)。
export function readMemorySnapshot(
  perf: unknown = typeof performance !== 'undefined' ? performance : undefined,
): MemorySnapshot | null {
  const memory = (perf as PerformanceWithMemory | undefined)?.memory
  if (!memory) {
    return null
  }
  const { usedJSHeapSize, jsHeapSizeLimit } = memory
  if (typeof usedJSHeapSize !== 'number' || typeof jsHeapSizeLimit !== 'number') {
    return null
  }
  return {
    usedMB: Math.round(usedJSHeapSize / BYTES_PER_MB),
    limitMB: Math.round(jsHeapSizeLimit / BYTES_PER_MB),
  }
}

// イベント文 + (取れれば) ヒープの要約。
export function formatDiagEvent(
  text: string,
  snapshot: MemorySnapshot | null,
): string {
  if (!snapshot) {
    return text
  }
  return `${text} [JSヒープ ${snapshot.usedMB}/${snapshot.limitMB}MB]`
}

// 診断イベントを 1 件送る。/logs に info バッジで並ぶ。
// 失敗ではないものに warn/error を使わない (本物の警告を info で薄めない)。
export function logDiagEvent(text: string): void {
  sendClientLogs([
    { level: 'info', text: formatDiagEvent(text, readMemorySnapshot()) },
  ])
}
