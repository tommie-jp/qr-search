"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  BOX_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "@/components/ui";

// /api/import が返すレポート (lib/enex/importEnex.ts と対)
interface ImportedNote {
  itemNo: string;
  title: string;
}

interface SkippedEntry {
  label: string;
  reason: string;
}

interface ImportReport {
  imported: ImportedNote[];
  skipped: SkippedEntry[];
}

interface ImportResponse {
  success: boolean;
  data: ImportReport | null;
  error: string | null;
}

// 端末の .enex を選んで送るだけ。変換はすべてサーバ側で行う
// (docs/28-エクスポート計画.md §4)。
export function EnexImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function handleImport() {
    if (file === null) {
      return;
    }
    setError(null);
    setReport(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/import", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const result: ImportResponse = await response.json();
      if (!response.ok || !result.success || result.data === null) {
        throw new Error(result.error ?? `取り込めませんでした (${response.status})`);
      }
      setReport(result.data);
      // 同じファイルを二度押しで二重に取り込みやすいので、成功したら選択を外す
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (cause) {
      console.error("ENEX の取り込みに失敗しました", cause);
      setError(cause instanceof Error ? cause.message : "取り込めませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={`${BOX_CLASS} space-y-3 py-4`}>
        <h2 className="font-bold">ファイルを選ぶ</h2>
        <input
          ref={inputRef}
          type="file"
          accept=".enex,application/xml,text/xml"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded file:border file:border-gray-300 file:bg-white file:px-3 file:font-medium"
        />
        <button
          type="button"
          onClick={handleImport}
          disabled={file === null || busy}
          className={PRIMARY_BUTTON_CLASS}
        >
          {busy ? "取り込み中…" : "取り込む"}
        </button>
        {busy && (
          <p className="text-sm text-gray-600">
            画像の変換とサムネイル作成に時間がかかります。このページを閉じずにお待ちください。
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      {report && <ImportResult report={report} />}
    </div>
  );
}

function ImportResult({ report }: { report: ImportReport }) {
  return (
    <section className="space-y-4">
      <h2 className="font-bold">
        取り込み結果 (成功 {report.imported.length} 件 / 見送り{" "}
        {report.skipped.length} 件)
      </h2>

      {report.imported.length === 0 ? (
        <p className="text-gray-600">取り込めたノートはありませんでした。</p>
      ) : (
        <ul className="space-y-2">
          {report.imported.map((note) => (
            <li key={note.itemNo} className={`${BOX_CLASS} py-3`}>
              <Link
                href={`/item/${note.itemNo}`}
                className="text-blue-600 underline"
              >
                {note.itemNo}
              </Link>
              <span className="ml-2 text-gray-700">
                {note.title === "" ? "(無題)" : note.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 見送ったものは必ず出す。黙って落とすと「全部入った」と読めてしまう */}
      {report.skipped.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bold">取り込めなかったもの</h3>
          <ul className="space-y-2">
            {report.skipped.map((entry, index) => (
              <li
                key={`${entry.label}-${index}`}
                className={`${BOX_CLASS} py-3 text-sm`}
              >
                <p className="font-medium">{entry.label}</p>
                <p className="text-gray-600">{entry.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href="/" className={SECONDARY_BUTTON_CLASS}>
        一覧へ戻る
      </Link>
    </section>
  );
}
