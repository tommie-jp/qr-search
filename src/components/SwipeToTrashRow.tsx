"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  SWIPE_BUTTON_WIDTH,
  beginSwipe,
  initialSwipeState,
  moveSwipe,
  resolveOpen,
  settleSwipe,
  type SwipeState,
} from "@/lib/swipeRow";

interface SwipeToTrashRowProps {
  itemNo: string;
  // ノートをゴミ箱へ入れるサーバーアクション (BulkTagToolbar と同じ trashItemsAction)。
  trashAction: (formData: FormData) => void | Promise<void>;
  // この行が開いているか。「開くのは常に 1 行だけ」を親 (ItemList) が持つ。
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // 中身は ItemRow が組み立てた小表示 1 行ぶん。
  children: ReactNode;
}

// 小表示の 1 行を左スワイプで削除できるようにするラッパー
// (docs/43-スワイプ削除計画.md)。判定ロジックは lib/swipeRow.ts の純関数に
// 任せ、ここは pointer と DOM/React state の橋渡しに徹する。
//
//   背面 … 右端に固定した赤い「削除」ボタン。
//   前面 … 既存の行 (bg-white)。translateX で左へずれてボタンを露出させる。
export function SwipeToTrashRow({
  itemNo,
  trashAction,
  isOpen,
  onOpenChange,
  children,
}: SwipeToTrashRowProps) {
  // 動きの真実は ref に持つ (pointer ハンドラが前回値を同期に読めるように)。
  // ref は描画では触らず (react-hooks/refs)、offset / dragging を state へ写す。
  const stateRef = useRef<SwipeState>(initialSwipeState(isOpen));
  const [offset, setOffset] = useState(() =>
    isOpen ? -SWIPE_BUTTON_WIDTH : 0,
  );
  const [dragging, setDragging] = useState(false);
  // ドラッグ直後に飛んでくる click を 1 回だけ握りつぶす印
  // (stretched link がノートを開いてしまうのを防ぐ)。
  const suppressClick = useRef(false);
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const apply = (next: SwipeState) => {
    stateRef.current = next;
    setOffset(next.offset);
    setDragging(next.phase === "dragging");
  };

  // 親が別の行を開いた等でこの行の開閉指示が変わったら、指を離している間だけ
  // 追従する (ドラッグ中に横取りしない)。ref は effect の中で触る。
  useEffect(() => {
    if (stateRef.current.phase === "idle") {
      apply(settleSwipe(isOpen));
    }
  }, [isOpen]);

  const busy = removing || isPending;

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (busy) return;
    // マウスは左ボタンのときだけ (右クリックのコンテキストメニューを邪魔しない)。
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // 新しいジェスチャの開始で、前のドラッグが残した抑止フラグを捨てる。
    // 大きく払って開くと click が飛んでこず、抑止フラグが消費されないまま
    // 残る。それを次のタップ (閉じる操作) の click が食ってしまうため、
    // ここで必ずリセットする。同じジェスチャ内の click だけを抑止できる。
    suppressClick.current = false;
    apply(beginSwipe(stateRef.current, e.clientX, e.clientY, e.timeStamp));
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = stateRef.current;
    if (prev.phase === "idle") return;
    const next = moveSwipe(prev, e.clientX, e.clientY, e.timeStamp);
    // 横と確定した瞬間だけ pointer を捕まえ、枠の外へ出ても move を受け続ける。
    if (next.phase === "dragging" && prev.phase !== "dragging") {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    apply(next);
  };

  const handlePointerUp = () => {
    const prev = stateRef.current;
    if (prev.phase !== "dragging") {
      // ドラッグに至らなかった (=タップ)。開閉は動かさない。click 側で処理する。
      if (prev.phase === "tracking") {
        apply(settleSwipe(isOpen));
      }
      return;
    }
    if (prev.dragged) {
      suppressClick.current = true;
    }
    const open = resolveOpen(prev);
    apply(settleSwipe(open));
    onOpenChange(open);
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    // ドラッグ直後の click は 1 回だけ握りつぶす。
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // 開いている間の行タップは「閉じる」だけ。ノートへは飛ばさない
    // (iOS 標準の作法。誤操作でノートが開くのを防ぐ)。
    if (stateRef.current.offset !== 0) {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    }
  };

  const handleDelete = () => {
    if (busy) return;
    setFailed(false);
    setRemoving(true);
    const formData = new FormData();
    formData.append("itemNo", itemNo);
    startTransition(async () => {
      try {
        await trashAction(formData);
        // 成功時は revalidate で一覧からこの行ごと消えるので、畳んだまま待つ。
      } catch {
        // 失敗したら畳みを戻してエラーを見せる (静かに握りつぶさない)。
        setRemoving(false);
        setFailed(true);
      }
    });
  };

  const open = offset !== 0;

  return (
    <li
      // overflow-hidden … はみ出した削除ボタンと、畳むときの高さを切る。
      // max-h … 削除実行後に高さ 0 へ潰してから消えるので、サーバ反映までの
      // 「押したのに残っている」空白を作らない。
      className={`relative overflow-hidden transition-all duration-200 ${
        removing ? "max-h-0 opacity-0" : "max-h-24"
      }`}
    >
      {/* 背面: 右端に固定した削除ボタン */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy || !open}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label={`#${itemNo} を削除`}
        style={{ width: SWIPE_BUTTON_WIDTH }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-600 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "…" : "削除"}
      </button>

      {/* 前面: 既存の行。指に追従してずらす */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
        // pan-y … 縦スクロールはブラウザに任せ、横だけこちらが取る。
        // ドラッグ中だけ transition を外して指に張り付かせる。
        className={`relative bg-white touch-pan-y ${
          dragging ? "" : "transition-transform duration-200"
        }`}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
        {failed && (
          <p className="px-4 pb-1 text-sm text-red-600" role="alert">
            削除に失敗しました。通信を確認して再度お試しください。
          </p>
        )}
      </div>
    </li>
  );
}
