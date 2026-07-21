// ノート編集画面からのその場録画 (docs/14-動画挿入計画.md)。
// lib/audio/audioRecorder.ts が原型で、音声を動画に置き換えた鏡写し。
//
// 録画した動画はそのまま /api/images へ送り、サーバが中身を見て保存する。
// 変換はしない (音声・PDF と同じ「素通し」方針)。ポスター (先頭フレームの
// WebP) はクライアントが別途作って同じ POST で送る (videoPoster.ts)。

import fixWebmDuration from 'fix-webm-duration'
import { MAX_VIDEO_BYTES } from '../uploads'

// 試す順に並べる。音声と同じく **Safari だけを mp4/H.264+AAC に寄せ、他は
// webm/VP9+Opus のまま**にする。振り分けは UA 判定ではなく対応状況の実測で行う
// (`codecs=avc1...,mp4a...` まで書いた文字列は Safari だけが対応と答える)。
//
// 素の `video/mp4` は Chrome も対応と答えうるので、**必ず webm より後ろに置く**
// (前に出すと Chrome まで mp4 になり、検証しやすい webm 経路を手放す)。
//
// **サーバが受けられる形式だけを並べる** — ここに増やすなら uploads.ts の
// sniffVideoFormat も一緒に広げること。
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // Safari / iOS
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

// 720p で文字が読める最低ライン (docs/14 のおすすめ設定)。明示しないと
// ブラウザ任せになり、画質もサイズも安定しない。
export const VIDEO_BITS_PER_SECOND = 1_000_000
// 音声は音声録音と同じ 64kbps あれば十分明瞭。
export const AUDIO_BITS_PER_SECOND = 64_000
// 自動停止・推定サイズに使う合計ビットレート。
export const TOTAL_BITS_PER_SECOND = VIDEO_BITS_PER_SECOND + AUDIO_BITS_PER_SECOND

// 720p 相当。カメラは背面 (メモ用途は手元や周囲を写すのが主)。
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'environment',
  width: { ideal: 1280 },
  height: { ideal: 720 },
}

// 自動停止までの長さ (3 分)。TOTAL_BITS_PER_SECOND で 3 分 ≈ 24MB となり、
// アップロード上限 MAX_VIDEO_BYTES (30MB) にコンテナのオーバーヘッド分の
// 余裕を残して収まる。**上限を設けないと、長い録画がアップロードで丸ごと
// 失われる** — 録り終えてから断られるのがいちばん損なので、その手前で止める。
export const MAX_RECORDING_MS = 3 * 60 * 1000

// ビットレートを変えても破綻しないための保険。推定サイズが上限の 9 割に達したら
// 時間より先に止める (useVideoRecording が時間と併せて監視する)。
export const SIZE_STOP_RATIO = 0.9

// 経過ミリ秒から出力サイズを見積もる (ビットレート × 経過秒 ÷ 8)。
export function estimatedBytes(elapsedMs: number): number {
  return (TOTAL_BITS_PER_SECOND / 8) * (elapsedMs / 1000)
}

// 推定サイズが上限の SIZE_STOP_RATIO に達する経過ミリ秒。時間上限と併せ、
// 早い方で止める。
export const SIZE_STOP_MS =
  ((MAX_VIDEO_BYTES * SIZE_STOP_RATIO) / (TOTAL_BITS_PER_SECOND / 8)) * 1000

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') {
    return undefined
  }
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

// 保存名の拡張子。サーバは中身を見て自分で名前を決めるので、ここで付ける
// 拡張子は「クライアント側で動画と判る」ためのもの (MemoEditorInner の判定)。
export function extensionFor(mimeType: string): string {
  if (mimeType.startsWith('video/webm')) {
    return 'webm'
  }
  if (mimeType.startsWith('video/mp4')) {
    return 'mp4'
  }
  return 'bin' // MIME_CANDIDATES の範囲では起きない
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

// 本文の alt に残す録画日時 (`![録画 2026-07-20 14:03:12](url)`)。録音と同じ狙いで、
// UUID 名では失われる手がかりを本文に載せ、PGroonga の全文検索から引ける。
export function recordingAltText(at: Date): string {
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  return `録画 ${date} ${time}`
}

export function recordingFileName(at: Date, ext: string): string {
  const date = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  return `video-${date}-${time}.${ext}`
}

export interface Recording {
  // そのまま /api/images へ送れる形。名前と mime は付け直さない
  file: File
  durationMs: number
  // 録画を**開始**した時刻。本文の alt に出す (終了時刻より意味が通る)
  recordedAt: Date
}

export class VideoCaptureError extends Error {
  override readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'VideoCaptureError'
    this.cause = cause
  }
}

export function mapCaptureError(e: unknown): VideoCaptureError {
  if (e instanceof VideoCaptureError) {
    return e
  }
  const err = e instanceof Error ? e : new Error(String(e))
  const msg = err.message
  if (err.name === 'NotAllowedError' || /Permission/i.test(msg)) {
    return new VideoCaptureError(
      'カメラの利用が許可されていません。ブラウザの設定からカメラ許可を確認して下さい。',
      e,
    )
  }
  if (err.name === 'NotFoundError') {
    return new VideoCaptureError('カメラが見つかりません。', e)
  }
  if (err.name === 'NotReadableError') {
    return new VideoCaptureError(
      'カメラを開始できませんでした。他のアプリがカメラを使っていないか確認して下さい。',
      e,
    )
  }
  return new VideoCaptureError(msg || '録画を開始できませんでした。', e)
}

// 録画直後の手当て。Firefox は webm の Duration を 0 で書くため、<video> の長さが
// Infinity になりシークできない。実測の長さを書き込む (音声と同じ処理で、動画の
// webm にもそのまま効く)。**mp4 (Safari) の moov 並べ替えはサーバ側でやる**
// (attachmentStore の video 分岐)。
async function prepareForUpload(
  blob: Blob,
  mimeType: string,
  durationMs: number,
): Promise<Blob> {
  if (!mimeType.startsWith('video/webm')) {
    return blob
  }
  return fixWebmDuration(blob, durationMs, { logger: false })
}

export class VideoRecorder {
  private recorder: MediaRecorder | null = null
  private mediaStream: MediaStream | null = null
  private chunks: Blob[] = []
  private startedAt = 0

  get isRecording(): boolean {
    return this.recorder?.state === 'recording'
  }

  // ライブプレビュー用の MediaStream (<video srcObject>)。録画していなければ null。
  get stream(): MediaStream | null {
    return this.mediaStream
  }

  async start(): Promise<void> {
    if (this.recorder) {
      throw new VideoCaptureError('既に録画中です。')
    }
    const mimeType = pickMimeType()
    if (!mimeType) {
      throw new VideoCaptureError('この端末は動画録画に対応していません。')
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: VIDEO_CONSTRAINTS,
        audio: true,
      })
    } catch (e) {
      throw mapCaptureError(e)
    }

    // getUserMedia の後は**何で失敗してもカメラ・マイクを離す** (audioRecorder と
    // 同じ理由。this.mediaStream にまだ入っていないので、ここで離さないと
    // 誰も track.stop() を呼べなくなり、カメラ使用中表示が残り続ける)。
    try {
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      })
      this.chunks = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data)
        }
      }
      recorder.start()
      this.recorder = recorder
      this.mediaStream = stream
      this.startedAt = Date.now()
    } catch (e) {
      stream.getTracks().forEach((track) => track.stop())
      this.chunks = []
      throw mapCaptureError(e)
    }
  }

  async stop(): Promise<Recording> {
    const recorder = this.recorder
    const stream = this.mediaStream
    if (!recorder || !stream) {
      throw new VideoCaptureError('録画中ではありません。')
    }
    const recordedAt = new Date(this.startedAt)

    let rawBlob: Blob
    let mimeType: string
    let durationMs: number
    try {
      // recorder.stop() は既に inactive なら InvalidStateError を投げる。
      // finally で必ず後始末する — さもないと this.recorder が残り、以後の
      // start() が「既に録画中です」で永久に弾かれる (audioRecorder と同旨)。
      ;({ blob: rawBlob, mimeType, durationMs } = await new Promise<{
        blob: Blob
        mimeType: string
        durationMs: number
      }>((resolve) => {
        recorder.onstop = () => {
          const type = recorder.mimeType
          resolve({
            blob: new Blob(this.chunks, { type }),
            mimeType: type,
            durationMs: Date.now() - this.startedAt,
          })
        }
        recorder.stop()
      }))
    } finally {
      stream.getTracks().forEach((track) => track.stop())
      this.recorder = null
      this.mediaStream = null
      this.chunks = []
    }

    const blob = await prepareForUpload(rawBlob, mimeType, durationMs)
    const name = recordingFileName(recordedAt, extensionFor(mimeType))
    return {
      file: new File([blob], name, { type: mimeType }),
      durationMs,
      recordedAt,
    }
  }

  // 中断 (画面離脱・エラー時)。結果は捨てるが、カメラ・マイクは必ず離す。
  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null
      this.recorder.stop()
    }
    this.mediaStream?.getTracks().forEach((track) => track.stop())
    this.recorder = null
    this.mediaStream = null
    this.chunks = []
  }
}
