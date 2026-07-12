import { describe, expect, test } from "bun:test";
import { en } from "../../src/i18n/en";
import { ja } from "../../src/i18n/ja";
import { makeTranslator } from "../../src/i18n/messages";

describe("i18n catalogs", () => {
  test("ja covers exactly the same keys as en", () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  test("entry kinds (string vs function) match between catalogs", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(typeof ja[key]).toBe(typeof en[key]);
    }
  });

  test("template functions have matching arity", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const enEntry = en[key];
      if (typeof enEntry === "function") {
        expect((ja[key] as (...a: unknown[]) => string).length).toBe(
          enEntry.length,
        );
      }
    }
  });

  test("translator resolves strings and templates", () => {
    const t = makeTranslator("ja");
    expect(t("cancelled")).toContain("キャンセル");
    expect(t("walletCreated", "0xabc")).toContain("0xabc");
    const tEn = makeTranslator("en");
    expect(tEn("networkSwitched", "Sepolia Testnet")).toContain("Sepolia");
  });
});
