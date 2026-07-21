// ノート編集画面の録画ボタンの状態 (docs/14-動画挿入計画.md)。
// useAudioRecording.ts が原型。録画そのものは lib/video/videoRecorder.ts が持ち、
// ここは React 側の都合 (経過時間の刻み・自動停止・後始末・プレビュー stream の
// 受け渡し) だけを引き受ける。
//
// 音声との違いは 2 つ:
//   1. 自動停止を「時間」と「推定サイズ」の早い方で行う (SIZE_STOP_MS)。
//   2. ライブプレビュー用の MediaStream を state で公開する (<video srcObject>)。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_RECORDING_MS,
  SIZE_STOP_MS,
  VideoRecorder,
  type Recording,
} from "@/lib/video/videoRecorder";

// 経過時間の更新間隔。表示は秒単位なので 200ms あれば十分滑らかに見える
const TICK_MS = 200;

// 時間・サイズ上限の早い方で止める。ビットレートを上げても上限超過で録画ごと
// 失わないための保険 (videoRecorder.ts SIZE_STOP_MS のコメント)。
const AUTO_STOP_MS = Math.min(MAX_RECORDING_MS, SIZE_STOP_MS);

const AUTO_STOP_NOTE =
  AUTO_STOP_MS === MAX_RECORDING_MS
    ? `録画時間の上限 (${Math.round(MAX_RECORDING_MS / 60_000)} 分) に達したため停止しました。`
    : "ファイルサイズの上限に近づいたため停止しました。";

export interface VideoRecordingState {
  isRecording: boolean;
  elapsedMs: number;
  // ライブプレビュー用の MediaStream。録画していなければ null
  previewStream: MediaStream | null;
  // エラーではないが伝えるべきこと (自動停止など)。無ければ null
  note: string | null;
  toggle: () => void;
}

function messageOf(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export interface VideoRecordingHandlers {
  // 録画できたものを本文へ入れる。ここが投げたら onError に回る
  onFinish: (recording: Recording) => void | Promise<void>;
  onError: (message: string) => void;
}

export function useVideoRecording(
  handlers: VideoRecordingHandlers,
): VideoRecordingState {
  // 録画開始時刻。null なら録画していない (経過時間の基準も兼ねる)
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const recorderRef = useRef<VideoRecorder | null>(null);

  // start / stop を毎レンダリング作り直さずに済ませるため、呼び先だけ差し替える
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // 画面を離れたらカメラ・マイクを離す。録画したままの離脱で止め忘れると、
  // タブのカメラ使用中表示が残り続ける
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
    };
  }, []);

  const start = useCallback(async () => {
    recorderRef.current ??= new VideoRecorder();
    setNote(null);
    try {
      await recorderRef.current.start();
      setElapsedMs(0);
      // プレビュー stream を公開してから録画中にする
      setPreviewStream(recorderRef.current.stream);
      setStartedAt(Date.now());
    } catch (e) {
      handlersRef.current.onError(messageOf(e, "録画を開始できませんでした。"));
    }
  }, []);

  const stop = useCallback(async (reason?: string) => {
    const recorder = recorderRef.current;
    if (!recorder?.isRecording) {
      return;
    }
    // 先に録画中を降ろす。経過時間の interval が畳まれ、二重停止も防げる。
    // プレビューも同時に外す (track はこの後 recorder.stop() が止める)
    setStartedAt(null);
    setPreviewStream(null);
    setNote(reason ?? null);
    try {
      const recording = await recorder.stop();
      await handlersRef.current.onFinish(recording);
    } catch (e) {
      handlersRef.current.onError(messageOf(e, "録画を保存できませんでした。"));
    }
  }, []);

  // 経過時間を刻み、上限 (時間・サイズの早い方) で自動停止する
  useEffect(() => {
    if (startedAt === null) {
      return;
    }
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      // 秒が変わったときだけ state を更新する (useAudioRecording と同旨。
      // 録画中の毎ティック再レンダリングを畳む)
      setElapsedMs((prev) =>
        Math.floor(prev / 1000) === Math.floor(elapsed / 1000) ? prev : elapsed,
      );
      if (elapsed >= AUTO_STOP_MS) {
        void stop(AUTO_STOP_NOTE);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [startedAt, stop]);

  const toggle = useCallback(() => {
    void (recorderRef.current?.isRecording ? stop() : start());
  }, [start, stop]);

  return {
    isRecording: startedAt !== null,
    elapsedMs,
    previewStream,
    note,
    toggle,
  };
}
