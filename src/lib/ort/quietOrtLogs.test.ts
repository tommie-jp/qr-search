import { expect, test, vi } from 'vitest'
import { quietOrtSessionLogs } from './quietOrtLogs'

// ORT の警告抑止 (docs/30-ブラウザログ計画.md §1)。
// 本物の onnxruntime-web は WASM を読むのでテストでは動かせない。
// 包み方だけを偽の ort モジュールで確かめる

type FakeOrt = Parameters<typeof quietOrtSessionLogs>[0]

function fakeOrt() {
  const create = vi.fn(async (..._args: unknown[]) => 'session')
  const ort = {
    env: { logLevel: 'warning' },
    InferenceSession: { create },
  }
  return { ort: ort as unknown as FakeOrt, create, env: ort.env }
}

test('環境ロガーの閾値を error まで上げる', () => {
  const { ort, env } = fakeOrt()

  quietOrtSessionLogs(ort)

  expect(env.logLevel).toBe('error')
})

test('セッション生成に logSeverityLevel=3 (error) を足す', async () => {
  // env.logLevel だけでは効かない。onnxruntime-web が
  // `sessionOptions.logSeverityLevel ?? 2` と既定を持っているため
  const { ort, create } = fakeOrt()
  quietOrtSessionLogs(ort)

  const session = ort.InferenceSession as unknown as {
    create: (...args: unknown[]) => Promise<string>
  }
  await session.create(new Uint8Array([1]), { executionProviders: ['wasm'] })

  expect(create).toHaveBeenCalledWith(new Uint8Array([1]), {
    logSeverityLevel: 3,
    executionProviders: ['wasm'],
  })
})

test('呼び出し側が明示した logSeverityLevel は尊重する', async () => {
  const { ort, create } = fakeOrt()
  quietOrtSessionLogs(ort)

  const session = ort.InferenceSession as unknown as {
    create: (...args: unknown[]) => Promise<string>
  }
  await session.create(new Uint8Array([1]), { logSeverityLevel: 0 })

  expect(create).toHaveBeenCalledWith(new Uint8Array([1]), { logSeverityLevel: 0 })
})

test('options を省いた呼び出しにも足す', async () => {
  const { ort, create } = fakeOrt()
  quietOrtSessionLogs(ort)

  const session = ort.InferenceSession as unknown as {
    create: (...args: unknown[]) => Promise<string>
  }
  await session.create('/model.onnx')

  expect(create).toHaveBeenCalledWith('/model.onnx', { logSeverityLevel: 3 })
})

test('(buffer, byteOffset, byteLength, options) の形はそのまま流す', async () => {
  // 第 2 引数が数値のオーバーロード。options の位置を取り違えると壊れる
  const { ort, create } = fakeOrt()
  quietOrtSessionLogs(ort)

  const buffer = new ArrayBuffer(8)
  const session = ort.InferenceSession as unknown as {
    create: (...args: unknown[]) => Promise<string>
  }
  await session.create(buffer, 0, 8)

  expect(create).toHaveBeenCalledWith(buffer, 0, 8)
})

test('二重に掛けても包みは 1 重のまま', async () => {
  const { ort, create } = fakeOrt()

  quietOrtSessionLogs(ort)
  quietOrtSessionLogs(ort)

  const session = ort.InferenceSession as unknown as {
    create: (...args: unknown[]) => Promise<string>
  }
  await session.create(new Uint8Array([1]))

  // 二重に包むと logSeverityLevel を 2 度足すことになり、
  // 呼び出し側の指定を壊す余地が生まれる
  expect(create).toHaveBeenCalledTimes(1)
  expect(create).toHaveBeenCalledWith(new Uint8Array([1]), { logSeverityLevel: 3 })
})
