import type { Context, SessionFlavor } from "grammy";
import type { Language } from "../config";
import type { UserRow } from "../db/repositories";
import type { Translator } from "../i18n/messages";
import type { Services } from "../services";

export interface SwapDraft {
  type: "swap" | "send";
  step: "pick_from" | "pick_to" | "enter_recipient" | "enter_amount";
  fromSymbol?: string;
  toSymbol?: string;
  recipient?: string;
  fromDecimals?: number;
}

export interface OrderDraft {
  type: "order";
  step: "pick_pair" | "pick_side" | "enter_price" | "enter_amount";
  marketSymbol?: string;
  side?: "bid" | "ask";
  price?: string;
  baseSymbol?: string;
  quoteSymbol?: string;
  tickPrecision?: number;
  quantityPrecision?: number;
  /** Market minimums (human units) for pre-submit checks and prompts. */
  minAskAmount?: string;
  minBidQuoteAmount?: string;
}

export interface DepositDraft {
  type: "deposit";
  step: "pick_token" | "enter_amount";
  tokenSymbol?: string;
}

export type FlowDraft = SwapDraft | OrderDraft | DepositDraft;

export interface SessionData {
  /** Pre-onboarding language choice (before a user row exists). */
  language?: Language;
  flow?: FlowDraft;
}

export type MyContext = Context &
  SessionFlavor<SessionData> & {
    services: Services;
    /** Loaded user row, null before onboarding. */
    user: UserRow | null;
    t: Translator;
    lang: Language;
  };
