import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema, type Options } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { MermaidDiagram } from "./MermaidDiagram";
import { ZoomableImage } from "./ZoomableImage";
import { BOX_CLASS } from "./ui";
import "katex/dist/katex.min.css";

// rehype-katex は code の math-inline / math-display クラスを目印にするため、
// sanitize で落とされないよう許可する (language-* はデフォルトでも許可)。
// sanitize → katex の順にすることで、ユーザー入力は sanitize 済み・
// KaTeX が生成した HTML はそのまま残る (remark-math 公式レシピ)
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [["className", /^language-./, "math-inline", "math-display"]],
  },
} satisfies Options;

// \rule{99999em}{...} のような巨大サイズ指定でページを潰せないよう上限を設ける
// (KaTeX の maxSize デフォルトは Infinity)
const KATEX_MAX_SIZE_EM = 50;

interface MarkdownViewProps {
  markdown: string;
}

// react-markdown はカスタムコンポーネントに hast の node を渡してくるため、
// DOM 要素へ spread する前に取り除く
type MarkdownComponentProps<T extends "pre" | "a" | "img"> = ComponentProps<T> & {
  node?: unknown;
};

// フェンスコードの中身 (pre > code) が mermaid なら図に差し替える
function preOrMermaid({
  node: _node,
  children,
  ...props
}: MarkdownComponentProps<"pre">) {
  const child = Children.toArray(children)[0];
  if (
    isValidElement<{ className?: string; children?: ReactNode }>(child) &&
    /\blanguage-mermaid\b/.test(child.props.className ?? "")
  ) {
    const code = Children.toArray(child.props.children)
      .filter((c): c is string => typeof c === "string")
      .join("");
    return <MermaidDiagram code={code.trim()} />;
  }
  return <pre {...props}>{children}</pre>;
}

// alt 末尾の "|数字" を表示幅 (px) として解釈する (例: ![スクショ|200](/api/images/x.png))。
// 生 HTML を無効にしたまま画像ごとに幅を指定できるようにするための独自記法。
// 画像はクリックで拡大できるよう ZoomableImage で描画する
function imgWithWidth({
  node: _node,
  alt,
  ...props
}: MarkdownComponentProps<"img">) {
  const match = /^(.*?)\|(\d+)$/.exec(alt ?? "");
  if (match) {
    return <ZoomableImage {...props} alt={match[1]} width={Number(match[2])} />;
  }
  return <ZoomableImage {...props} alt={alt} />;
}

// memo を Markdown としてレンダリングする Server Component。
// 生 HTML はデフォルトで無視されるが、保険として rehype-sanitize も通す
export function MarkdownView({ markdown }: MarkdownViewProps) {
  return (
    <div className={`prose prose-sm max-w-none break-words ${BOX_CLASS}`}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
        rehypePlugins={[
          [rehypeSanitize, sanitizeSchema],
          [rehypeKatex, { maxSize: KATEX_MAX_SIZE_EM }],
        ]}
        components={{
          pre: preOrMermaid,
          img: imgWithWidth,
          a: ({ node: _node, children, ...props }: MarkdownComponentProps<"a">) => (
            <a {...props} className="break-all" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
