import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "./MermaidDiagram";

interface MarkdownViewProps {
  markdown: string;
}

// react-markdown はカスタムコンポーネントに hast の node を渡してくるため、
// DOM 要素へ spread する前に取り除く
type MarkdownComponentProps<T extends "pre" | "a"> = ComponentProps<T> & {
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

// memo を Markdown としてレンダリングする Server Component。
// 生 HTML はデフォルトで無視されるが、保険として rehype-sanitize も通す
export function MarkdownView({ markdown }: MarkdownViewProps) {
  return (
    <div className="prose prose-sm max-w-none break-words rounded border border-gray-300 bg-white px-3 py-2">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          pre: preOrMermaid,
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
