/**
 * Japanese message catalog. Must cover every key of the English catalog —
 * enforced at compile time via the MessageCatalog type annotation.
 */

import type { MessageCatalog, OrderCardParams, SwapCardParams } from "./en";

export const ja: MessageCatalog = {
  // ---- common ----
  confirmButton: "✅ 実行する",
  cancelButton: "❌ キャンセル",
  backButton: "« 戻る",
  refreshButton: "🔄 更新",
  cancelled: "キャンセルしました。何も実行されていません。",
  actionExpired:
    "⏱ この確認は期限切れです（価格の有効期間は短時間です）。もう一度やり直して最新の価格を取得してください。",
  actionAlreadyUsed: "この操作はすでに実行またはキャンセル済みです。",
  errorGeneric:
    "こちら側で問題が発生しました。少し待ってからもう一度お試しください。",
  notOnboarded: "まず /start を実行してウォレットを設定してください。",
  networkBadge: (label: string) => `🌐 ${label}`,

  // ---- /start onboarding ----
  chooseLanguage: "🌍 Choose your language / 言語を選んでください",
  languageSet: "言語を日本語に設定しました。🇯🇵",
  startWelcome:
    "👋 <b>Sera FX Bot へようこそ！</b>\n\n" +
    "ここでは <b>ステーブルコイン</b>（米ドルやユーロ、日本円などの実際の通貨に連動したデジタルトークン）を、Ethereum ブロックチェーン上で直接両替できます。ポケットの中の外貨両替所のようなものです。\n\n" +
    "暗号資産の経験は不要です：\n" +
    "• 安全なウォレットを自動作成 — シードフレーズの暗記は不要\n" +
    "• スワップにガス代の ETH は不要 — 手数料は提示価格に含まれます\n" +
    "• すべての取引は実行前に確認画面を表示します\n\n" +
    "まずはウォレットを作成しましょう。",
  createWalletButton: "🪪 ウォレットを作成",
  walletCreating: "ウォレットを作成しています… ⏳",
  walletCreated: (address: string) =>
    `🎉 <b>ウォレットの準備ができました！</b>\n\nアドレス:\n<code>${address}</code>\n\n` +
    "これはあなた専用の Ethereum アドレスです。ここにステーブルコインを送ると取引を始められます。\n\n" +
    "/help で使い方を確認するか、そのまま日本語で質問してみてください！",
  welcomeBack: (address: string, networkLabel: string) =>
    `👋 おかえりなさい！\n\nウォレット: <code>${address}</code>\n🌐 ${networkLabel}\n\n/help でコマンド一覧を確認できます。`,
  onboardingApiKey: "安全な API アクセスを設定しています… 🔐",

  // ---- /wallet ----
  walletInfo: (address: string, networkLabel: string, explorerUrl: string) =>
    `🪪 <b>あなたのウォレット</b>\n\nアドレス:\n<code>${address}</code>\n\n🌐 ${networkLabel}\n🔍 <a href="${explorerUrl}">Etherscan で見る</a>\n\n` +
    "💡 このアドレスにステーブルコイン（例: USDC）を送ると残高に反映されます。",

  // ---- /balance ----
  balanceTitle: (networkLabel: string) =>
    `💰 <b>アカウントサマリー</b> — ${networkLabel}`,
  balanceNative: (eth: string) => `⛽ ETH（ガス用）: <b>${eth}</b>`,
  balanceHeader: "ステーブルコイン:",
  balanceRow: (
    symbol: string,
    wallet: string,
    vaultAvailable: string,
    vaultFrozen: string,
  ) =>
    `• <b>${symbol}</b> — ウォレット: ${wallet} | ボールト: ${vaultAvailable}${
      vaultFrozen !== "0" ? `（凍結中: ${vaultFrozen}）` : ""
    }`,
  balanceEmpty:
    "まだステーブルコインの残高がありません。ウォレットアドレス（/wallet で確認）にトークンを送ってください。",
  balanceEmptySepoliaHint:
    "⚠️ <b>Sepolia での注意:</b> Circle faucet の USDC は<i>別のトークン</i>のため、Sera では使えません。/faucet で Sera のテスト用ステーブルコインを無料で入手できます！",

  // ---- /faucet (Sepolia test tokens) ----
  faucetIntro:
    "🚰 <b>Sera テストトークン faucet</b>\n\nSepolia で Sera のテスト用ステーブルコイン（USDC・EURC・JPYC など）のスターターパックを無料で受け取れます。1ウォレットにつき1回です。\n\n⛽ クレイムのトランザクションには少額の Sepolia ETH（ガス代）が必要です。",
  faucetOnlySepolia:
    "faucet は Sepolia 専用です。まず /network で切り替えてください。",
  faucetAlreadyClaimed:
    "✅ このウォレットは faucet からクレイム済みです。/balance を確認してください — まだ届いていない場合は配布処理中の可能性があります。",
  faucetPendingDistribution:
    "⏳ クレイムは受付済みで、配布処理中です。まもなく /balance に反映されます。",
  faucetConfirmCard: (ethBalance: string) =>
    `<b>🔎 faucet クレイムの確認</b>\n\n受け取り: Sera テスト用ステーブルコイン → あなたのウォレット\n🌐 Sepolia Testnet\n\n⛽ ガス代は ETH から支払われます（残高: <b>${ethBalance}</b>）。`,
  faucetClaiming: "faucet クレイムを送信しています… ⏳",
  faucetSuccess: (txUrl: string) =>
    `🎉 <b>faucet クレイム完了！</b> <a href="${txUrl}">トランザクションを確認</a>\n\nトークンはバッチ処理で配布されるため、反映まで数分かかることがあります。しばらくしてから /balance で確認してください。`,
  balanceMore: (n: number) =>
    `…ほか ${n} トークンに残高があります。特定のトークンについては「GYEN はいくら持ってる？」のように質問してください。`,
  balanceVaultHint:
    "💡 <i>ウォレット = 直接保有しているトークン。ボールト = 指値注文用に Sera に預けたトークン。</i>",

  // ---- /rate ----
  ratePickPair: "📈 通貨ペアを選んでください:",
  rateResult: (pair: string, rate: string, inverse: string, change: string) =>
    `📈 <b>${pair}</b>\n\nレート: <b>${rate}</b>\n逆レート: ${inverse}\n24時間変動: ${change}`,
  rateUnavailable: "このレートは現在取得できません。別のペアをお試しください。",
  tradePairButton: "💱 このペアで取引",

  // ---- /liquidity ----
  liquidityChecking:
    "💧 主要ペアのスワップ流動性を確認しています…（数秒かかります）",
  liquidityResult: (networkLabel: string, lines: string, checked: number) =>
    `💧 <b>いまスワップ可能なペア</b>（${networkLabel}）\n\n${lines}\n\n${checked} 方向を確認しました。表示のないペアは流動性がありません — /deposit → /order で指値を板に置けば、自分でそのペアの流動性を作れます。`,
  liquidityNone: (networkLabel: string, checked: number) =>
    `💧 現在 ${networkLabel} でスワップ可能な主要ペアはありません（${checked} 方向を確認）。\n\n流動性は自分で作れます: /deposit でボールトに入金し、/order で指値注文を板に置くと、そのペアがスワップ可能になります。`,

  // ---- /swap ----
  swapPickFrom: "💱 <b>支払いに使う</b>トークンはどれですか？",
  swapPickTo: "<b>受け取りたい</b>トークンはどれですか？",
  swapEnterAmount: (from: string, to: string, min: string | null) =>
    `<b>${from}</b> をいくら <b>${to}</b> に両替しますか？\n\n数字を入力してください（例: <code>100</code>）。${
      min ? `\n📏 最小取引額: <b>${min} ${from}</b>` : ""
    }`,
  swapBelowMin: (min: string, symbol: string) =>
    `⚠️ 最小取引額を下回っています。<b>${min} ${symbol}</b> 以上を入力してください。`,
  swapInvalidAmount: (hint: string) =>
    `金額として認識できませんでした。${hint}\n<code>100</code> や <code>25.5</code> のような数字を入力してください。`,
  swapQuoting: "最良価格を取得しています… ⏳",
  swapConfirmCard: (p: SwapCardParams) =>
    `<b>🔎 ${p.recipient ? "送金" : "スワップ"}内容の確認</b>\n\n` +
    `支払い: <b>${p.fromAmount} ${p.fromSymbol}</b>\n` +
    `${p.recipient ? "送金額" : "受取額"}（最低保証）: <b>${p.minOutput} ${p.toSymbol}</b>\n` +
    `レート: ${p.rate}\n` +
    `手数料: ${p.feeSummary} <i>（価格に込み — ETH 不要）</i>\n` +
    (p.recipient
      ? `\n⚠️ 送金先（外部アドレス）:\n<code>${p.recipient}</code>\n`
      : "") +
    `\n🌐 ${p.networkLabel}\n⏱ この価格の有効期間は約 ${p.expiresInSec} 秒です`,
  swapExecuting: "署名して取引を送信しています… ⏳",
  swapSuccess: (received: string, toSymbol: string) =>
    `✅ <b>完了！</b> <b>${received} ${toSymbol}</b> を受け取りました。\n\n/balance で最新の残高を確認できます。`,
  swapSuccessSent: (amount: string, toSymbol: string, recipient: string) =>
    `✅ <b>送金しました！</b> <b>${amount} ${toSymbol}</b> を以下のアドレスへ送付中です:\n<code>${recipient}</code>`,
  swapRequoted:
    "⚠️ 確認前に価格が変動したため、新しい見積もりを取得しました。もう一度ご確認ください:",
  swapFailed: (reason: string) => `❌ 取引を完了できませんでした。${reason}`,

  // ---- /send ----
  sendIntro:
    "🌏 <b>国際送金</b>\n\n通貨をまたいだ送金をワンステップで。お手持ちのステーブルコインを両替し、別の通貨のまま相手のアドレスへ直接届けます。",
  sendEnterRecipient:
    "<b>受取人の Ethereum アドレス</b>（0x… で始まる）を貼り付けてください。\n\n⚠️ 必ず再確認を — ブロックチェーンの送金は取り消せません。",
  sendInvalidAddress:
    "Ethereum アドレスとして認識できませんでした。<code>0x</code> で始まる42文字の文字列です。",
  sendSameToken:
    "同一通貨の送金はまだ対応していません。別の受取トークンを選ぶか、通常の送金には外部ウォレットをご利用ください。",

  // ---- /order (limit orders) ----
  orderPickPair: "📊 指値注文を出すマーケットを選んでください:",
  orderPickSide: (base: string, quote: string) =>
    `${base} を<b>買い</b>ますか、<b>売り</b>ますか？（価格は ${quote} 建て）\n\n💡 <i>指値注文は、市場価格があなたの指定価格に達するまで注文板で待機します。約定は後になるか、成立しない場合もあります。</i>`,
  orderSideLimited: (side: "bid" | "ask", base: string) =>
    side === "ask"
      ? `⚠️ このペアでは現在 <b>${base} の売り</b>のみ受け付けています。`
      : `⚠️ このペアでは現在 <b>${base} の買い</b>のみ受け付けています。`,
  orderPairUnavailable: (market: string) =>
    `⚠️ <b>${market}</b> は現在新規注文を受け付けていません。別のマーケットをお試しください。`,
  orderBuyButton: (base: string) => `📈 ${base} を買う`,
  orderSellButton: (base: string) => `📉 ${base} を売る`,
  orderEnterPrice: (quote: string, maxDecimals: number) =>
    `<b>価格</b>（${quote} 建て）を入力してください。小数点以下は最大 ${maxDecimals} 桁です。\n\n例: <code>1.0850</code>`,
  orderEnterAmount: (base: string, maxDecimals: number, min: string | null) =>
    `<b>${base}</b> の数量を入力してください。小数点以下は最大 ${maxDecimals} 桁です。${
      min ? `\n📏 この注文の最小数量: <b>${min} ${base}</b>` : ""
    }`,
  orderBelowMin: (min: string, base: string) =>
    `⚠️ このペアの最小数量を下回っています。<b>${min} ${base}</b> 以上を入力してください。`,
  orderInvalidNumber: (maxDecimals: number) =>
    `小数点以下 ${maxDecimals} 桁以内の有効な数字を入力してください。`,
  orderVaultShort: (needed: string, available: string, symbol: string) =>
    `⚠️ この注文には Sera ボールトの残高が不足しています。\n\n必要額: <b>${needed} ${symbol}</b>\nボールト残高: <b>${available} ${symbol}</b>\n\nまず /deposit でウォレットからボールトにトークンを移してください。`,
  orderConfirmCard: (p: OrderCardParams) =>
    `<b>🔎 指値注文の確認</b>\n\n` +
    `マーケット: <b>${p.market}</b>\n` +
    `売買: <b>${p.side === "bid" ? `${p.baseSymbol} を買う` : `${p.baseSymbol} を売る`}</b>\n` +
    `価格: <b>${p.price} ${p.quoteSymbol}</b>\n` +
    `数量: <b>${p.amount} ${p.baseSymbol}</b>\n\n` +
    `🌐 ${p.networkLabel}\n` +
    `💡 <i>注文は約定またはキャンセルまで板に残ります。キャンセルは発注の5分後から可能です。</i>`,
  orderPlaced: (orderId: string) =>
    `✅ <b>指値注文を発注しました！</b>\n\n注文 ID: <code>${orderId}</code>\n\n/orders で状況を確認できます。`,
  orderFailed: (reason: string) => `❌ 注文を発注できませんでした。${reason}`,

  // ---- /orders ----
  ordersTitle: (networkLabel: string) =>
    `📋 <b>あなたの注文</b> — ${networkLabel}`,
  ordersEmpty:
    "このネットワークにはまだ注文がありません。/order で発注できます。",
  orderLine: (
    market: string,
    side: string,
    price: string,
    amount: string,
    status: string,
  ) => `<b>${market}</b> ${side} ${amount} @ ${price} — <i>${status}</i>`,
  orderStatusButton: "🔍 状況",
  orderCancelButton: "🗑 キャンセル",
  orderStatusDetail: (status: string, filled: string, remaining: string) =>
    `状態: <b>${status}</b>\n約定済み: ${filled}\n残り: ${remaining}`,
  orderCancelConfirm: (market: string, price: string) =>
    `<b>${market}</b> の <b>${price}</b> の注文をキャンセルしますか？`,
  orderCancelled:
    "✅ 注文をキャンセルしました。未約定分の資金はボールトで利用可能になります。",
  orderCancelCooldown: (minutes: number) =>
    `⏳ 注文のキャンセルは発注から5分後に可能になります。あと約 ${minutes} 分お待ちください。`,

  // ---- /deposit ----
  depositIntro:
    "🏦 <b>ボールトへの入金</b>\n\n指値注文には Sera ボールト内の資金が必要です。ウォレットからボールトへトークンを移します（所有権はあなたのままで、引き出しも可能です）。",
  depositPickToken: "どのトークンを入金しますか？",
  depositEnterAmount: (symbol: string) =>
    `<b>${symbol}</b> をいくら入金しますか？`,
  depositGasWarning: (ethBalance: string) =>
    `⚠️ <b>この操作には少額の ETH（ガス代）が必要です</b>（スワップとは異なります）。\n\nあなたの ETH 残高: <b>${ethBalance}</b>`,
  depositNoGas:
    "❌ ガス代用の ETH がありません。まずウォレットアドレスに少額の ETH を送ってください（Sepolia の場合は faucet を利用）。",
  depositConfirmCard: (amount: string, symbol: string, networkLabel: string) =>
    `<b>🔎 入金内容の確認</b>\n\n入金: <b>${amount} ${symbol}</b> → Sera ボールト\n🌐 ${networkLabel}\n\n⛽ ガス代はウォレットの ETH から支払われます。`,
  depositExecuting:
    "⏳ 入金処理中… approve と入金の2つのトランザクションのマイニングを待つため、1〜2分ほどかかります。",
  depositSubmitted: (txUrl: string) =>
    `✅ 入金がオンチェーンで確定しました！ <a href="${txUrl}">トランザクションを確認</a>\n\nボールト残高に反映済みです。/balance で確認できます。`,

  // ---- /provide (Virtual Liquidity) ----
  provideIntro:
    "💧 <b>流動性を提供</b>\n\nSera の Virtual Liquidity バッチを使い、<b>1つの共有予算</b>で複数マーケットに同時に気配（指値）を出せます。注文はそれぞれ別マーケットに置かれるため、実際にロックされるのは最大の1本分だけ — 残りは同じ担保を使い回します。\n\n板に載った注文はテイカーとの約定でスプレッド分の収益になり、そのペアを誰でもスワップできるようにします。",
  provideNoVault:
    "ボールト残高がありません。まず /deposit で入金してください（テストトークンは /faucet で入手できます）。",
  providePickToken: "💰 どのボールトトークンで気配を出しますか？",
  providePickSpread:
    "📐 市場レートからどれくらい離して気配を出しますか？\n\n<i>スプレッドが狭いほど約定しやすく、1回あたりの収益は小さくなります。</i>",
  provideEnterBudget: (symbol: string) =>
    `共有予算にする <b>${symbol}</b> の量を入力してください。（各マーケットに全額分の気配を出しますが、実際にロックされるのは最大の1本分のみです）\n\n例: <code>100</code>`,
  providePlanning: "ライブレートから流動性プランを作成しています… ⏳",
  provideNoMarkets: (symbol: string) =>
    `現在 <b>${symbol}</b> で気配を出せるマーケットがありません（VL バッチには最低2つ必要です）。別のトークンを試すか、/liquidity で状況を確認してください。`,
  provideLegLine: (
    market: string,
    side: string,
    price: string,
    amount: string,
    base: string,
  ) =>
    `• <b>${market}</b> ${side === "ask" ? "売り" : "買い"} ${amount} ${base} @ ${price}`,
  providePlanCard: (p: {
    budget: string;
    symbol: string;
    legCount: number;
    lines: string;
    networkLabel: string;
  }) =>
    `<b>🔎 流動性バッチの確認</b>\n\n共有予算: <b>${p.budget} ${p.symbol}</b>\n${p.legCount} マーケットに気配を出します:\n${p.lines}\n\n🌐 ${p.networkLabel}\n💡 注文は約定またはキャンセルまで板に残ります。/orders からバッチ全体をいつでもキャンセルできます（5分クールダウンあり）。`,
  provideExecuting: (n: number) =>
    `${n} 件の注文に署名してバッチを送信しています… ⏳`,
  provideSuccess: (n: number, batchId: string) =>
    `✅ <b>流動性の提供を開始しました！</b> ${n} 件の注文が共有予算から板に載っています。\n\nバッチ ID: <code>${batchId}</code>\n/orders から管理でき、ワンタップでバッチ全体をキャンセルできます。`,
  provideBatchCancelled:
    "✅ バッチ全体をキャンセルし、残りの予算の凍結を解除しました。",
  provideCancelBatchButton: "🗑 VL バッチ全体をキャンセル",

  // ---- /network ----
  networkCurrent: (label: string) => `🌐 現在のネットワーク: <b>${label}</b>`,
  networkPick: "切り替え先:",
  networkSwitched: (label: string) => `✅ <b>${label}</b> に切り替えました。`,
  networkMainnetWarning:
    "⚠️ <b>メインネットでは実際の資金を使用します。</b>取引は取り消せず、ミスは実際の損失になります。練習には Sepolia をおすすめします。",

  // ---- /language ----
  languagePick: "🌍 言語を選んでください:",

  // ---- /help ----
  helpText:
    "<b>ℹ️ Sera FX Bot — ヘルプ</b>\n\n" +
    "<b>コマンド</b>\n" +
    "/wallet — アドレスの確認と入金方法\n" +
    "/balance — ETH とステーブルコインの残高\n" +
    "/faucet — Sepolia テストトークンを無料入手\n" +
    "/rate — リアルタイム為替レート\n" +
    "/swap — 即時両替（ETH 不要）\n" +
    "/send — 両替して別のアドレスへ送金\n" +
    "/order — 指値注文を発注\n" +
    "/orders — 注文の確認・キャンセル\n" +
    "/deposit — Sera ボールトへ入金\n" +
    "/network — メインネット ⇄ Sepolia 切替\n" +
    "/language — English / 日本語\n\n" +
    "<b>はじめての方へ：3つのポイント</b>\n" +
    "1️⃣ <b>ステーブルコイン FX</b>: 実際の通貨に1:1で連動するトークン（USDC≈米ドル、EURC≈ユーロ、JPYC≈日本円）をオンチェーンの注文板で取引します。<i>現物</i>取引のみで、レバレッジや証拠金取引はありません。\n" +
    "2️⃣ <b>スワップと指値注文</b>: スワップは現在価格で即時に実行。指値注文は市場が<i>あなたの</i>価格に達するまで板で待機します。\n" +
    "3️⃣ <b>手数料とガス代</b>: スワップの見積もりには手数料とガス代がすべて含まれます — スワップに ETH は不要です。ボールトへの入金のみ少額の ETH が必要です。\n\n" +
    "💬 「ステーブルコインって何？」「100 USDC をユーロに両替して」のように、<b>日本語でそのまま質問・依頼</b>もできます。",

  // ---- agent bridge ----
  agentUnavailable:
    "アシスタントは現在利用できませんが、/コマンドはすべて利用可能です。",
  agentConfirmHint:
    "👆 上記の内容を確認し、「実行する」で実行、「キャンセル」で中止してください。",

  // ---- Sera error codes → human messages ----
  errInsufficientEquity:
    "ボールト残高が不足しています。/deposit で入金するか、金額を減らしてください。",
  errStpBlocked:
    "この注文と約定してしまう自分の注文が板に残っています（自己取引防止）。/orders から先にキャンセルしてください。",
  errQuoteStale:
    "価格の見積もりが期限切れになりました。もう一度お試しください。",
  errSlippage:
    "相場が変動し、指定価格での約定ができなくなりました。もう一度お試しください。",
  errNoLiquidity:
    "現在このペア/金額に十分な流動性がありません。/liquidity でいまスワップ可能なペアを確認するか、金額を減らしてお試しください。",
  errAmountBelowMin: "金額がこのペアの最小取引額を下回っています。",
  errInvalidPrecision:
    "金額または価格の小数点以下の桁数がこのマーケットの上限を超えています。",
  errAllowance:
    "トークンの承認（アローワンス）が不足しています。先に入金・承認の手続きが必要です。",
  errPairInactive: "この通貨ペアは一時的に取引停止中です。",
  errTransient:
    "取引所側で一時的なエラーが発生しました。再試行しても安全です。",
  errRateLimited:
    "リクエストが多すぎます。数秒待ってからもう一度お試しください。",
  errDeadlineExpired:
    "署名済みリクエストが実行前に期限切れになりました。もう一度お試しください。",
};
