import { afterEach, describe, expect, test, vi } from "vitest";
import {
  applyNearFocusZoom,
  findUltraWideDeviceId,
  NEAR_FOCUS_ZOOM,
} from "./cameraSelection";

describe("findUltraWideDeviceId", () => {
  const original = navigator.mediaDevices;

  const setEnumerateDevices = (
    enumerateDevices: (() => Promise<unknown>) | undefined,
  ) => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: enumerateDevices ? { enumerateDevices } : {},
      configurable: true,
    });
  };

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: original,
      configurable: true,
    });
  });

  const device = (kind: string, label: string, deviceId: string) =>
    ({ kind, label, deviceId }) as MediaDeviceInfo;

  test("英語ラベルの背面超広角を拾う", async () => {
    setEnumerateDevices(async () => [
      device("videoinput", "Back Camera", "wide"),
      device("videoinput", "Back Ultra Wide Camera", "ultra"),
      device("audioinput", "Microphone", "mic"),
    ]);
    expect(await findUltraWideDeviceId()).toBe("ultra");
  });

  test("日本語ラベルの超広角も拾う", async () => {
    setEnumerateDevices(async () => [
      device("videoinput", "背面カメラ", "wide"),
      device("videoinput", "背面超広角カメラ", "ultra"),
    ]);
    expect(await findUltraWideDeviceId()).toBe("ultra");
  });

  test("超広角が無ければ null (通常カメラの端末)", async () => {
    setEnumerateDevices(async () => [
      device("videoinput", "Back Camera", "wide"),
      device("videoinput", "Front Camera", "front"),
    ]);
    expect(await findUltraWideDeviceId()).toBeNull();
  });

  test("超広角ラベルでも videoinput 以外は拾わない", async () => {
    setEnumerateDevices(async () => [
      device("audiooutput", "Ultra Wide Speaker", "spk"),
    ]);
    expect(await findUltraWideDeviceId()).toBeNull();
  });

  test("enumerateDevices が無い環境では null", async () => {
    setEnumerateDevices(undefined);
    expect(await findUltraWideDeviceId()).toBeNull();
  });

  test("列挙が失敗しても投げずに null", async () => {
    setEnumerateDevices(async () => {
      throw new Error("denied");
    });
    expect(await findUltraWideDeviceId()).toBeNull();
  });
});

describe("applyNearFocusZoom", () => {
  const makeTrack = (
    caps: unknown,
    applyConstraints = vi.fn(async () => {}),
  ) =>
    ({
      getCapabilities: () => caps,
      applyConstraints,
    }) as unknown as MediaStreamTrack & {
      applyConstraints: ReturnType<typeof vi.fn>;
    };

  test("zoom 対応なら NEAR_FOCUS_ZOOM を上限内で適用する", async () => {
    const track = makeTrack({ zoom: { min: 1, max: 8 } });
    await applyNearFocusZoom(track);
    expect(track.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ zoom: NEAR_FOCUS_ZOOM }],
    });
  });

  test("最大 zoom が目標より小さいなら最大に丸める", async () => {
    const track = makeTrack({ zoom: { min: 1, max: 1.5 } });
    await applyNearFocusZoom(track);
    expect(track.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ zoom: 1.5 }],
    });
  });

  test("zoom 非対応なら何も適用しない", async () => {
    const track = makeTrack({});
    await applyNearFocusZoom(track);
    expect(track.applyConstraints).not.toHaveBeenCalled();
  });

  test("getCapabilities 自体が無くても投げない", async () => {
    const track = {
      applyConstraints: vi.fn(async () => {}),
    } as unknown as MediaStreamTrack & {
      applyConstraints: ReturnType<typeof vi.fn>;
    };
    await expect(applyNearFocusZoom(track)).resolves.toBeUndefined();
    expect(track.applyConstraints).not.toHaveBeenCalled();
  });

  test("applyConstraints が拒んでも投げない (近接は成立する)", async () => {
    const track = makeTrack(
      { zoom: { min: 1, max: 8 } },
      vi.fn(async () => {
        throw new Error("OverconstrainedError");
      }),
    );
    await expect(applyNearFocusZoom(track)).resolves.toBeUndefined();
  });
});
