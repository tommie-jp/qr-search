"use client";

import { useEffect, useId, useState } from "react";

// mermaid 本体は重いので、図を含むページを開いたときだけ動的 import する。
// import と initialize はモジュールで 1 回だけ行い、全インスタンスで共有する
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    return mermaid;
  });
  return mermaidPromise;
}

// 描画結果は「成功 (svg)」「失敗 (error)」「描画中 (null)」のいずれか 1 つ
type RenderState = { svg: string } | { error: string } | null;

interface MermaidDiagramProps {
  code: string;
}

// ```mermaid フェンスを図として描画する
export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const reactId = useId();
  const [state, setState] = useState<RenderState>(null);

  useEffect(() => {
    let cancelled = false;
    // mermaid.render の id は DOM id になるため useId の記号を除去する
    const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

    (async () => {
      try {
        const mermaid = await loadMermaid();
        const { svg } = await mermaid.render(renderId, code);
        if (!cancelled) {
          setState({ svg });
        }
      } catch (e) {
        // 構文エラー時に mermaid が body へ残す一時要素を掃除する
        // (外側の div は "d" + renderId の id を持つ)
        document.getElementById(`d${renderId}`)?.remove();
        document.getElementById(renderId)?.remove();
        if (!cancelled) {
          setState({ error: e instanceof Error ? e.message : String(e) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, reactId]);

  if (state && "error" in state) {
    return (
      <div className="mermaid-diagram rounded border border-red-300 bg-red-50 p-3">
        <p className="text-red-700">mermaid の構文エラー: {state.error}</p>
        <pre className="mt-2 overflow-x-auto text-sm text-gray-700">{code}</pre>
      </div>
    );
  }

  if (!state) {
    return <div className="mermaid-diagram text-gray-500">図を描画中…</div>;
  }

  // mermaid が生成した SVG (securityLevel: strict でサニタイズ済み) を埋め込む
  return (
    <div
      className="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
