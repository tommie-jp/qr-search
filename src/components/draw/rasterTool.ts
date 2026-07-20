"use client";

// 画素を読んで加工し、結果を 1 枚のオブジェクトとして置く道具
// (塗りつぶし: docs/35 §3 / モザイク: docs/36 §3-2)。
//
// 読み取り元は fabric の下段 canvas (lowerCanvasEl)。ここには背景色・下敷き
// 画像・全オブジェクトが合成済みで、選択枠などの UI は上段に分かれているので
// 写り込まない。enableRetinaScaling: false (docs/34 §3-2) のおかげで
// 実バッファ = 論理サイズになっており、座標の変換も追加のレンダも要らない。
//
// 加工結果は「その領域だけを持つ透過 PNG」を FabricImage として足すだけ。
// オブジェクトが増えるだけなので、取り消し履歴も消しゴムも既存の仕組みが
// そのまま効く (新規に履歴を触るコードは要らない)。

import * as fabric from "fabric";
import { hexToRgb } from "@/lib/draw/drawColor";
import {
  type FillBounds,
  floodFillMask,
  type RgbaImage,
} from "@/lib/draw/floodFill";
import { mosaicBlockSize, pixelate } from "@/lib/draw/pixelate";
import type { DragRect, DrawPoint } from "@/lib/draw/shapes";

// ペンの線はアンチエイリアスされていて境界の画素が基準色と微妙に違う。
// 0 だと線の際が塗り残る
const FILL_TOLERANCE = 32;

// 求めた領域を 1px 膨らませる。許容差だけでは線との間に細い隙間 (ハロー) が
// 残りやすい
const FILL_DILATE = 1;

const RASTER_DEFAULTS = {
  originX: "left",
  originY: "top",
  selectable: false,
  evented: false,
  erasable: true,
} as const;

function readCanvas(fc: fabric.Canvas): RgbaImage | null {
  const element = fc.lowerCanvasEl;
  const context = element?.getContext("2d", { willReadFrequently: true });
  if (!element || !context) {
    return null;
  }
  const { data, width, height } = context.getImageData(
    0,
    0,
    element.width,
    element.height,
  );
  return { data, width, height };
}

// 加工した画素を切り出しの canvas に載せ、dataURL 経由で FabricImage にする。
// src が dataURL なので toObject() / loadFromJSON() の履歴復元がそのまま効く
async function toFabricImage(
  pixels: ImageData,
  bounds: FillBounds,
): Promise<fabric.FabricImage | null> {
  const patch = document.createElement("canvas");
  patch.width = bounds.width;
  patch.height = bounds.height;
  const context = patch.getContext("2d");
  if (!context) {
    return null;
  }
  context.putImageData(pixels, 0, 0);
  const image = await fabric.FabricImage.fromURL(patch.toDataURL("image/png"));
  image.set({ ...RASTER_DEFAULTS, left: bounds.left, top: bounds.top });
  // 一時 canvas は握り続けない (iOS のメモリ。docs/35 §7)
  patch.width = 0;
  patch.height = 0;
  return image;
}

// クリックした点と繋がった範囲を color で塗る。塗る所が無ければ null
export async function buildFill(
  fc: fabric.Canvas,
  point: DrawPoint,
  color: string,
): Promise<fabric.FabricImage | null> {
  const image = readCanvas(fc);
  if (!image) {
    return null;
  }
  const { mask, bounds } = floodFillMask(image, point, {
    tolerance: FILL_TOLERANCE,
    dilate: FILL_DILATE,
  });
  if (!bounds) {
    return null;
  }
  const [r, g, b] = hexToRgb(color);
  const pixels = new ImageData(bounds.width, bounds.height);
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      if (!mask[(y + bounds.top) * image.width + (x + bounds.left)]) {
        continue;
      }
      const at = (y * bounds.width + x) * 4;
      pixels.data[at] = r;
      pixels.data[at + 1] = g;
      pixels.data[at + 2] = b;
      pixels.data[at + 3] = 255;
    }
  }
  return toFabricImage(pixels, bounds);
}

// ドラッグした矩形を canvas の中へ収め、整数の画素位置に直す。
// はみ出したまま切り出すと getImageData の範囲外になる
function clampToCanvas(rect: DragRect, image: RgbaImage): FillBounds | null {
  const left = Math.max(0, Math.floor(rect.left));
  const top = Math.max(0, Math.floor(rect.top));
  const right = Math.min(image.width, Math.ceil(rect.left + rect.width));
  const bottom = Math.min(image.height, Math.ceil(rect.top + rect.height));
  if (right - left < 1 || bottom - top < 1) {
    return null;
  }
  return { left, top, width: right - left, height: bottom - top };
}

function cropImage(image: RgbaImage, bounds: FillBounds): RgbaImage {
  const data = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    const from = ((y + bounds.top) * image.width + bounds.left) * 4;
    data.set(image.data.subarray(from, from + bounds.width * 4), y * bounds.width * 4);
  }
  return { data, width: bounds.width, height: bounds.height };
}

// 囲んだ範囲をモザイクにする。塗りつぶしと同じ経路で、加工が平均色の
// 升目に変わるだけ (docs/36 §3-2)
export async function buildMosaic(
  fc: fabric.Canvas,
  rect: DragRect,
): Promise<fabric.FabricImage | null> {
  const image = readCanvas(fc);
  if (!image) {
    return null;
  }
  const bounds = clampToCanvas(rect, image);
  if (!bounds) {
    return null;
  }
  const region = cropImage(image, bounds);
  const blurred = pixelate(region, mosaicBlockSize(bounds.width, bounds.height));
  // 生の配列から ImageData を組むと、TypedArray の buffer の型が合わない
  // (SharedArrayBuffer を含みうるため)。空を作って書き写す
  const pixels = new ImageData(bounds.width, bounds.height);
  pixels.data.set(blurred.data);
  return toFabricImage(pixels, bounds);
}
