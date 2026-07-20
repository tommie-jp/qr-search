import { afterEach, describe, expect, test } from "vitest";
import robots from "./robots";

const originalDemo = process.env.DEMO_MODE;

afterEach(() => {
  if (originalDemo === undefined) {
    delete process.env.DEMO_MODE;
  } else {
    process.env.DEMO_MODE = originalDemo;
  }
});

// docs/39-デモ公開計画.md §3。単一の rules オブジェクトを返す前提で読む
function singleRule(result: ReturnType<typeof robots>) {
  const { rules } = result;
  if (Array.isArray(rules)) {
    throw new Error("rules は単一オブジェクトの想定");
  }
  return rules;
}

describe("robots", () => {
  test("デモは全 UA を disallow する", () => {
    process.env.DEMO_MODE = "1";
    const rule = singleRule(robots());
    expect(rule.userAgent).toBe("*");
    expect(rule.disallow).toBe("/");
    expect(rule.allow).toBeUndefined();
  });

  test("本番/ローカルは全許可 (crawl を止めると noindex が読まれない)", () => {
    delete process.env.DEMO_MODE;
    const rule = singleRule(robots());
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toBeUndefined();
  });
});
