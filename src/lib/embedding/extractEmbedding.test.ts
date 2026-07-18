import { expect, test } from 'vitest'
import { extractEmbedding } from './extractEmbedding'

test('[1, D] のテンソルはその行を正規化して返す (CLIP 形式)', () => {
  const tensor = { data: new Float32Array([3, 4]), dims: [1, 2] }

  const vec = extractEmbedding(tensor)

  expect(vec[0]).toBeCloseTo(0.6)
  expect(vec[1]).toBeCloseTo(0.8)
})

test('[1, N, D] は先頭トークン (CLS) を取り正規化する (DINOv2 形式)', () => {
  // 2 トークン × 2 次元。先頭 [3,4] が CLS、2 つ目 [1,0] は無視される
  const tensor = { data: new Float32Array([3, 4, 1, 0]), dims: [1, 2, 2] }

  const vec = extractEmbedding(tensor)

  expect(vec).toHaveLength(2)
  expect(vec[0]).toBeCloseTo(0.6)
  expect(vec[1]).toBeCloseTo(0.8)
})

test('返り値は L2 正規化されている (ノルム 1)', () => {
  const tensor = { data: new Float32Array([1, 2, 2, 5, 5, 5]), dims: [1, 3, 2] }

  const vec = extractEmbedding(tensor)
  const norm = Math.hypot(...vec)

  expect(norm).toBeCloseTo(1)
})

test('想定外の形状は投げる', () => {
  expect(() => extractEmbedding({ data: new Float32Array([1]), dims: [1] })).toThrow()
  expect(() =>
    extractEmbedding({ data: new Float32Array([1, 2]), dims: [2, 1, 1, 1] }),
  ).toThrow()
})
