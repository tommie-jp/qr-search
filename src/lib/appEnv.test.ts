import { afterEach, describe, expect, test } from "vitest";
import { isProductionEnv } from "./appEnv";

const original = process.env.APP_ENV;

afterEach(() => {
  if (original === undefined) {
    delete process.env.APP_ENV;
  } else {
    process.env.APP_ENV = original;
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
