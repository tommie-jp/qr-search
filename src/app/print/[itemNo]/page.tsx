import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PrintButton } from "@/components/PrintButton";
import { buildItemUrl, isValidItemNo } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface PrintPageProps {
  params: Promise<{ itemNo: string }>;
}

// Ver1 の /print/:itemNo 相当。QR シール印刷用ページ。
// QR には https の公開 URL を埋め込む (QR_BASE_URL で変更可能)
export default async function PrintPage({ params }: PrintPageProps) {
  const { itemNo } = await params;
  if (!isValidItemNo(itemNo)) {
    notFound();
  }

  const baseUrl = process.env.QR_BASE_URL ?? "https://qr.tommie.jp";
  const itemUrl = buildItemUrl(baseUrl, itemNo);
  const qrDataUrl = await QRCode.toDataURL(itemUrl, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold print:hidden">
        print <span className="font-mono">#{itemNo}</span>
      </h1>

      <div className="inline-block border border-gray-300 bg-white p-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt={`QR: ${itemUrl}`} width={240} height={240} />
        <div className="mt-1 font-mono text-lg font-bold">#{itemNo}</div>
      </div>

      <p className="break-all text-sm text-gray-500 print:hidden">{itemUrl}</p>

      <PrintButton />
    </div>
  );
}
