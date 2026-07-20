import { afterEach, describe, expect, test } from "vitest";
import { isDemoMode, isProductionEnv } from "./appEnv";

const original = process.env.APP_ENV;
const originalDemo = process.env.DEMO_MODE;

afterEach(() => {
  if (original === undefined) {
    delete process.env.APP_ENV;
  } else {
    process.env.APP_ENV = original;
  }
  if (originalDemo === undefined) {
    delete process.env.DEMO_MODE;
  } else {
    process.env.DEMO_MODE = originalDemo;
  }
});

// 判定を間違えると「本番なのにローカルの見た目」(実害なし) か
// 「ローカルなのに本番の見た目」(事故が再発する) のどちらかになる。
// 後者を絶対に起こさない = production を明示したときだけ true、が満たすべき性質。
describe("isProductionEnv", () => {
  test("APP_ENV=production を明示したときだけ本番とみなす", () => {
    // Arrange
    process.env.APP_ENV = "production";

    // Act & Assert
    expect(isProductionEnv()).toBe(true);
  });

  test("未設定なら本番ではない (設定漏れは警告が出る側へ倒す)", () => {
    // Arrange
    delete process.env.APP_ENV;

    // Act & Assert
    expect(isProductionEnv()).toBe(false);
  });

  test("空文字 (.env に `APP_ENV=` と書いた形) でも本番ではない", () => {
    // Arrange
    process.env.APP_ENV = "";

    // Act & Assert
    expect(isProductionEnv()).toBe(false);
  });

  test("production 以外の値は本番ではない", () => {
    // Arrange & Act & Assert
    for (const value of ["development", "prod", "Production", "staging"]) {
      process.env.APP_ENV = value;
      expect(isProductionEnv(), `APP_ENV=${value}`).toBe(false);
    }
  });
});

// isProductionEnv とは逆で、判定を間違えると「デモなのに保護が効かない」=
// 無防備な書き込み可サイトになる。DEMO_MODE=1 を明示したときだけ true が満たすべき性質。
describe("isDemoMode", () => {
  test("DEMO_MODE=1 を明示したときだけデモとみなす", () => {
    // Arrange
    process.env.DEMO_MODE = "1";

    // Act & Assert
    expect(isDemoMode()).toBe(true);
  });

  test("未設定ならデモではない", () => {
    // Arrange
    delete process.env.DEMO_MODE;

    // Act & Assert
    expect(isDemoMode()).toBe(false);
  });

  test("1 以外の値 (true/yes/空文字) はデモではない", () => {
    // Arrange & Act & Assert
    for (const value of ["", "true", "yes", "0", "on"]) {
      process.env.DEMO_MODE = value;
      expect(isDemoMode(), `DEMO_MODE=${JSON.stringify(value)}`).toBe(false);
    }
  });
});
