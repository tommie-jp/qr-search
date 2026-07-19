// ハンバーガーメニューの行頭アイコン (docs/11-アプリ的UIUX計画.md §6)。
//
// アイコンライブラリは足さない。必要なのはここの数個だけで、そのために
// 依存とバンドルを増やす釣り合いが取れない (HeaderMenu の ☰ / ✕ を
// inline SVG で持っているのと同じ判断)。
//
// すべて currentColor で描く。行の文字色 (通常 / hover / 押下) にそのまま
// 追従し、色を別途指定しなくても浮かない。
// aria-hidden なのは、隣に必ず同じ意味の文字があるため — 読み上げに
// 「QR コード QR コード」と二重に出さない。

const SIZE_CLASS = "size-5 shrink-0";

// 線画のアイコンで共通の描き方。塗りではなく線で描くのは、メニューの
// 文字 (font-medium) と線の太さが揃って馴染むため
function StrokeIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={SIZE_CLASS}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// QR コード: 位置検出パターン (三隅の四角) が QR の見た目そのもの。
// 細かいセルまでは描かない — 20px では潰れて汚れにしか見えない
export function QrIcon() {
  return (
    <StrokeIcon>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v0M14 20v0M20 20v3M20 17h1" />
    </StrokeIcon>
  );
}

// ログ: 行の並んだ書類。線の長さを不揃いにして「文章が積まれている」形にする
export function LogIcon() {
  return (
    <StrokeIcon>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </StrokeIcon>
  );
}

// パスキー: 鍵。指紋と迷ったが、20px では指紋の渦が潰れて丸い染みになる
export function KeyIcon() {
  return (
    <StrokeIcon>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.9 12.1 20 3M17 6l2.5 2.5M14.5 8.5 17 11" />
    </StrokeIcon>
  );
}

// ログアウト: 囲いから外へ出る矢印。ログインと向きだけで対にする
export function LogoutIcon() {
  return (
    <StrokeIcon>
      <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h10" />
    </StrokeIcon>
  );
}

// ログイン: 囲いの中へ入る矢印 (ログアウトの鏡像)
export function LoginIcon() {
  return (
    <StrokeIcon>
      <path d="M9 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
      <path d="M14 17l5-5-5-5" />
      <path d="M19 12H9" />
    </StrokeIcon>
  );
}

// GitHub だけは線画にしない。Octocat は塗りで成立している商標で、
// 線でなぞると別物になる。公式 octicon (mark-github, MIT) の形をそのまま使う
export function GithubIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={SIZE_CLASS}
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

// 下部操作バー用アイコン (docs/31-下部操作バー計画.md §3-3)
// SIZE_CLASS は 20px だが、ここは 24px (タップ領域 44px に合わせて大きめ)

const BOTTOM_BAR_ICON_CLASS = "size-6 shrink-0";

function StrokeIconLarge({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={BOTTOM_BAR_ICON_CLASS}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// スキャン: QR コードの枠 (メニューの QrIcon と同形、24px で拡大)
export function ScanIcon() {
  return (
    <StrokeIconLarge>
      <rect x="2" y="2" width="9" height="9" rx="1" />
      <rect x="13" y="2" width="9" height="9" rx="1" />
      <rect x="2" y="13" width="9" height="9" rx="1" />
      <path d="M13 13h4v4h-4zM22 13v0M13 22v0M22 22v4M22 19h1" />
    </StrokeIconLarge>
  );
}

// 画像検索: 写真フレーム + 虫眼鏡
export function ImageSearchIcon() {
  return (
    <StrokeIconLarge>
      <rect x="3" y="3" width="12" height="12" rx="1" />
      <circle cx="8" cy="8" r="2" />
      <path d="M18 18l3.5 3.5M18 14a4 4 0 0 1 4 4" />
    </StrokeIconLarge>
  );
}

// 表示切替: リスト (コンパクト表示用)
export function ListViewIcon() {
  return (
    <StrokeIconLarge>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <rect x="3" y="4" width="2" height="2" rx="0.5" />
      <rect x="3" y="10" width="2" height="2" rx="0.5" />
      <rect x="3" y="16" width="2" height="2" rx="0.5" />
    </StrokeIconLarge>
  );
}

// 表示切替: グリッド (カード表示用)
export function GridViewIcon() {
  return (
    <StrokeIconLarge>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </StrokeIconLarge>
  );
}

// 並び順: 上下矢印
export function SortIcon() {
  return (
    <StrokeIconLarge>
      <path d="M12 5v14M5 12l7-7 7 7M5 12l7 7 7-7" />
    </StrokeIconLarge>
  );
}

// 選択: チェックボックス
export function SelectIcon() {
  return (
    <StrokeIconLarge>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 12l3 3 6-6" />
    </StrokeIconLarge>
  );
}
