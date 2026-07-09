import type { Language } from "../config";
import { en, type MessageCatalog, type MessageKey } from "./en";
import { ja } from "./ja";

const catalogs: Record<Language, MessageCatalog> = { en, ja };

/**
 * Typed translator: `t("walletCreated", address)` — argument types are
 * inferred from the catalog entry (plain strings take no args).
 */
export type Translator = <K extends MessageKey>(
  key: K,
  ...args: MessageCatalog[K] extends (...a: infer A) => string ? A : []
) => string;

export function makeTranslator(lang: Language): Translator {
  const catalog = catalogs[lang];
  return (key, ...args) => {
    const entry = catalog[key];
    if (typeof entry === "function") {
      return (entry as (...a: unknown[]) => string)(...args);
    }
    return entry;
  };
}

export type { MessageCatalog, MessageKey };
