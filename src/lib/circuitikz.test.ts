import { describe, expect, test } from 'vitest'
import {
  CIRCUIT_TIMEOUT_MS,
  CircuitRenderError,
  circuitHash,
  renderCircuit,
  assertSafeCircuitSvg,
} from './circuitikz'

// TeX の起動込みで 1 枚あたり 1〜2 秒かかるため、既定の 5 秒では足りない
const RENDER_TIMEOUT_MS = 30_000

const SIMPLE = String.raw`\begin{circuitikz}
\draw (0,0) to[R=$R_1$] (2,0);
\end{circuitikz}`

const DIVIDER = String.raw`\begin{circuitikz}
\draw (0,0) to[isource, l=$I_0$] (0,3) to[short, -*] (2,3)
  to[R=$R_1$] (2,0) -- (0,0);
\end{circuitikz}`

describe('circuitHash', () => {
  test('is stable for the same source', () => {
    expect(circuitHash(SIMPLE)).toBe(circuitHash(SIMPLE))
  })

  test('differs for different sources', () => {
    expect(circuitHash(SIMPLE)).not.toBe(circuitHash(DIVIDER))
  })

  test('is a hex digest usable as a primary key', () => {
    expect(circuitHash(SIMPLE)).toMatch(/^[0-9a-f]{64}$/)
  })

  // Wikimedia の Math 拡張はレンダラ版をキーに含めておらず、
  // レンダラ更新時にキャッシュが無効化されない。同じ轍を踏まない
  test('changes when the renderer version changes', () => {
    expect(circuitHash(SIMPLE, 'v1')).not.toBe(circuitHash(SIMPLE, 'v2'))
  })
})

describe('assertSafeCircuitSvg', () => {
  test('passes the drawing itself through unchanged', () => {
    const svg =
      '<svg viewBox="0 0 1 1"><g stroke="#000"><path d="M0 0"/></g><text x="1">R</text></svg>'
    expect(assertSafeCircuitSvg(svg)).toBe(svg)
  })

  test('allows the self-hosted font @import', () => {
    const svg = '<svg><defs><style>@import url(/tikzjax/fonts.css);</style></defs></svg>'
    expect(assertSafeCircuitSvg(svg)).toContain('/tikzjax/fonts.css')
  })

  // 以下はいずれも、旧「危険なものを消す」実装が実際に取り逃がしていたもの
  test('rejects script elements', () => {
    expect(() => assertSafeCircuitSvg('<svg><script>alert(1)</script></svg>')).toThrow(
      CircuitRenderError,
    )
  })

  test('rejects a self-closing script tag', () => {
    expect(() => assertSafeCircuitSvg('<svg><script xlink:href="data:,alert(1)"/></svg>')).toThrow(
      CircuitRenderError,
    )
  })

  test('rejects SMIL animation that assigns an event handler', () => {
    expect(() =>
      assertSafeCircuitSvg('<svg><set attributeName="onload" to="alert(1)"/></svg>'),
    ).toThrow(CircuitRenderError)
  })

  test('rejects javascript: links', () => {
    expect(() => assertSafeCircuitSvg('<svg><a href="javascript:alert(1)"/></svg>')).toThrow(
      CircuitRenderError,
    )
  })

  test('rejects event handler attributes', () => {
    expect(() => assertSafeCircuitSvg('<svg onload="alert(1)"><path/></svg>')).toThrow(
      CircuitRenderError,
    )
    expect(() => assertSafeCircuitSvg('<svg><path onclick=alert(2) /></svg>')).toThrow(
      CircuitRenderError,
    )
  })

  test('rejects foreignObject (任意の HTML を持ち込める)', () => {
    expect(() =>
      assertSafeCircuitSvg('<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>'),
    ).toThrow(CircuitRenderError)
  })

  test('rejects references to the outside world', () => {
    expect(() => assertSafeCircuitSvg('<svg><use href="https://evil.example/x"/></svg>')).toThrow(
      CircuitRenderError,
    )
    expect(() =>
      assertSafeCircuitSvg('<svg><style>@import url(https://evil.example/x.css);</style></svg>'),
    ).toThrow(CircuitRenderError)
  })

  test('allows internal references (glyph の再利用)', () => {
    const svg = '<svg><defs><path id="g1" d="M0 0"/></defs><use href="#g1"/></svg>'
    expect(assertSafeCircuitSvg(svg)).toBe(svg)
  })
})

describe('renderCircuit', () => {
  test(
    'renders a circuitikz source to SVG',
    async () => {
      // Arrange / Act
      const svg = await renderCircuit(SIMPLE)

      // Assert
      expect(svg).toMatch(/^<svg[\s>]/)
      expect(svg).toContain('</svg>')
      expect(svg).toContain('<path')
    },
    RENDER_TIMEOUT_MS,
  )

  test(
    'is deterministic for the same source',
    async () => {
      const [a, b] = [await renderCircuit(SIMPLE), await renderCircuit(SIMPLE)]
      expect(a).toBe(b)
    },
    RENDER_TIMEOUT_MS,
  )

  test(
    'references only self-hosted fonts (never a CDN)',
    async () => {
      const svg = await renderCircuit(DIVIDER)
      expect(svg).toContain('/tikzjax/fonts.css')
      expect(svg).not.toMatch(/jsdelivr|cdn\./)
    },
    RENDER_TIMEOUT_MS,
  )

  test(
    'throws CircuitRenderError with the TeX log on a syntax error',
    async () => {
      const broken = String.raw`\begin{circuitikz}
\draw (0,0) to[NOSUCHCOMPONENT=$R$] (2,0);
\end{circuitikz}`

      const error = await renderCircuit(broken).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(CircuitRenderError)
      // 素の例外文言は役に立たないので、stdout から拾った原因行を載せる
      expect((error as CircuitRenderError).texLog).toContain('NOSUCHCOMPONENT')
    },
    RENDER_TIMEOUT_MS,
  )

  test(
    'kills a runaway TeX loop instead of hanging forever',
    async () => {
      // tex2svg には timeout が無く、これは放置すると永遠に返らない
      const loop = String.raw`\def\x{\x}\x`

      const started = Date.now()
      const error = await renderCircuit(loop).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(CircuitRenderError)
      expect((error as CircuitRenderError).message).toMatch(/中断/)
      // 本質はここ: 放置すれば無限に返らないものが、上限時間で確実に返ること
      expect(Date.now() - started).toBeGreaterThanOrEqual(CIRCUIT_TIMEOUT_MS)
      expect(Date.now() - started).toBeLessThan(CIRCUIT_TIMEOUT_MS + 5_000)
    },
    CIRCUIT_TIMEOUT_MS + 20_000,
  )

  test(
    'serializes concurrent renders (node-tikzjax は同時実行できない)',
    async () => {
      const [a, b] = await Promise.all([
        renderCircuit(SIMPLE),
        renderCircuit(DIVIDER),
      ])

      expect(a).toMatch(/^<svg[\s>]/)
      expect(b).toMatch(/^<svg[\s>]/)
      expect(a).not.toBe(b)
    },
    RENDER_TIMEOUT_MS * 2,
  )
})

// dvi2html の \special{dvisvgm:raw ...} は中身をエスケープせず SVG へ流し込む。
// TeX の素の命令なのでパッケージも要らず、ここが任意マークアップの唯一の注入口。
// フェンスに web で拾った細工済みスニペットを貼られる筋があるので、
// 実際に描画させたうえで弾けることを確かめる (許可リストの本番相当の検証)
describe('dvisvgm:raw injection', () => {
  const cases: Record<string, string> = {
    'javascript link': String.raw`\begin{tikzpicture}
\special{dvisvgm:raw <a xlink:href='javascript:alert(document.cookie)'><rect width='999' height='999' fill='red'/></a>}
\draw (0,0) -- (1,1);
\end{tikzpicture}`,
    'tracking beacon': String.raw`\begin{tikzpicture}
\special{dvisvgm:raw <image href='https://evil.example/beacon.png' width='1' height='1'/>}
\draw (0,0) -- (1,1);
\end{tikzpicture}`,
    'event handler': String.raw`\begin{tikzpicture}
\special{dvisvgm:raw <rect onload='alert(1)' width='9' height='9'/>}
\draw (0,0) -- (1,1);
\end{tikzpicture}`,
  }

  for (const [name, source] of Object.entries(cases)) {
    test(
      `rejects ${name}`,
      async () => {
        const error = await renderCircuit(source).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(CircuitRenderError)
      },
      RENDER_TIMEOUT_MS,
    )
  }
})

// circuitikz の op amp は +/- を 6pt の boldmath で組むが、TikZJax は
// cmmib5 を同梱しておらず、素のままだと TeX ごと落ちてオペアンプが
// 一切描けない。プリアンブルの回避策が効いていることを守る
test(
  'renders an op amp (cmmib5 が無くても落ちない)',
  async () => {
    const svg = await renderCircuit(String.raw`\begin{circuitikz}
\draw (0,0) node[op amp](OA){};
\draw (OA.out) to[short, -o] (2,0);
\end{circuitikz}`)

    expect(svg).toMatch(/^<svg[\s>]/)
    expect(svg).toContain('<path')
  },
  30_000,
)
