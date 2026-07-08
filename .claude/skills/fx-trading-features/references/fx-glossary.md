# FX Glossary & Formulas

Accurate terminology and math for retail-FX-style features. Sourced from Japanese retail-broker
beginner materials (SBI証券, じぶん銀行, 松井証券 kabu.com, min-fx.jp) which converge on a
consistent, standard set of definitions — this is not brand-specific jargon, it's the common
vocabulary any FX trader or broker uses. Use this file as the source of truth when writing FX
math; do not derive these formulas from memory or general intuition, since off-by-one sign errors
(margin level vs. margin ratio, which side pays swap) are easy to get subtly wrong.

## Table of contents
1. [Currency pairs & pricing](#pairs)
2. [Leverage & margin](#leverage-margin)
3. [Margin call & loss-cut](#margin-call)
4. [Swap points](#swap)
5. [Spread](#spread)
6. [PnL calculation](#pnl)
7. [Order types](#orders)
8. [Regulatory context](#regulatory)

---

## 1. Currency pairs & pricing {#pairs}

A currency pair is quoted `BASE/QUOTE` (e.g. `USD/JPY`, `EUR/USD`). The quote tells you how much
of the quote currency is needed to buy one unit of the base currency.

- **Buying (going long) the pair**: buy base currency, sell quote currency. Profits if base
  strengthens against quote.
- **Selling (going short) the pair**: sell base currency, buy quote currency. Profits if base
  weakens against quote.
- **円高 (yen appreciation / "strong yen")**: fewer yen needed to buy one unit of foreign currency
  (e.g. USD/JPY moves 150 → 140). **円安 (yen depreciation / "weak yen")** is the reverse (150 →
  160). These are always described relative to the yen leg specifically — don't use 円高/円安 for
  non-JPY pairs.
- **Pip**: the standard smallest quoted price increment for display and P&L purposes —
  `0.0001` for most pairs, `0.01` for JPY-quote pairs (because JPY pairs are quoted with 2 decimal
  places instead of 4). `1 pip` movement in USD/JPY is a move from e.g. `150.00` to `150.01`.
  - **Do not conflate a pip with Sera's `priceIndex`/`tickSpace`.** Sera's price grid
    (`price = minPrice + tickSpace * priceIndex`) is a protocol-level implementation detail chosen
    per market; a pip is a trading-convention display unit. When building an FX-style UI on top of
    Sera, convert between the two explicitly — never assume `tickSpace == 1 pip`.
  - **Pip value** (profit/loss per pip per unit of base currency traded) depends on the pair
    and the account's settlement currency; compute it as
    `pipSize * positionSizeInBase / quoteToSettlementRate` (only the last term is needed when the
    quote currency IS the settlement currency).

## 2. Leverage & margin {#leverage-margin}

- **Leverage** = `positionNotionalValue / marginPosted`. E.g. positing $400 margin to hold a
  $10,000 notional position is 25× leverage.
- **Required margin** = `positionNotionalValue / leverage`.
- **Used margin (証拠金必要額)**: sum of required margin across all open positions.
- **Equity**: `accountBalance + unrealizedPnL` (realized cash balance adjusted for all currently
  open positions' floating P&L).
- **Free margin**: `equity - usedMargin` — the amount available to open new positions or absorb
  further adverse price movement.
- **Margin level (証拠金維持率)**: `equity / usedMargin * 100`, expressed as a percentage. This is
  the single most important risk metric a margin-trading UI/engine must compute correctly and
  continuously (on every price tick that affects unrealized PnL, not just on trade events).

## 3. Margin call & loss-cut {#margin-call}

Two distinct thresholds, both expressed as margin-level percentages, and commonly confused with
each other:

- **Margin call (マージンコール)**: a *warning* threshold (commonly ~100%, but broker-configurable)
  below which the trader is notified they should deposit more funds or reduce position size. No
  positions are closed automatically at this stage.
  - Note: some brokers use the English term "margin call" for the same warning-only concept
    described here; treat it as the warning threshold regardless of which term the user uses.
- **Loss-cut (ロスカット) / stop-out**: a *forced* threshold (commonly ~50%, but
  broker/product-configurable) at or below which the system automatically closes some or all open
  positions to prevent equity from going negative. This must be enforced by the system itself
  (an automated liquidation engine), not left to the trader's discretion — that's the entire point
  of the mechanism.
- **Never implement only one of these two.** A product with just a "margin call" that doesn't
  auto-close is not actually protecting against a blown account; a product with just a "loss-cut"
  and no earlier warning gives traders no chance to react. Treat both thresholds as required,
  independently configurable parameters — never derive one from the other with a fixed ratio
  unless the user explicitly wants that.

## 4. Swap points {#swap}

- **Swap point (スワップポイント)**: a daily credit or debit applied to an open position, reflecting
  the interest-rate differential between the two currencies in the pair, for holding the position
  overnight (across the daily rollover time).
- **Direction of sign**: if you are long the *higher-yielding* currency of the pair (against the
  lower-yielding one), you generally *receive* swap (positive, an income/インカムゲイン). If you are
  long the *lower-yielding* currency, you generally *pay* swap (negative). Going short a pair
  flips the sign relative to going long it. Always derive the sign from the actual interest-rate
  differential and position direction — never hardcode "swap is always positive" or assume a
  fixed sign per currency pair, since rate differentials change over time.
- **Swap is distinct from spread and from trading fees**: it accrues *daily while a position is
  held*, whereas spread is realized once at entry (implicit in the bid/ask difference) and trading
  fees (Sera's `feeBps`) are charged once per matched trade. A PnL reconciliation that mixes these
  up (e.g. double-counts the entry spread as if it were a fee, or drops swap accrual entirely for
  positions held over a rollover) will not balance against a manual calculation.

## 5. Spread {#spread}

- **Spread** = `askPrice - bidPrice`. This is the effective transaction cost of entering and
  immediately exiting a position, and is what most retail FX brokers cite as "trading cost" instead
  of (or in addition to) an explicit commission.
- On Sera's on-chain CLOB, the effective spread a taker experiences is whatever gap currently
  exists between best bid and best ask on the book — there is no broker-set spread to configure;
  it emerges from resting maker orders. Any "spread" figure surfaced in an FX-style UI on Sera
  should be computed live from the order book (best ask − best bid), not assumed to be constant.

## 6. PnL calculation {#pnl}

For a position opened at `entryPrice` with `positionSizeInBase`, direction `long`/`short`,
currently valued at `currentPrice`:

```
unrealizedPnL (in quote currency)
  = (currentPrice - entryPrice) * positionSizeInBase                  # long
  = (entryPrice - currentPrice) * positionSizeInBase                  # short
```

Convert to settlement/account currency if it differs from the quote currency. On realization
(closing the position), add/subtract accrued swap points and subtract any trading fees to get
realized PnL:

```
realizedPnL = unrealizedPnLAtClose + accumulatedSwapPoints - tradingFeesPaid
```

Keep these three terms (`price PnL`, `swap`, `fees`) as separate ledger line items in any
implementation — collapsing them into one number early makes debugging a mismatch (user disputes
their P&L) much harder later.

## 7. Order types {#orders}

| Order type | Japanese | Behavior | Sera support |
|---|---|---|---|
| Market | 成行注文 | Executes immediately at best available price | v1 & v2 native |
| Limit | 指値注文 | Rests until price reaches (or betters) the specified level | v1 & v2 native |
| Stop / stop-loss | 逆指値注文 | Triggers a market or limit order once price crosses a trigger level *against* the position, capping loss | **Not native — see order-types-and-triggers.md** |
| Take-profit | 利益確定注文 | Triggers a close once price crosses a trigger level *in favor of* the position | **Not native — see order-types-and-triggers.md** |
| OCO (One Cancels the Other) | OCO注文 | A stop-loss and take-profit submitted as a pair; whichever triggers first cancels the other | **Not native — composed from two conditional orders, see order-types-and-triggers.md** |
| Trailing stop | トレーリングストップ | A stop level that moves with favorable price movement, locking in gains | **Not native — see order-types-and-triggers.md** |

## 8. Regulatory context {#regulatory}

Japanese retail FX brokers operate under FSA (金融庁) regulation, which currently caps leverage for
individual traders at 25× and requires broker registration. This is real, relevant context for
*why* a 25× cap shows up repeatedly in Japanese beginner materials — but it is a jurisdiction- and
license-specific rule, not a universal FX constant. When implementing leverage limits, loss-cut
thresholds, or any other regulatory-flavored parameter on top of Sera (which is an on-chain,
non-custodial-by-design protocol, not a licensed broker), make the value configurable and mention
the regulatory origin to the user rather than silently hardcoding a jurisdiction's rule as if it
were a protocol invariant.
