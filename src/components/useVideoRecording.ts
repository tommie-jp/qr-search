// ノート編集画面の録画ボタンの状態 (docs/16-録画の近接フォーカス計画.md)。
// useAudioRecording.ts が原型。録画そのものは lib/video/videoRecorder.ts が持ち、
// ここは React 側の都合 (状態遷移・経過時間の刻み・自動停止・後始末・プレビュー
// stream の受け渡し) だけを引き受ける。
//
// 音声との違いは 3 つ:
//   1. 自動停止を「時間」と「推定サイズ」の早い方で行う (SIZE_STOP_MS)。
//   2. ライブプレビュー用の MediaStream を state で公開する (<video srcObject>)。
//   3. **プレビューと録画開始を分ける** (idle → preview → recording)。カメラを
//      先に開いて AF が落ち着いてから録画を始められるので、録画の頭がボケない。
//      プレビュー中だけ近接 (超広角) へレンズを切り替えられる。

import { useCallback, useEffect, useRef, useState } from "react";
import { findUltraWideDeviceId } from "@/lib/video/cameraSelection";
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

// idle: カメラ未使用 / preview: 開いたが未録画 / recording: 録画中
export type VideoPhase = "idle" | "preview" | "recording";

export interface VideoRecordingState {
  phase: VideoPhase;
  // 録画中か (親の busy 判定に使う。preview では false)
  isRecording: boolean;
  elapsedMs: number;
  // ライブプレビュー用の MediaStream。カメラを開いていなければ null
  previewStream: MediaStream | null;
  // エラーではないが伝えるべきこと (自動停止など)。無ければ null
  note: string | null;
  // 近接 (超広角) へ切り替えられる端末か (超広角カメラを持つ iPhone など)
  canNearFocus: boolean;
  // いま近接 (超広角) で開いているか
  nearFocus: boolean;
  // idle → preview。カメラを開いてプレビューを出す
  openPreview: () => void;
  // preview → recording。プレビュー中のストリームで録画を始める
  startRecording: () => void;
  // recording → idle。録画を止めて本文へ入れる
  stop: () => void;
  // preview → idle。録画せずカメラを閉じる
  cancelPreview: () => void;
  // プレビュー中に近接 (超広角) ⇔ 通常を切り替える
  toggleNearFocus: () => void;
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
  const [phase, setPhase] = useState<VideoPhase>("idle");
  // 録画開始時刻。null なら録画していない (経過時間の基準を兼ねる)
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [canNearFocus, setCanNearFocus] = useState(false);
  const [nearFocus, setNearFocus] = useState(false);
  const recorderRef = useRef<VideoRecorder | null>(null);

  // start / stop を毎レンダリング作り直さずに済ませるため、呼び先だけ差し替える
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // 画面を離れたらカメラ・マイクを離す。開いたままの離脱で止め忘れると、
  // タブのカメラ使用中表示が残り続ける (プレビューだけでも開いていれば離す)
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
    };
  }, []);

  // カメラを閉じたときの state 後始末 (idle へ)。track は recorder 側で止める
  const resetToIdle = useCallback(() => {
    setPhase("idle");
    setStartedAt(null);
    setPreviewStream(null);
    setNearFocus(false);
    setCanNearFocus(false);
  }, []);

  const openPreview = useCallback(async () => {
    recorderRef.current ??= new VideoRecorder();
    const recorder = recorderRef.current;
    if (recorder.isOpen) {
      return;
    }
    setNote(null);
    try {
      await recorder.open();
      setPreviewStream(recorder.stream);
      setNearFocus(recorder.nearFocus);
      setPhase("preview");
      // 超広角があるか (近接ボタンの出し分け)。ラベルは gUM 許可後にしか
      // 出ないので、開いた後に調べる
      const ultra = await findUltraWideDeviceId();
      setCanNearFocus(ultra !== null);
    } catch (e) {
      handlersRef.current.onError(messageOf(e, "カメラを開けませんでした。"));
      recorder.cancel();
      resetToIdle();
    }
  }, [resetToIdle]);

  const startRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder?.isOpen || recorder.isRecording) {
      return;
    }
    setNote(null);
    try {
      recorder.record();
      setElapsedMs(0);
      setStartedAt(Date.now());
      setPhase("recording");
    } catch (e) {
      handlersRef.current.onError(
        messageOf(e, "録画を開始できませんでした。"),
      );
      recorder.cancel();
      resetToIdle();
    }
  }, [resetToIdle]);

  const stop = useCallback(async (reason?: string) => {
    const recorder = recorderRef.current;
    if (!recorder?.isRecording) {
      return;
    }
    // 先に録画中を降ろす。経過時間の interval が畳まれ、二重停止も防げる。
    // プレビューも同時に外す (track はこの後 recorder.stop() が止める)
    setStartedAt(null);
    setPreviewStream(null);
    setNearFocus(false);
    setCanNearFocus(false);
    setPhase("idle");
    setNote(reason ?? null);
    try {
      const recording = await recorder.stop();
      await handlersRef.current.onFinish(recording);
    } catch (e) {
      handlersRef.current.onError(messageOf(e, "録画を保存できませんでした。"));
    }
  }, []);

  const cancelPreview = useCallback(() => {
    const recorder = recorderRef.current;
    // 録画中は取消でなく stop を使う (録画済みを捨てさせない)
    if (!recorder?.isOpen || recorder.isRecording) {
      return;
    }
    recorder.cancel();
    resetToIdle();
    setNote(null);
  }, [resetToIdle]);

  const toggleNearFocus = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder?.isOpen || recorder.isRecording) {
      return;
    }
    const target = !recorder.nearFocus;
    setNote(null);
    try {
      await recorder.switchNearFocus(target);
      setPreviewStream(recorder.stream);
      setNearFocus(recorder.nearFocus);
    } catch (e) {
      // 切替に失敗するとプレビューごと畳まれている (旧トラックは停止済み)。
      // idle に戻し、カメラを掴んだままにしない
      handlersRef.current.onError(
        messageOf(e, "カメラを切り替えられませんでした。"),
      );
      recorder.cancel();
      resetToIdle();
    }
  }, [resetToIdle]);

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

  return {
    phase,
    isRecording: phase === "recording",
    elapsedMs,
    previewStream,
    note,
    canNearFocus,
    nearFocus,
    openPreview: () => void openPreview(),
    startRecording,
    stop: () => void stop(),
    cancelPreview,
    toggleNearFocus: () => void toggleNearFocus(),
  };
}
