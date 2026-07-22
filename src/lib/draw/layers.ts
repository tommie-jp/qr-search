// お絵かきのセッション内レイヤ (docs/50-お絵かきレイヤ計画.md)。
//
// レイヤは「固定 3 枚」で、各描画オブジェクトの拡張プロパティ layer (1〜3) と
// canvas のオブジェクト列 (レイヤ 1 の帯 → 2 → 3) で表す。Group は使わない
// (§3-1)。ここは fabric も DOM も触らない純粋な列・集合操作だけを持つ。
//
// レイヤの状態 (どれがアクティブか・どれを隠しているか) は道具や色と同じ
// 「見る側の状態」で、取り消し履歴には積まない (§2)。

// 最背面が 1、最前面が 3。並べ替え・追加・削除はしない
export const LAYER_IDS = [1, 2, 3] as const
export const LAYER_COUNT = LAYER_IDS.length

export type LayerId = (typeof LAYER_IDS)[number]

export interface LayerState {
  readonly active: LayerId
  // 非表示のレイヤ。昇順・重複なしに正規化して持つ (equality を素直にするため)
  readonly hidden: readonly LayerId[]
}

// オブジェクトごとの働きを決める 3 フラグ。当て直しはこの導出だけに集約する
export interface LayerFlags {
  // 描く/書き出すか
  readonly visible: boolean
  // 消しゴム (@erase2d) が消せるか
  readonly erasable: boolean
  // 選択道具が掴めるか
  readonly selectable: boolean
}

export function createLayerState(): LayerState {
  return { active: 1, hidden: [] }
}

export function isLayerHidden(state: LayerState, layer: LayerId): boolean {
  return state.hidden.includes(layer)
}

// (そのオブジェクトの layer, レイヤ状態, 選択道具か) → フラグ一式 (§3-2)。
// 消しゴム・選択はアクティブレイヤ限定。見えないものはどちらも効かない
export function layerFlags(
  layer: LayerId,
  state: LayerState,
  isSelectTool: boolean,
): LayerFlags {
  const visible = !isLayerHidden(state, layer)
  const onActive = layer === state.active && visible
  return {
    visible,
    erasable: onActive,
    selectable: onActive && isSelectTool,
  }
}

// z 順の layer 列に対し、target レイヤの帯の末尾に新オブジェクトを挿す位置を
// 返す (§3-1)。帯は 1 → 2 → 3 の順なので、layer <= target のものは新しい
// オブジェクトより下 (前) に、layer > target のものは上 (後ろ) に来る。
// よって挿入位置は「target 以下のレイヤに属するオブジェクトの数」
export function insertionIndex(
  layers: readonly LayerId[],
  target: LayerId,
): number {
  let count = 0
  for (const layer of layers) {
    if (layer <= target) {
      count += 1
    }
  }
  return count
}

// レイヤの表示/非表示を切り替える。**アクティブレイヤは隠せない** (§2) ——
// 見えない場所に描く事故を作らないため、要求が来ても状態を変えず同じ参照を返す
// (呼び手は参照の同一性で「何も起きなかった」を判定できる)
export function toggleHidden(state: LayerState, layer: LayerId): LayerState {
  if (layer === state.active) {
    return state
  }
  if (isLayerHidden(state, layer)) {
    return { ...state, hidden: state.hidden.filter((id) => id !== layer) }
  }
  const hidden = [...state.hidden, layer].sort((a, b) => a - b)
  return { ...state, hidden }
}

// アクティブレイヤを移す。アクティブは必ず見えていなければならない (§2) ので、
// 隠していたレイヤをアクティブにするなら非表示集合から外す
export function setActive(state: LayerState, layer: LayerId): LayerState {
  if (layer === state.active) {
    return state
  }
  return { active: layer, hidden: state.hidden.filter((id) => id !== layer) }
}
