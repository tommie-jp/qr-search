import { MEMO_INPUT_CLASS } from "./ui";

interface MemoTextareaProps {
  defaultValue: string;
  rows?: number;
  autoFocus?: boolean;
}

// item / edit 両ページで memo 入力の制約 (name, maxLength, placeholder) を共有する
export function MemoTextarea({
  defaultValue,
  rows = 10,
  autoFocus = false,
}: MemoTextareaProps) {
  return (
    <textarea
      name="memo"
      rows={rows}
      maxLength={10000}
      defaultValue={defaultValue}
      placeholder="メモを入力して下さい。"
      autoFocus={autoFocus}
      className={MEMO_INPUT_CLASS}
    />
  );
}
