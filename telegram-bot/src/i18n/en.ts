/**
 * English message catalog. Values are plain strings or template functions.
 * Messages are rendered with Telegram parse_mode: "HTML" — dynamic values
 * must be escaped by callers via format.ts helpers before interpolation
 * unless the template does it itself.
 */

export interface SwapCardParams {
  fromAmount: string;
  fromSymbol: string;
  toSymbol: string;
  minOutput: string;
  rate: string;
  feeSummary: string;
  expiresInSec: number;
  networkLabel: string;
  recipient?: string;
}

export interface OrderCardParams {
  market: string;
  side: "bid" | "ask";
  price: string;
  amount: string;
  baseSymbol: string;
  quoteSymbol: string;
  networkLabel: string;
}

export const en = {
  // ---- common ----
  confirmButton: "✅ Confirm",
  cancelButton: "❌ Cancel",
  backButton: "« Back",
  refreshButton: "🔄 Refresh",
  cancelled: "Cancelled. Nothing was executed.",
  actionExpired:
    "⏱ This confirmation has expired (quotes are only valid for a short time). Please start again to get a fresh price.",
  actionAlreadyUsed: "This action was already executed or cancelled.",
  errorGeneric:
    "Something went wrong on our side. Please try again in a moment.",
  notOnboarded: "Please run /start first to set up your wallet.",
  networkBadge: (label: string) => `🌐 ${label}`,

  // ---- /start onboarding ----
  chooseLanguage: "🌍 Choose your language / 言語を選んでください",
  languageSet: "Language set to English. 🇬🇧",
  startWelcome:
    "👋 <b>Welcome to the Sera FX Bot!</b>\n\n" +
    "Here you can exchange <b>stablecoins</b> (digital tokens pegged to real currencies like USD, EUR, JPY) directly on the Ethereum blockchain — like a foreign-exchange desk in your pocket.\n\n" +
    "No prior crypto experience needed:\n" +
    "• We create a secure wallet for you — no seed phrase to memorize\n" +
    "• Swaps need no ETH for gas — fees are included in the quoted price\n" +
    "• Every trade shows a clear confirmation before anything happens\n\n" +
    "Let's create your wallet to get started.",
  createWalletButton: "🪪 Create my wallet",
  walletCreating: "Creating your wallet… ⏳",
  walletCreated: (address: string) =>
    `🎉 <b>Your wallet is ready!</b>\n\nAddress:\n<code>${address}</code>\n\n` +
    "This is your personal address on Ethereum. Send stablecoins here to start trading.\n\n" +
    "Try /help to see everything I can do, or just ask me a question in plain language!",
  welcomeBack: (address: string, networkLabel: string) =>
    `👋 Welcome back!\n\nWallet: <code>${address}</code>\n🌐 ${networkLabel}\n\nUse /help to see available commands.`,
  onboardingApiKey: "Setting up secure API access… 🔐",

  // ---- /wallet ----
  walletInfo: (address: string, networkLabel: string, explorerUrl: string) =>
    `🪪 <b>Your wallet</b>\n\nAddress:\n<code>${address}</code>\n\n🌐 ${networkLabel}\n🔍 <a href="${explorerUrl}">View on Etherscan</a>\n\n` +
    "💡 Send stablecoins (e.g. USDC) to this address to fund your account.",

  // ---- /balance ----
  balanceTitle: (networkLabel: string) =>
    `💰 <b>Account summary</b> — ${networkLabel}`,
  balanceNative: (eth: string) => `⛽ ETH (for gas): <b>${eth}</b>`,
  balanceHeader: "Stablecoins:",
  balanceRow: (
    symbol: string,
    wallet: string,
    vaultAvailable: string,
    vaultFrozen: string,
  ) =>
    `• <b>${symbol}</b> — wallet: ${wallet} | vault: ${vaultAvailable}${
      vaultFrozen !== "0" ? ` (frozen: ${vaultFrozen})` : ""
    }`,
  balanceEmpty:
    "No stablecoin balances yet. Send tokens to your wallet address (see /wallet) to get started.",
  balanceEmptySepoliaHint:
    "⚠️ <b>Sepolia note:</b> USDC from the Circle faucet is a <i>different</i> token and cannot be used on Sera. Get free Sera test stablecoins with /faucet instead!",

  // ---- /faucet (Sepolia test tokens) ----
  faucetIntro:
    "🚰 <b>Sera test-token faucet</b>\n\nClaim a free starter pack of Sera test stablecoins (USDC, EURC, JPYC and more) on Sepolia. One claim per wallet.\n\n⛽ The claim transaction needs a little Sepolia ETH for gas.",
  faucetOnlySepolia:
    "The faucet only exists on Sepolia. Switch with /network first.",
  faucetAlreadyClaimed:
    "✅ This wallet has already claimed from the faucet. Check /balance — if tokens haven't arrived yet, distribution may still be in progress.",
  faucetPendingDistribution:
    "⏳ Your claim is registered and distribution is in progress. Tokens appear in /balance shortly.",
  faucetConfirmCard: (ethBalance: string) =>
    `<b>🔎 Please review your faucet claim</b>\n\nClaim: free Sera test stablecoins → your wallet\n🌐 Sepolia Testnet\n\n⛽ Gas is paid in ETH (you have <b>${ethBalance}</b>).`,
  faucetClaiming: "Submitting your faucet claim… ⏳",
  faucetSuccess: (txUrl: string) =>
    `🎉 <b>Faucet claim confirmed!</b> <a href="${txUrl}">View the transaction</a>\n\nTokens are distributed in batches and can take a few minutes to appear — check /balance shortly.`,
  balanceMore: (n: number) =>
    `…and ${n} more tokens with a balance. Ask me about a specific token (e.g. “How much GYEN do I have?”) to see it.`,
  balanceVaultHint:
    "💡 <i>Wallet = tokens you hold directly. Vault = tokens deposited into Sera for limit orders.</i>",

  // ---- /rate ----
  ratePickPair: "📈 Choose a currency pair:",
  rateResult: (pair: string, rate: string, inverse: string, change: string) =>
    `📈 <b>${pair}</b>\n\nRate: <b>${rate}</b>\nInverse: ${inverse}\n24h change: ${change}`,
  rateUnavailable: "This rate is unavailable right now. Try another pair.",
  tradePairButton: "💱 Trade this pair",

  // ---- /liquidity ----
  liquidityChecking:
    "💧 Checking live swap liquidity across major pairs… (takes a few seconds)",
  liquidityResult: (networkLabel: string, lines: string, checked: number) =>
    `💧 <b>Swappable right now</b> (${networkLabel})\n\n${lines}\n\nChecked ${checked} pair directions. Pairs not listed have no liquidity — you can create some yourself by placing a limit order: /deposit → /order.`,
  liquidityNone: (networkLabel: string, checked: number) =>
    `💧 No major pair is swappable on ${networkLabel} right now (checked ${checked} directions).\n\nYou can create liquidity yourself: /deposit tokens into the vault, then place a limit order with /order — once it rests on the book, that pair becomes swappable.`,

  // ---- /swap ----
  swapPickFrom: "💱 Which token do you want to <b>pay with</b>?",
  swapPickTo: "Which token do you want to <b>receive</b>?",
  swapEnterAmount: (from: string, to: string, min: string | null) =>
    `How much <b>${from}</b> do you want to exchange into <b>${to}</b>?\n\nJust type a number (e.g. <code>100</code>).${
      min ? `\n📏 Minimum: <b>${min} ${from}</b>` : ""
    }`,
  swapBelowMin: (min: string, symbol: string) =>
    `⚠️ That's below the minimum trade size. Please enter at least <b>${min} ${symbol}</b>.`,
  swapInvalidAmount: (hint: string) =>
    `That doesn't look like a valid amount. ${hint}\nPlease type a plain number like <code>100</code> or <code>25.5</code>.`,
  swapQuoting: "Getting you the best price… ⏳",
  swapConfirmCard: (p: SwapCardParams) =>
    `<b>🔎 Please review your ${p.recipient ? "transfer" : "swap"}</b>\n\n` +
    `You pay: <b>${p.fromAmount} ${p.fromSymbol}</b>\n` +
    `You ${p.recipient ? "send" : "receive"} at least: <b>${p.minOutput} ${p.toSymbol}</b>\n` +
    `Rate: ${p.rate}\n` +
    `Fees: ${p.feeSummary} <i>(already included — no ETH needed)</i>\n` +
    (p.recipient
      ? `\n⚠️ Recipient (external address):\n<code>${p.recipient}</code>\n`
      : "") +
    `\n🌐 ${p.networkLabel}\n⏱ Price valid for ~${p.expiresInSec} seconds`,
  swapExecuting: "Signing and submitting your trade… ⏳",
  swapSuccess: (received: string, toSymbol: string) =>
    `✅ <b>Done!</b> You received <b>${received} ${toSymbol}</b>.\n\nCheck /balance to see your updated account.`,
  swapSuccessSent: (amount: string, toSymbol: string, recipient: string) =>
    `✅ <b>Sent!</b> <b>${amount} ${toSymbol}</b> is on its way to:\n<code>${recipient}</code>`,
  swapRequoted:
    "⚠️ The price moved before you confirmed, so I fetched a fresh quote. Please review again:",
  swapFailed: (reason: string) =>
    `❌ The trade could not be completed. ${reason}`,

  // ---- /send ----
  sendIntro:
    "🌏 <b>International transfer</b>\n\nSend money across currencies in one step: I'll exchange your stablecoin and deliver a different one straight to the recipient's address.",
  sendEnterRecipient:
    "Paste the <b>recipient's Ethereum address</b> (starts with 0x…).\n\n⚠️ Double-check it — blockchain transfers cannot be reversed.",
  sendInvalidAddress:
    "That doesn't look like a valid Ethereum address. It should start with <code>0x</code> and be 42 characters long.",
  sendSameToken:
    "Same-currency transfers aren't supported yet — pick a different receive token, or use an external wallet for plain transfers.",

  // ---- /order (limit orders) ----
  orderPickPair: "📊 Choose a market for your limit order:",
  orderPickSide: (base: string, quote: string) =>
    `Do you want to <b>buy</b> or <b>sell</b> ${base} (priced in ${quote})?\n\n💡 <i>A limit order waits on the order book until the market reaches your price — it may fill later or not at all.</i>`,
  orderSideLimited: (side: "bid" | "ask", base: string) =>
    side === "ask"
      ? `⚠️ Only <b>selling ${base}</b> is currently enabled for this pair.`
      : `⚠️ Only <b>buying ${base}</b> is currently enabled for this pair.`,
  orderPairUnavailable: (market: string) =>
    `⚠️ <b>${market}</b> is temporarily not accepting new orders. Please try another market.`,
  orderBuyButton: (base: string) => `📈 Buy ${base}`,
  orderSellButton: (base: string) => `📉 Sell ${base}`,
  orderEnterPrice: (quote: string, maxDecimals: number) =>
    `At what <b>price</b> (in ${quote})? Max ${maxDecimals} decimal places.\n\nType a number, e.g. <code>1.0850</code>.`,
  orderEnterAmount: (base: string, maxDecimals: number, min: string | null) =>
    `How much <b>${base}</b>? Max ${maxDecimals} decimal places.${
      min ? `\n📏 Minimum for this order: <b>${min} ${base}</b>` : ""
    }`,
  orderBelowMin: (min: string, base: string) =>
    `⚠️ That's below the minimum size for this pair. Please enter at least <b>${min} ${base}</b>.`,
  orderInvalidNumber: (maxDecimals: number) =>
    `Please enter a valid number with at most ${maxDecimals} decimal places.`,
  orderVaultShort: (needed: string, available: string, symbol: string) =>
    `⚠️ Your Sera vault balance is too low for this order.\n\nNeeded: <b>${needed} ${symbol}</b>\nAvailable in vault: <b>${available} ${symbol}</b>\n\nUse /deposit to move tokens from your wallet into the vault first.`,
  orderConfirmCard: (p: OrderCardParams) =>
    `<b>🔎 Please review your limit order</b>\n\n` +
    `Market: <b>${p.market}</b>\n` +
    `Action: <b>${p.side === "bid" ? `Buy ${p.baseSymbol}` : `Sell ${p.baseSymbol}`}</b>\n` +
    `Price: <b>${p.price} ${p.quoteSymbol}</b>\n` +
    `Amount: <b>${p.amount} ${p.baseSymbol}</b>\n\n` +
    `🌐 ${p.networkLabel}\n` +
    `💡 <i>The order rests on the book until filled or cancelled. Cancelling is possible 5 minutes after placement.</i>`,
  orderPlaced: (orderId: string) =>
    `✅ <b>Limit order placed!</b>\n\nOrder ID: <code>${orderId}</code>\n\nTrack it with /orders.`,
  orderFailed: (reason: string) => `❌ Order could not be placed. ${reason}`,

  // ---- /orders ----
  ordersTitle: (networkLabel: string) =>
    `📋 <b>Your orders</b> — ${networkLabel}`,
  ordersEmpty: "You have no orders on this network yet. Place one with /order.",
  orderLine: (
    market: string,
    side: string,
    price: string,
    amount: string,
    status: string,
  ) => `<b>${market}</b> ${side} ${amount} @ ${price} — <i>${status}</i>`,
  orderStatusButton: "🔍 Status",
  orderCancelButton: "🗑 Cancel",
  orderStatusDetail: (status: string, filled: string, remaining: string) =>
    `Status: <b>${status}</b>\nFilled: ${filled}\nRemaining: ${remaining}`,
  orderCancelConfirm: (market: string, price: string) =>
    `Cancel your <b>${market}</b> order at <b>${price}</b>?`,
  orderCancelled:
    "✅ Order cancelled. Any unfilled funds are released in your vault.",
  orderCancelCooldown: (minutes: number) =>
    `⏳ Orders can be cancelled starting 5 minutes after placement. Try again in about ${minutes} minute(s).`,

  // ---- /deposit ----
  depositIntro:
    "🏦 <b>Deposit to vault</b>\n\nLimit orders require funds in your Sera vault. This moves tokens from your wallet into the vault (they stay yours and can be withdrawn).",
  depositPickToken: "Which token do you want to deposit?",
  depositEnterAmount: (symbol: string) =>
    `How much <b>${symbol}</b> to deposit?`,
  depositGasWarning: (ethBalance: string) =>
    `⚠️ <b>This step needs a little ETH for gas</b> (unlike swaps).\n\nYour ETH balance: <b>${ethBalance}</b>`,
  depositNoGas:
    "❌ You have no ETH for gas. Send a small amount of ETH to your wallet address first (on Sepolia, use a faucet).",
  depositConfirmCard: (amount: string, symbol: string, networkLabel: string) =>
    `<b>🔎 Please review your deposit</b>\n\nDeposit: <b>${amount} ${symbol}</b> → Sera vault\n🌐 ${networkLabel}\n\n⛽ Gas is paid in ETH from your wallet.`,
  depositExecuting:
    "⏳ Depositing… Two transactions (approve + deposit) each need to be mined, so this takes about 1–2 minutes.",
  depositSubmitted: (txUrl: string) =>
    `✅ Deposit confirmed on-chain! <a href="${txUrl}">View the transaction</a>\n\nYour vault balance is updated — check it with /balance.`,

  // ---- /provide (Virtual Liquidity) ----
  provideIntro:
    "💧 <b>Provide liquidity</b>\n\nQuote several markets at once from <b>one shared budget</b> using a Sera Virtual Liquidity batch. Since the orders sit on different markets, only the largest one locks your funds — the rest reuse the same collateral.\n\nYour resting orders earn the spread when takers trade against them, and they make those pairs swappable for everyone.",
  provideNoVault:
    "You have no vault balance to provide with. Use /deposit first (and /faucet if you need test tokens).",
  providePickToken: "💰 Which vault token do you want to quote with?",
  providePickSpread:
    "📐 How far from the market rate should your quotes sit?\n\n<i>Tighter spread = fills more often, earns less per trade.</i>",
  provideEnterBudget: (symbol: string) =>
    `How much <b>${symbol}</b> as the shared budget? (Each market is quoted with the full amount; only the largest order is actually locked.)\n\nType a number, e.g. <code>100</code>.`,
  providePlanning: "Building your liquidity plan from live rates… ⏳",
  provideNoMarkets: (symbol: string) =>
    `No market can currently be quoted with <b>${symbol}</b> (a VL batch needs at least 2). Try another token — or check /liquidity for what's active.`,
  provideLegLine: (
    market: string,
    side: string,
    price: string,
    amount: string,
    base: string,
  ) =>
    `• <b>${market}</b> ${side === "ask" ? "sell" : "buy"} ${amount} ${base} @ ${price}`,
  providePlanCard: (p: {
    budget: string;
    symbol: string;
    legCount: number;
    lines: string;
    networkLabel: string;
  }) =>
    `<b>🔎 Review your liquidity batch</b>\n\nShared budget: <b>${p.budget} ${p.symbol}</b>\nQuoting ${p.legCount} markets:\n${p.lines}\n\n🌐 ${p.networkLabel}\n💡 Orders rest on the book until filled or cancelled. Cancel the whole batch anytime from /orders (5-min cooldown applies).`,
  provideExecuting: (n: number) =>
    `Signing ${n} orders and submitting the batch… ⏳`,
  provideSuccess: (n: number, batchId: string) =>
    `✅ <b>Liquidity live!</b> ${n} orders are now resting on the book from one shared budget.\n\nBatch ID: <code>${batchId}</code>\nManage them via /orders — you can cancel the whole batch with one tap.`,
  provideBatchCancelled:
    "✅ The whole batch is cancelled and your remaining budget is unfrozen.",
  provideCancelBatchButton: "🗑 Cancel whole VL batch",

  // ---- /network ----
  networkCurrent: (label: string) => `🌐 Current network: <b>${label}</b>`,
  networkPick: "Switch to:",
  networkSwitched: (label: string) => `✅ Switched to <b>${label}</b>.`,
  networkMainnetWarning:
    "⚠️ <b>Mainnet uses real funds.</b> Trades are irreversible and every mistake costs real money. Sepolia is recommended for practice.",

  // ---- /language ----
  languagePick: "🌍 Choose your language:",

  // ---- /help ----
  helpText:
    "<b>ℹ️ Sera FX Bot — Help</b>\n\n" +
    "<b>Commands</b>\n" +
    "/wallet — your address &amp; how to fund it\n" +
    "/balance — ETH + stablecoin balances\n" +
    "/faucet — free Sepolia test stablecoins\n" +
    "/rate — live FX rates\n" +
    "/swap — instant exchange (no ETH needed)\n" +
    "/send — exchange &amp; send to another address\n" +
    "/order — place a limit order\n" +
    "/orders — view / cancel your orders\n" +
    "/deposit — move tokens into the Sera vault\n" +
    "/network — switch Mainnet ⇄ Sepolia\n" +
    "/language — English / 日本語\n\n" +
    "<b>New to this? Three things to know</b>\n" +
    "1️⃣ <b>Stablecoin FX</b>: you trade tokens pegged 1:1 to real currencies (USDC≈USD, EURC≈EUR, JPYC≈JPY) on an on-chain order book — this is <i>spot</i> trading only, no leverage or margin.\n" +
    "2️⃣ <b>Swap vs limit order</b>: a swap executes instantly at the current price; a limit order waits on the book until the market reaches <i>your</i> price.\n" +
    "3️⃣ <b>Fees &amp; gas</b>: swap quotes already include all fees and gas — you never need ETH for a swap. Only vault deposits need a little ETH.\n\n" +
    "💬 You can also just <b>ask me anything</b> in plain language — e.g. “What is a stablecoin?” or “Exchange 100 USDC to euros”.",

  // ---- agent bridge ----
  agentUnavailable:
    "The assistant is unavailable right now, but all /commands still work.",
  agentConfirmHint:
    "👆 Review the details above and tap Confirm to execute, or Cancel to abort.",

  // ---- Sera error codes → human messages ----
  errInsufficientEquity:
    "Your vault balance is too low. Deposit more with /deposit or reduce the amount.",
  errStpBlocked:
    "You already have a resting order that would trade against this one (self-trade protection). Cancel it first via /orders.",
  errQuoteStale: "The price quote expired. Please try again for a fresh one.",
  errSlippage:
    "The market moved and your price can no longer be met. Try again.",
  errNoLiquidity:
    "There's currently not enough liquidity for this pair/amount. Check /liquidity to see which pairs are swappable right now, or try a smaller amount.",
  errAmountBelowMin:
    "The amount is below the minimum trade size for this pair.",
  errInvalidPrecision:
    "The amount or price has too many decimal places for this market.",
  errAllowance:
    "Token allowance is missing or too low — a deposit/approval step is required first.",
  errPairInactive: "This trading pair is temporarily disabled.",
  errTransient:
    "A temporary error occurred on the exchange. It's safe to retry.",
  errRateLimited:
    "Too many requests — please wait a few seconds and try again.",
  errDeadlineExpired:
    "The signed request expired before execution. Please try again.",
};

export type MessageCatalog = typeof en;
export type MessageKey = keyof MessageCatalog;
