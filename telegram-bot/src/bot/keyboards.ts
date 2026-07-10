import { InlineKeyboard } from "grammy";
import type { Network } from "../config";
import type { Translator } from "../i18n/messages";
import type { SeraMarket, SeraToken } from "../sera/types";

/**
 * callback_data vocabulary (Telegram limit: 64 bytes):
 *   lang:<en|ja>            language picker
 *   onboard:create          create-wallet button
 *   act:c:<id> / act:x:<id> confirm / cancel a pending action
 *   swap:from:<SYM> swap:to:<SYM>
 *   order:mkt:<SYMBOL>  order:side:<bid|ask>
 *   dep:tok:<SYM>
 *   net:<mainnet|sepolia>
 *   rate:<BASE>:<QUOTE>
 *   ord:st:<uuid> ord:cx:<uuid>
 */

export function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🇬🇧 English", "lang:en")
    .text("🇯🇵 日本語", "lang:ja");
}

export function createWalletKeyboard(t: Translator): InlineKeyboard {
  return new InlineKeyboard().text(t("createWalletButton"), "onboard:create");
}

export function confirmKeyboard(
  t: Translator,
  actionId: string,
): InlineKeyboard {
  return new InlineKeyboard()
    .text(t("confirmButton"), `act:c:${actionId}`)
    .text(t("cancelButton"), `act:x:${actionId}`);
}

export function tokenKeyboard(
  tokens: SeraToken[],
  prefix: string,
  excludeSymbol?: string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  let inRow = 0;
  for (const token of tokens) {
    if (excludeSymbol && token.symbol === excludeSymbol) continue;
    kb.text(token.symbol, `${prefix}:${token.symbol}`);
    if (++inRow % 3 === 0) kb.row();
  }
  return kb;
}

/**
 * /markets lists every registry pair (6786 on Sepolia) but Telegram rejects
 * keyboards past ~100 buttons, so market pickers show only major-stablecoin
 * pairs with a hard cap. Other markets stay reachable via the AI chat.
 */
const MAJOR_SYMBOLS = new Set([
  "USDC",
  "EURC",
  "JPYC",
  "EURT",
  "XSGD",
  "GYEN",
  "USDT",
  "XIDR",
]);
const MAX_MARKET_BUTTONS = 40;

export function pickDisplayMarkets(markets: SeraMarket[]): SeraMarket[] {
  const majors = markets.filter(
    (m) =>
      MAJOR_SYMBOLS.has(m.base_symbol) && MAJOR_SYMBOLS.has(m.quote_symbol),
  );
  const pool = majors.length > 0 ? majors : markets;
  return pool.slice(0, MAX_MARKET_BUTTONS);
}

export function marketKeyboard(
  markets: SeraMarket[],
  prefix: string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  let inRow = 0;
  for (const market of pickDisplayMarkets(markets)) {
    kb.text(market.symbol, `${prefix}:${market.symbol}`);
    if (++inRow % 2 === 0) kb.row();
  }
  return kb;
}

export function rateKeyboard(markets: SeraMarket[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  let inRow = 0;
  for (const market of pickDisplayMarkets(markets)) {
    kb.text(
      `${market.base_symbol}/${market.quote_symbol}`,
      `rate:${market.base_symbol}:${market.quote_symbol}`,
    );
    if (++inRow % 2 === 0) kb.row();
  }
  return kb;
}

export function sideKeyboard(
  t: Translator,
  baseSymbol: string,
): InlineKeyboard {
  return new InlineKeyboard()
    .text(t("orderBuyButton", baseSymbol), "order:side:bid")
    .text(t("orderSellButton", baseSymbol), "order:side:ask");
}

export function networkKeyboard(current: Network): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (current !== "sepolia") kb.text("Sepolia Testnet", "net:sepolia");
  if (current !== "mainnet") kb.text("Ethereum Mainnet ⚠️", "net:mainnet");
  return kb;
}

export function orderActionsKeyboard(
  t: Translator,
  orderId: string,
): InlineKeyboard {
  return new InlineKeyboard()
    .text(t("orderStatusButton"), `ord:st:${orderId}`)
    .text(t("orderCancelButton"), `ord:cx:${orderId}`);
}
