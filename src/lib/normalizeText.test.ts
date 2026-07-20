import { expect, test } from 'vitest'
import { normalizeTextBytes } from './normalizeText'

const utf8 = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

test('UTF-8 のテキストはそのまま受け付ける', () => {
  const result = normalizeTextBytes(utf8('日本語の memo\nsecond line\n'))
  expect(result).not.toBeNull()
  expect(decode(result!)).toBe('日本語の memo\nsecond line\n')
})

test('タブ・CRLF を含むテキストも受け付ける (CSV の実物がこの形)', () => {
  const result = normalizeTextBytes(utf8('a\tb\r\nc\td\r\n'))
  expect(result).not.toBeNull()
  expect(decode(result!)).toBe('a\tb\r\nc\td\r\n')
})

// Windows で書き出した日本語 CSV は今も Shift_JIS が多い。ここで UTF-8 へ
// 直しておけば、配信は常に charset=utf-8 の 1 通りで済む (HEIC→WebP と同じ流儀)
test('Shift_JIS のテキストは UTF-8 に変換して受け付ける', () => {
  // "日本語" (CP932): 93 fa 96 7b 8c ea
  const sjis = Uint8Array.from([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x0a])
  const result = normalizeTextBytes(sjis)
  expect(result).not.toBeNull()
  expect(decode(result!)).toBe('日本語\n')
})

test('BOM は落としてから保存する', () => {
  const withBom = utf8('﻿id,name\n1,x\n')
  const result = normalizeTextBytes(withBom)
  expect(decode(result!)).toBe('id,name\n1,x\n')
})

// ここがテキスト判定の要。テキストには署名が無いので、
// 「バイナリでないこと」を積極的に確かめないと何でも通ってしまう
test('NUL を含むバイト列は拒否する', () => {
  expect(normalizeTextBytes(Uint8Array.from([0x61, 0x00, 0x62]))).toBeNull()
})

test('制御文字を含むバイト列は拒否する (拡張子を偽装した実行ファイル対策)', () => {
  // ELF ヘッダ: 7f 45 4c 46 …
  const elf = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00])
  expect(normalizeTextBytes(elf)).toBeNull()
  // ZIP (docx/xlsx もこれ): "PK\x03\x04"
  const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
  expect(normalizeTextBytes(zip)).toBeNull()
})

// C1 制御文字 (80-9F) は UTF-8 では 2 バイト列として「正しく」デコードされる。
// 判定をデコード後の文字で行っているので、C0 だけ見ていると素通りしてしまう
test('DEL・C1 制御文字を含むテキストも拒否する', () => {
  expect(normalizeTextBytes(utf8('a\u007fb'))).toBeNull()
  expect(normalizeTextBytes(utf8('a\u0085b'))).toBeNull()
})

test('UTF-8 としても Shift_JIS としても解釈できないバイト列は拒否する', () => {
  // 0xfd-0xff は CP932 でも UTF-8 でも現れない
  expect(normalizeTextBytes(Uint8Array.from([0xfd, 0xfe, 0xff, 0x41]))).toBeNull()
})

test('空ファイルは拒否する (中身が無いので添付する意味がない)', () => {
  expect(normalizeTextBytes(new Uint8Array(0))).toBeNull()
})

// SVG・HTML は「テキストとしては妥当」なので、**この関数は通す**。
// 中身だけでは区別できないため、止めるのは名前側の関門
// (uploads.ts の textSaveInfo が txt/csv/md 以外を受けない)。
// 判定を 2 つに分けているので、どちらの意図もそれぞれの場所で読める
test('HTML や SVG も中身としてはテキスト (名前の関門で弾く担当ではない)', () => {
  const svg = utf8('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
  expect(normalizeTextBytes(svg)).not.toBeNull()
})
