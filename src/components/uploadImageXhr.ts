// 進捗 % 付きの画像アップロード。fetch は送信進捗を取れないため、ここだけ
// XMLHttpRequest を使う (xhr.upload.onprogress)。ワイヤ上は従来の
// `POST /api/images` + FormData("file") と完全互換。
// 応答の解釈は lib/uploadResponse (テスト済み)、% 計算は lib/progress に置き、
// ここはブラウザ API の糊だけに保つ。

import { cappedPercent } from "@/lib/progress";
import { parseUploadResponse } from "@/lib/uploadResponse";

// 送信バイトが 100% でもサーバ処理 (HEIC 変換・サムネイル・DB) が残るため、
// 応答が返るまで 99% で保持する
const UPLOAD_HOLD_PERCENT = 99;

export function uploadImageWithProgress(
  file: File,
  // 送信量が分からない環境 (lengthComputable = false) では null を渡す。
  // 0% のまま張り付いて「止まって見える」より、% を出さない方がまし
  onPercent: (percent: number | null) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/images");

    xhr.upload.onprogress = (event) => {
      onPercent(
        event.lengthComputable
          ? cappedPercent(event.loaded, event.total, UPLOAD_HOLD_PERCENT)
          : null,
      );
    };

    xhr.onload = () => {
      try {
        resolve(parseUploadResponse(xhr.status, xhr.responseText));
      } catch (e) {
        reject(e);
      }
    };

    xhr.onerror = () => {
      reject(new Error("アップロードに失敗しました (通信エラー)"));
    };
    xhr.onabort = () => {
      reject(new Error("アップロードが中断されました"));
    };

    const formData = new FormData();
    formData.set("file", file);
    xhr.send(formData);
  });
}
